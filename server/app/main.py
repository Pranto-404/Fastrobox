"""FastRobox SmartClass platform (Level 2: secure telemetry ingest, replay protection, online/offline).

Secrets come only from environment variables (never from the repository):
  DATABASE_URL    PostgreSQL connection string
  DEVICE_TOKENS   "T07-D1=<token>[,T07-D2=<token>]": the token each device types on its setup page
  ADMIN_USER      login for the records page (default "admin")
  ADMIN_PASSWORD  password for the records page
"""
import asyncio
import contextlib
import hmac
import os
import json
import time
import urllib.error
import urllib.request
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from . import db
from .pages import RECORDS_PAGE, HOME_PAGE

OFFLINE_AFTER_S = 12  # device sends every 5 s: 2 missed readings -> offline; worst case ~19 s (limit 30 s)
MONITOR_PERIOD_S = 2


def _load_tokens() -> dict:
    tokens = {}
    for part in os.environ.get("DEVICE_TOKENS", "").split(","):
        if "=" in part:
            device, token = part.split("=", 1)
            tokens[device.strip()] = token.strip()
    return tokens


DEVICE_TOKENS = _load_tokens()


# ---------- models (the fixed data format from the question paper) ----------
class Telemetry(BaseModel):
    device_id: str
    room_id: str
    seq: int
    ts: int
    uptime_s: int
    temp_c: Optional[float] = None
    rh: Optional[float] = None
    heat_index_c: Optional[float] = None
    flame: bool
    door: str
    status: str
    heat_trend: Optional[str] = None
    rssi: Optional[int] = None
    heap_kb: Optional[int] = None
    chip_temp_c: Optional[float] = None
    fw: str
    quality: str


class Event(BaseModel):
    device_id: str
    room_id: str
    seq: int
    ts: int
    type: str
    detail: str = ""


# ---------- auth ----------
def check_device(device_id: str, authorization: Optional[str]) -> None:
    expected = DEVICE_TOKENS.get(device_id)
    given = (authorization or "").removeprefix("Bearer ").strip()
    given = given.removeprefix(device_id + "=")  # accept a token pasted together with its "T07-D1=" label
    if not expected or not given or not hmac.compare_digest(expected, given):
        raise HTTPException(status_code=401, detail="invalid device token")


basic = HTTPBasic()


def check_admin(creds: HTTPBasicCredentials = Depends(basic)) -> str:
    password = os.environ.get("ADMIN_PASSWORD", "")
    user_ok = hmac.compare_digest(creds.username, os.environ.get("ADMIN_USER", "admin"))
    pass_ok = bool(password) and hmac.compare_digest(creds.password, password)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="login required", headers={"WWW-Authenticate": "Basic"})
    return creds.username


# ---------- helpers ----------
def _mark_seen(conn, device_id: str, room_id: str) -> None:
    """Update last_seen; if the device was offline, log that it is ONLINE again."""
    row = conn.execute(
        """INSERT INTO devices (device_id, room_id, online, last_seen) VALUES (%s, %s, TRUE, now())
           ON CONFLICT (device_id) DO UPDATE SET room_id = COALESCE(EXCLUDED.room_id, devices.room_id),
                                                 last_seen = now(), online = TRUE
           RETURNING (xmax = 0) AS inserted""",
        (device_id, room_id),
    ).fetchone()
    was_offline = conn.execute(
        "SELECT state FROM device_status_log WHERE device_id = %s ORDER BY id DESC LIMIT 1", (device_id,)
    ).fetchone()
    if row["inserted"] or not was_offline or was_offline["state"] != "ONLINE":
        conn.execute("INSERT INTO device_status_log (device_id, state) VALUES (%s, 'ONLINE')", (device_id,))


def _claim_seq(conn, device_id: str, seq: int) -> bool:
    """True the first time a (device_id, seq) pair is seen, False for a replay."""
    return (
        conn.execute(
            "INSERT INTO seen_seq (device_id, seq) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING seq",
            (device_id, seq),
        ).fetchone()
        is not None
    )


# ---------- background: offline detection ----------
def _mark_offline() -> None:
    with db.pool.connection() as conn:
        rows = conn.execute(
            """UPDATE devices SET online = FALSE
               WHERE online AND last_seen < now() - make_interval(secs => %s) RETURNING device_id""",
            (OFFLINE_AFTER_S,),
        ).fetchall()
        for r in rows:
            conn.execute("INSERT INTO device_status_log (device_id, state) VALUES (%s, 'OFFLINE')", (r["device_id"],))


async def _offline_monitor() -> None:
    while True:
        with contextlib.suppress(Exception):
            await asyncio.to_thread(_mark_offline)
        await asyncio.sleep(MONITOR_PERIOD_S)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    task = asyncio.create_task(_offline_monitor())
    yield
    task.cancel()
    db.pool.close()


app = FastAPI(title="FastRobox SmartClass", lifespan=lifespan)


# ---------- device API ----------
@app.post("/api/v1/telemetry", status_code=201)
def post_telemetry(t: Telemetry, authorization: Optional[str] = Header(None)):
    check_device(t.device_id, authorization)
    with db.pool.connection() as conn, conn.transaction():
        _mark_seen(conn, t.device_id, t.room_id)
        if not _claim_seq(conn, t.device_id, t.seq):
            return JSONResponse({"result": "rejected", "reason": "replay: seq already stored", "seq": t.seq}, 409)
        conn.execute(
            """INSERT INTO telemetry (device_id, room_id, seq, ts, uptime_s, temp_c, rh, heat_index_c, flame, door,
                                      status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality)
               VALUES (%(device_id)s, %(room_id)s, %(seq)s, %(ts)s, %(uptime_s)s, %(temp_c)s, %(rh)s, %(heat_index_c)s,
                       %(flame)s, %(door)s, %(status)s, %(heat_trend)s, %(rssi)s, %(heap_kb)s, %(chip_temp_c)s,
                       %(fw)s, %(quality)s)""",
            t.model_dump(),
        )
    return {"result": "stored", "seq": t.seq}


@app.post("/api/v1/events", status_code=201)
def post_event(e: Event, authorization: Optional[str] = Header(None)):
    check_device(e.device_id, authorization)
    with db.pool.connection() as conn, conn.transaction():
        _mark_seen(conn, e.device_id, e.room_id)
        if not _claim_seq(conn, e.device_id, e.seq):
            return JSONResponse({"result": "rejected", "reason": "replay: seq already stored", "seq": e.seq}, 409)
        conn.execute(
            "INSERT INTO events (device_id, room_id, seq, ts, type, detail) VALUES (%s, %s, %s, %s, %s, %s)",
            (e.device_id, e.room_id, e.seq, e.ts, e.type, e.detail),
        )
        if e.type == "BOOT":
            conn.execute(
                "UPDATE devices SET last_boot_reason = %s WHERE device_id = %s",
                (e.detail.removeprefix("reason="), e.device_id),
            )
    return {"result": "stored", "seq": e.seq}


@app.get("/api/v1/commands", response_class=PlainTextResponse)
def get_commands(device_id: str, authorization: Optional[str] = Header(None)):
    """Polled by the device every second (also its heartbeat). One command per line: "type|arg"."""
    check_device(device_id, authorization)
    with db.pool.connection() as conn, conn.transaction():
        row = conn.execute("SELECT room_id FROM devices WHERE device_id = %s", (device_id,)).fetchone()
        _mark_seen(conn, device_id, row["room_id"] if row else None)
        rows = conn.execute(
            """UPDATE commands SET delivered_at = now()
               WHERE id IN (SELECT id FROM commands WHERE device_id = %s AND delivered_at IS NULL ORDER BY id)
               RETURNING type, arg""",
            (device_id,),
        ).fetchall()
    return "".join(f"{r['type']}|{r['arg']}\n" for r in rows)


def queue_command(device_id: str, ctype: str, arg: str, by: str) -> dict:
    with db.pool.connection() as conn:
        conn.execute(
            "INSERT INTO commands (device_id, type, arg, created_by) VALUES (%s, %s, %s, %s)",
            (device_id, ctype, arg, by),
        )
    return {"queued": ctype, "device_id": device_id}


@app.post("/api/admin/reset-fire")
def admin_reset_fire(device_id: str = "T07-D1", user: str = Depends(check_admin)):
    return queue_command(device_id, "reset_fire", user, user)


@app.post("/api/admin/register-teacher")
def admin_register_teacher(device_id: str = "T07-D1", user: str = Depends(check_admin)):
    return queue_command(device_id, "register_teacher", "", user)


@app.get("/api/v1/time")
def server_time():
    return {"ts": int(time.time())}


# ---------- records (judges watch the newest rows live) ----------
@app.get("/api/records")
def api_records(_: str = Depends(check_admin)):
    with db.pool.connection() as conn:
        return {
            "server_time": int(time.time()),
            "devices": conn.execute(
                """SELECT device_id, room_id, online, last_boot_reason,
                          EXTRACT(EPOCH FROM last_seen)::bigint AS last_seen FROM devices ORDER BY device_id"""
            ).fetchall(),
            "counts": conn.execute(
                "SELECT (SELECT count(*) FROM telemetry) AS telemetry, (SELECT count(*) FROM events) AS events"
            ).fetchone(),
            "telemetry": conn.execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT 20").fetchall(),
            "events": conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT 15").fetchall(),
            "status_log": conn.execute(
                "SELECT device_id, state, EXTRACT(EPOCH FROM at)::bigint AS at FROM device_status_log ORDER BY id DESC LIMIT 10"
            ).fetchall(),
        }


@app.post("/api/replay-test")
def replay_test(_: str = Depends(check_admin)):
    """Judges' replay check: send the newest stored telemetry message again, unchanged (same seq),
    through the normal HTTPS ingest endpoint with the device token, and show that it is rejected."""
    with db.pool.connection() as conn:
        row = conn.execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            raise HTTPException(404, "no telemetry stored yet")
        before = conn.execute("SELECT count(*) AS n FROM telemetry").fetchone()["n"]
    message = {k: row[k] for k in Telemetry.model_fields}
    token = DEVICE_TOKENS.get(row["device_id"], "")
    req = urllib.request.Request(
        f"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api/v1/telemetry",
        data=json.dumps(message).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            status, body = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        status, body = e.code, e.read().decode()
    with db.pool.connection() as conn:
        after = conn.execute("SELECT count(*) AS n FROM telemetry").fetchone()["n"]
        same = conn.execute(
            "SELECT count(*) AS n FROM telemetry WHERE device_id = %s AND seq = %s", (row["device_id"], row["seq"])
        ).fetchone()["n"]
    return {"resent_seq": row["seq"], "status": status, "server_reply": body, "rows_with_this_seq": same,
            "telemetry_rows_before": before, "telemetry_rows_after": after, "message": message}


@app.get("/records", response_class=HTMLResponse)
def records_page(_: str = Depends(check_admin)):
    return RECORDS_PAGE


@app.get("/", response_class=HTMLResponse)
def home():
    return HOME_PAGE


@app.get("/healthz")
def healthz():
    return {"ok": True}
