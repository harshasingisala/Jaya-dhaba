# Startup Instructions

## Backend

Prerequisites: Python virtualenv, packages installed with `pip install -r backend/requirements.txt`, and `backend` able to read the root `.env`.

Windows:

```powershell
cd "C:\Users\harsh\Desktop\Jaya Dhaba\backend"
..\ .venv\Scripts\python.exe run.py
```

Remove the space in `..\ .venv` if your terminal inserts one.

Verify:

```powershell
Invoke-WebRequest http://127.0.0.1:5000/api/health
```

Expected result: JSON with `"success": true`.

## Frontend

```powershell
cd "C:\Users\harsh\Desktop\Jaya Dhaba\frontend"
cmd /c npm run dev
```

Open the Vite URL shown in the terminal.

## Common Failures

| Symptom | Cause | Fix |
|---|---|---|
| SQLite forbidden | `DATABASE_URL` missing or wrong | Set Supabase Postgres URL in `.env` |
| Postgres driver missing | Packages not installed | Run `pip install -r backend/requirements.txt` |
| Payment unavailable | Razorpay keys missing | Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` |
| Frontend failed fetch | Backend not running or wrong URL | Start backend and verify frontend API base URL |

