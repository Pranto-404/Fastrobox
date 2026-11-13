#!/usr/bin/env python3
"""Level 2 replay test: resend the newest stored telemetry message (same seq) and show it is rejected.

Usage (secrets come from environment variables, never from the repo):
  set FASTROBOX_URL=https://<your-service>.onrender.com
  set ADMIN_PASSWORD=...        (records page password)
  set DEVICE_TOKEN=...          (the token typed on the device setup page)
  python tools/replay.py
"""
import base64
import json
import os
import urllib.error
import urllib.request

URL = os.environ["FASTROBOX_URL"].rstrip("/")
ADMIN = base64.b64encode(f"{os.environ.get('ADMIN_USER', 'admin')}:{os.environ['ADMIN_PASSWORD']}".encode()).decode()
TOKEN = os.environ["DEVICE_TOKEN"]


def get_records():
    req = urllib.request.Request(URL + "/api/records", headers={"Authorization": "Basic " + ADMIN})
    return json.load(urllib.request.urlopen(req, timeout=15))


before = get_records()
row = before["telemetry"][0]
message = {k: row[k] for k in ("device_id", "room_id", "seq", "ts", "uptime_s", "temp_c", "rh", "heat_index_c", "flame",
                               "door", "status", "heat_trend", "rssi", "heap_kb", "chip_temp_c", "fw", "quality")}
print("Telemetry rows before:", before["counts"]["telemetry"])
print("Re-sending old message seq =", message["seq"])
req = urllib.request.Request(URL + "/api/v1/telemetry", data=json.dumps(message).encode(), method="POST",
                             headers={"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
try:
    resp = urllib.request.urlopen(req, timeout=15)
    print("Server answered", resp.status, resp.read().decode())
except urllib.error.HTTPError as e:
    print("Server answered", e.code, e.read().decode())
after = get_records()
# New device telemetry may arrive meanwhile, so compare the rows with this seq, not only the total.
same_seq = [t for t in after["telemetry"] if t["seq"] == message["seq"]]
print("Rows with seq", message["seq"], "after replay:", len(same_seq), "(must be 1)")
print("Telemetry rows after:", after["counts"]["telemetry"], "(only the device's new readings may add rows)")
