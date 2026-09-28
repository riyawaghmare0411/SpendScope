"""Plan-engine endpoints (Wave 2 of the MoneyMap integration): the FROZEN JSON CONTRACT
5 Wave-1 frontend pages (Today/Future/Simulate/Accounts/Budgets) were built against.

Route paths, methods, field names and response shapes here are load-bearing -- see the
Wave-2 plan for the exact contract. HTTP/CRUD concerns (parsing the body, 404/400s,
ownership checks) live here, mirroring routes/accounts.py's style; anything that touches
a pure plan-engine module (finance/cash/simulator/recurrence) or needs a money-safe JSON
conversion goes through src.plan_service instead.
"""

import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete as sa_delete, select

from src import plan_models
from src import plan_service as svc
from src.auth import get_current_user
from src.database import get_db
from src.models import Account, Budget, User
from src.money import MoneyValidationError, parse_amount

router = APIRouter()


def _uuid_or_400(value: str, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(400, f"Invalid {field}")


async def _validate_account_id(db, user_id: uuid.UUID, account_id) -> None:
    if account_id is None:
        return
    aid = _uuid_or_400(str(account_id), "account_id")
    account = await db.get(Account, aid)
    if not account or account.user_id != user_id:
        raise HTTPException(400, "Invalid account_id")


def _optional_int(value, field: str):
    """None passes through; anything else must be a real int, not a string that merely
    looks numeric to a client -- a bad value here would otherwise reach an INTEGER column
    and crash with a raw 500 instead of a clean 400."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise HTTPException(400, f"{field} must be an integer")
    return value


# ---------- Today / Forecast / Simulate / Overspend ----------

@router.get("/api/plan/today")
async def get_today(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        return await svc.build_today(db, user_id)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))


@router.get("/api/plan/forecast")
async def get_forecast(days: int = Query(30, ge=1, le=365), current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        return await svc.build_forecast_response(db, user_id, days)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))


@router.post("/api/plan/simulate")
async def post_simulate(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    body = await request.json()
    try:
        return await svc.run_simulation(db, user_id, body)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))


@router.post("/api/plan/overspend")
async def post_overspend(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    body = await request.json()
    try:
        return await svc.run_overspend(db, user_id, body)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))


# ---------- Settings ----------

@router.get("/api/plan/settings")
async def get_settings(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    settings = await db.get(plan_models.PlanSettings, user_id)
    return svc.settings_to_dict(user, settings)


@router.put("/api/plan/settings")
async def put_settings(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    body = await request.json()
    try:
        return await svc.update_settings(db, user_id, body)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))


# ---------- Recurring items ----------

@router.get("/api/plan/recurring")
async def list_recurring(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    user = await db.get(User, user_id)
    as_of = svc.today_for_user(user)
    await svc.refresh_recurring_suggestions(db, user_id, as_of)
    rows = await svc.fetch_all_recurring(db, user_id)
    return {"items": [svc.recurring_row_to_dict(r, as_of) for r in rows]}


@router.post("/api/plan/recurring")
async def create_recurring(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    body = await request.json()

    label = (body.get("label") or "").strip()
    direction = body.get("direction")
    cadence = body.get("cadence")
    currency = body.get("currency")
    if not label or direction not in ("IN", "OUT") or not cadence or not currency:
        raise HTTPException(400, "label, direction (IN|OUT), cadence and currency are required")

    try:
        amount = parse_amount(body.get("amount"), currency)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))

    await _validate_account_id(db, user_id, body.get("account_id"))

    row = plan_models.RecurringRule(
        user_id=user_id,
        account_id=uuid.UUID(body["account_id"]) if body.get("account_id") else None,
        label=label,
        direction=direction,
        cadence=cadence,
        anchor_day=_optional_int(body.get("anchor_day"), "anchor_day"),
        anchor_weekday=_optional_int(body.get("anchor_weekday"), "anchor_weekday"),
        amount=float(amount),
        currency=currency,
        status="confirmed",
        source="manual",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    user = await db.get(User, user_id)
    return svc.recurring_row_to_dict(row, svc.today_for_user(user))


@router.patch("/api/plan/recurring/{rule_id}")
async def update_recurring(rule_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    rid = _uuid_or_400(rule_id)
    row = await db.get(plan_models.RecurringRule, rid)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Recurring rule not found")

    body = await request.json()

    if "currency" in body and body["currency"]:
        row.currency = body["currency"]
    if "amount" in body:
        try:
            row.amount = float(parse_amount(body["amount"], row.currency))
        except MoneyValidationError as e:
            raise HTTPException(400, str(e))
    if "label" in body and body["label"]:
        row.label = body["label"].strip()
    if "direction" in body:
        if body["direction"] not in ("IN", "OUT"):
            raise HTTPException(400, "direction must be IN or OUT")
        row.direction = body["direction"]
    if "cadence" in body and body["cadence"]:
        row.cadence = body["cadence"]
    if "anchor_day" in body:
        row.anchor_day = _optional_int(body["anchor_day"], "anchor_day")
    if "anchor_weekday" in body:
        row.anchor_weekday = _optional_int(body["anchor_weekday"], "anchor_weekday")
    if "account_id" in body:
        await _validate_account_id(db, user_id, body["account_id"])
        row.account_id = uuid.UUID(body["account_id"]) if body["account_id"] else None
    if "status" in body:
        if body["status"] not in ("suggested", "confirmed", "dismissed"):
            raise HTTPException(400, "status must be suggested, confirmed or dismissed")
        row.status = body["status"]

    await db.commit()
    await db.refresh(row)
    user = await db.get(User, user_id)
    return svc.recurring_row_to_dict(row, svc.today_for_user(user))


@router.delete("/api/plan/recurring/{rule_id}")
async def delete_recurring(rule_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    rid = _uuid_or_400(rule_id)
    row = await db.get(plan_models.RecurringRule, rid)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Recurring rule not found")

    if row.source == "detected":
        # A detected suggestion that's hard-deleted has no trace left to keep the next
        # refresh pass from re-detecting the same merchant -- dismiss it in place instead,
        # which both removes it from the review queue/forecast AND stays permanently
        # suppressed (find_new_candidates only excludes confirmed/dismissed rows by label).
        row.status = "dismissed"
        await db.commit()
    else:
        await db.delete(row)
        await db.commit()
    return {"status": "deleted"}


# ---------- Plan events ----------

@router.get("/api/plan/events")
async def list_events(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(select(plan_models.PlanEvent).where(plan_models.PlanEvent.user_id == user_id))
    return {"items": [svc.plan_event_row_to_dict(r) for r in result.scalars().all()]}


@router.post("/api/plan/events")
async def create_event(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    body = await request.json()

    label = (body.get("label") or "").strip()
    direction = body.get("direction")
    currency = body.get("currency")
    date_raw = body.get("date")
    if not label or direction not in ("IN", "OUT") or not currency or not date_raw:
        raise HTTPException(400, "date, label, direction (IN|OUT) and currency are required")
    try:
        event_date = date_type.fromisoformat(date_raw)
    except ValueError:
        raise HTTPException(400, "date must be an ISO date (YYYY-MM-DD)")

    try:
        amount = parse_amount(body.get("amount"), currency)
    except MoneyValidationError as e:
        raise HTTPException(400, str(e))

    await _validate_account_id(db, user_id, body.get("account_id"))

    row = plan_models.PlanEvent(
        user_id=user_id,
        account_id=uuid.UUID(body["account_id"]) if body.get("account_id") else None,
        date=event_date,
        label=label,
        direction=direction,
        amount=float(amount),
        currency=currency,
        note=body.get("note"),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return svc.plan_event_row_to_dict(row)


@router.patch("/api/plan/events/{event_id}")
async def update_event(event_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    eid = _uuid_or_400(event_id)
    row = await db.get(plan_models.PlanEvent, eid)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Plan event not found")

    body = await request.json()

    if "currency" in body and body["currency"]:
        row.currency = body["currency"]
    if "amount" in body:
        try:
            row.amount = float(parse_amount(body["amount"], row.currency))
        except MoneyValidationError as e:
            raise HTTPException(400, str(e))
    if "date" in body and body["date"]:
        try:
            row.date = date_type.fromisoformat(body["date"])
        except ValueError:
            raise HTTPException(400, "date must be an ISO date (YYYY-MM-DD)")
    if "label" in body and body["label"]:
        row.label = body["label"].strip()
    if "direction" in body:
        if body["direction"] not in ("IN", "OUT"):
            raise HTTPException(400, "direction must be IN or OUT")
        row.direction = body["direction"]
    if "account_id" in body:
        await _validate_account_id(db, user_id, body["account_id"])
        row.account_id = uuid.UUID(body["account_id"]) if body["account_id"] else None
    if "note" in body:
        row.note = body["note"]

    await db.commit()
    await db.refresh(row)
    return svc.plan_event_row_to_dict(row)


@router.delete("/api/plan/events/{event_id}")
async def delete_event(event_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    eid = _uuid_or_400(event_id)
    row = await db.get(plan_models.PlanEvent, eid)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Plan event not found")
    await db.delete(row)
    await db.commit()
    return {"status": "deleted"}


# ---------- Budgets ----------

@router.get("/api/budgets")
async def list_budgets(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(select(Budget).where(Budget.user_id == user_id))
    return {"items": [svc.budget_row_to_dict(r) for r in result.scalars().all()]}


@router.put("/api/budgets")
async def put_budgets(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    user = await db.get(User, user_id)
    body = await request.json()
    items = body.get("items")
    if not isinstance(items, list):
        raise HTTPException(400, "items must be a list")

    default_currency = (user.currency if user else None) or "USD"
    parsed = []
    for item in items:
        category = (item.get("category") or "").strip()
        if not category:
            raise HTTPException(400, "Each budget requires a category")
        currency = item.get("currency") or default_currency
        try:
            amount = parse_amount(item.get("amount"), currency)
        except MoneyValidationError as e:
            raise HTTPException(400, str(e))
        parsed.append({
            "category": category,
            "amount": float(amount),
            "period": item.get("period") or "monthly",
            "currency": currency,
        })

    await db.execute(sa_delete(Budget).where(Budget.user_id == user_id))
    rows = [Budget(user_id=user_id, **p) for p in parsed]
    for row in rows:
        db.add(row)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return {"items": [svc.budget_row_to_dict(r) for r in rows]}
