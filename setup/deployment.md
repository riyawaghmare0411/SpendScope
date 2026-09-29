# Deploying SpendScope

Written for someone who has not used these platforms before. Follow it top to bottom.

**A caveat worth reading first:** these platforms change their dashboards and their free-tier
terms regularly. Button names and menu positions may differ slightly from what is written
here. The *shape* of each step will still be right. If something is called something else,
look for the nearest equivalent rather than assuming the guide is wrong about what you need.

---

## The three pieces, and why

SpendScope is three things that run in different places:

| Piece | What it is | Where it goes |
|---|---|---|
| Frontend | The pages you click. Plain files a browser downloads | Vercel |
| Backend | The Python program that does the work and holds the logic | Google Cloud Run |
| Database | Where the actual data lives | Neon |

They are separate because they have different needs. The frontend is just files, so it can be
served free from anywhere. The database has to keep data safely forever. The backend has to
*run*, which is the part that normally costs money — Cloud Run avoids that by only running
when someone is actually using the app, and sleeping otherwise.

---

## Part 1 — The database (Neon)

**Roughly 10 minutes. No card required.**

1. Go to **neon.tech** and sign up. Use "Continue with GitHub" — you already have a GitHub
   account, and it saves creating another password.

2. Create a project. You will be asked for:
   - **A name** — "spendscope" is fine.
   - **A Postgres version** — pick 16 or newer. Your local database is 16, so 16 keeps them
     identical, which is one less thing that can differ.
   - **A region** — this matters. Pick a US region, ideally US East. Your backend will live in
     the same region, and the two talking to each other across an ocean adds delay to every
     single page load.

3. When the project is created, Neon shows you a **connection string**. It looks roughly like:

   ```
   postgresql://someuser:somepassword@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

   **This is a password. Treat it like one.** Do not paste it into a chat, a GitHub issue, or
   a file you commit. Copy it somewhere private for now — you will paste it into Cloud Run in
   Part 2 and nowhere else.

4. Turn on the vector extension. Find the **SQL Editor** in Neon's sidebar, paste this, run it:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

   Then confirm it worked:

   ```sql
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   ```

   One row back means you are done. This powers automatic transaction categorization. If it
   fails for any reason the app still runs fine — you would just set `VECTOR_ENABLED=0` in
   Part 2 and lose that one feature.

---

## Part 2 — The backend (Google Cloud Run)

**Roughly 30 minutes the first time. Requires a card on file.**

Google asks for a card even for the free tier. You are not charged while you stay inside the
free allowance, and this app's usage will be far below it, but the card is not optional. If
you would rather not, see "If Cloud Run is too much" at the bottom.

1. Go to **console.cloud.google.com** and sign in with a Google account.

2. Create a project — the dropdown at the top left. Name it "spendscope". Wait for it to
   finish creating and make sure it is the selected project before continuing. Doing the next
   steps in the wrong project is the most common way to get confused here.

3. Enable billing when prompted. This is the card step.

4. In the search bar at the top, type **Cloud Run** and open it. Choose to create a service,
   and pick the option to **deploy from a source repository** (wording varies — it is the
   option that connects to GitHub rather than asking for a container image).

5. Connect your GitHub account and pick:
   - Repository: **riyawaghmare0411/SpendScope**
   - Branch: **prod** (I will merge the work into that branch before you do this — do not
     point it at `main`, which is 30+ commits behind)
   - Build type: **Dockerfile**. The repo already has one and it is correct.

6. Under the service settings:
   - **Region** — the same one you chose for Neon.
   - **Authentication** — allow unauthenticated invocations. This sounds alarming but it is
     correct: it means the *internet* can reach the app. The app's own login still protects
     everything inside it. Without this, nobody could open your site at all.

7. Set the environment variables. This is the part that matters most, so take it slowly. Find
   "Variables" or "Environment variables" in the service settings and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Your Neon connection string, pasted exactly as Neon gave it |
   | `JWT_SECRET` | A long random value. Generate one, do not invent one by hand |
   | `CORS_ORIGINS` | Your Vercel URL, e.g. `https://spendscope.vercel.app` |

   **Paste the Neon string unchanged.** Do not edit it. The app rewrites it internally into the
   form its database driver needs and turns on the encrypted connection itself. This used to
   require hand-editing the string correctly, which was an easy thing to get subtly wrong; it
   no longer does.

   **To generate `JWT_SECRET`**, run this on your machine and copy the output:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   This signs everyone's login sessions. If it leaks, someone can impersonate any user. The app
   now refuses to start without it, on purpose — an app that boots with a guessable one is
   worse than an app that refuses to boot.

8. Deploy. The first build takes several minutes because it downloads a machine-learning model
   into the image. Later deploys are faster.

9. When it finishes you get a URL like `https://spendscope-xxxx.run.app`. Open
   `https://your-url/health` in a browser. You should see:

   ```json
   {"status":"ok","db":"ok"}
   ```

   That means the backend is alive and talking to Neon. **Send me that URL** — it is not a
   secret, and I need it for the frontend.

---

## Part 3 — The frontend (Vercel)

I will handle most of this, but it needs one setting from Part 2: an environment variable
called `VITE_API_URL` set to your Cloud Run URL. Without it the deployed site tries to talk to
your laptop and silently shows nothing.

---

## What to send me, and what never to send

**Safe to send:** your Cloud Run URL, your Vercel URL, screenshots of dashboards, any error
message you see.

**Never send:** the Neon connection string, your `JWT_SECRET`, or Plaid keys. Those are
passwords. You set them directly in the dashboards; I never need to see them to do my part.

---

## If Cloud Run is too much

The card requirement and console complexity are real. **Render** is the simpler alternative:
sign up, connect the GitHub repo, it detects the Dockerfile, you set the same environment
variables, done. No card for the free tier.

The tradeoff is that a free Render service sleeps after inactivity, so the first visit after a
quiet period takes roughly a minute to respond while it wakes up. For one person checking his
cards every few days that is mildly annoying, not broken. Everything else is identical, and
nothing about the app has to change to move between them later.

---

## Known first-deploy gotchas

These are things that will bite otherwise:

- **Wrong branch.** Deploy `prod`, not `main`. Both are far behind until I merge.
- **`JWT_SECRET` missing.** The app deliberately refuses to start. That is the fix working, not
  a bug — set the variable.
- **`CORS_ORIGINS` not matching your real frontend URL.** The site loads but every action
  silently fails. It must be the exact address, including `https://`.
- **First request is slow.** Normal on a free tier that sleeps. Not a failure.
