from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import json
from pathlib import Path
from datetime import datetime

app = FastAPI(title="SpendScope API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent.parent / "data" / "processed"

@app.get("/")
def root():
    return {"status": "SpendScope API is running"}

@app.get("/api/transactions")
def get_transactions():
    json_path = DATA_DIR / "transactions_frontend.json"
    if json_path.exists():
        with open(json_path, 'r') as f:
            data = json.load(f)
        return data
    return {"error": "No data found. Please upload a bank statement."}

@app.get("/api/summary")
def get_summary():
    json_path = DATA_DIR / "transactions_frontend.json"
    if not json_path.exists():
        return {"error": "No data found"}
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    total_in = sum(t['money_in'] for t in data if t['direction'] == 'IN')
    total_out = sum(t['money_out'] for t in data if t['direction'] == 'OUT')
    
    categories = {}
    for t in data:
        if t['direction'] == 'OUT':
            categories[t['category']] = categories.get(t['category'], 0) + t['money_out']
    
    top_category = max(categories, key=categories.get) if categories else 'None'
    
    return {
        "total_income": round(total_in, 2),
        "total_spending": round(total_out, 2),
        "net": round(total_in - total_out, 2),
        "transactions": len(data),
        "top_category": top_category,
        "categories": {k: round(v, 2) for k, v in sorted(categories.items(), key=lambda x: -x[1])},
    }

@app.post("/api/upload")
async def upload_statement(file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename
    return {
        "status": "received",
        "filename": filename,
        "size_bytes": len(contents),
        "message": f"Received {filename}. CSV parsing happens client-side."
    }


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Parse a Lloyds bank statement PDF and return transactions as JSON.
    
    PyMuPDF extracts Lloyds PDFs as labeled multi-line fields:
        Date
        02 Jan 26.
        Description
        UBER UK RIDES.
        Type
        DEB.
        Money In (£)
        blank.
        Money Out (£)
        8.30.
        Balance (£)
        31.66.
    
    This parser reads those labels as a state machine.
    """
    import fitz

    content = await file.read()
    
    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        return {"error": f"Could not open PDF: {str(e)}"}

    transactions = []

    for page in doc:
        text = page.get_text()
        lines = text.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            if line == 'Date' and i + 1 < len(lines):
                date_val = lines[i + 1].strip().rstrip('.')
                
                try:
                    dt = datetime.strptime(date_val, '%d %b %y')
                    date_iso = dt.strftime('%Y-%m-%d')
                except ValueError:
                    i += 1
                    continue
                
                desc = ''
                type_code = ''
                money_in = 0
                money_out = 0
                balance = 0
                
                j = i + 2
                while j < len(lines) and j < i + 20:
                    field = lines[j].strip()
                    
                    if field == 'Description' and j + 1 < len(lines):
                        desc = lines[j + 1].strip().rstrip('.')
                        if desc == 'blank' or desc == '':
                            desc = '[REDACTED]'
                        j += 2
                        continue
                    elif field == 'Type' and j + 1 < len(lines):
                        type_code = lines[j + 1].strip().rstrip('.')
                        j += 2
                        continue
                    elif field.startswith('Money In') and j + 1 < len(lines):
                        val = lines[j + 1].strip().rstrip('.')
                        if val != 'blank' and val != '':
                            try:
                                money_in = float(val.replace(',', ''))
                            except ValueError:
                                money_in = 0
                        j += 2
                        continue
                    elif field.startswith('Money Out') and j + 1 < len(lines):
                        val = lines[j + 1].strip().rstrip('.')
                        if val != 'blank' and val != '':
                            try:
                                money_out = float(val.replace(',', ''))
                            except ValueError:
                                money_out = 0
                        j += 2
                        continue
                    elif field.startswith('Balance') and j + 1 < len(lines):
                        val = lines[j + 1].strip().rstrip('.')
                        if val != 'blank' and val != '':
                            try:
                                balance = float(val.replace(',', ''))
                            except ValueError:
                                balance = 0
                        j += 2
                        break
                    else:
                        j += 1
                        continue
                
                direction = 'IN' if money_in > 0 and money_out == 0 else 'OUT'
                
                if money_in > 0 or money_out > 0:
                    transactions.append({
                        "date_iso": date_iso,
                        "description": desc,
                        "merchant": desc,
                        "category": "",
                        "type": type_code,
                        "money_in": round(money_in, 2),
                        "money_out": round(money_out, 2),
                        "balance": round(balance, 2),
                        "direction": direction,
                    })
                
                i = j
            else:
                i += 1

    doc.close()
    transactions.sort(key=lambda x: x['date_iso'])
    return transactions