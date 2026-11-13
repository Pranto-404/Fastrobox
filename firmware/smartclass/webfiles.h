#pragma once
// Pages served by the device. They are copied into LittleFS at start-up (see web.cpp).

static const char SETUP_HTML[] PROGMEM = R"HTML(<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartClass setup</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:0;background:#eef2f7;color:#111}
main{max-width:460px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:6px 0}.sub{color:#555;font-size:13px;margin-bottom:12px}
.card{background:#fff;border-radius:10px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px #0002}
label{display:block;font-weight:600;font-size:14px;margin:10px 0 4px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:6px;font-size:16px}
.net{display:flex;justify-content:space-between;padding:9px 8px;border-bottom:1px solid #eee;cursor:pointer}
.net:hover,.net.sel{background:#e3f2fd}.bars{font-family:monospace;color:#1565c0}
button{width:100%;padding:12px;margin-top:14px;border:0;border-radius:8px;background:#1f3a5f;color:#fff;font-size:16px;font-weight:700}
.small{background:#90a4ae;padding:6px;font-size:13px;margin-top:8px}
.msg{padding:10px;border-radius:6px;margin-top:10px;font-weight:600;display:none}
.err{background:#ffebee;color:#b71c1c;display:block}.ok{background:#e8f5e9;color:#1b5e20;display:block}.wait{background:#fff8e1;color:#e65100;display:block}
</style></head><body><main>
<h1>SmartClass device setup</h1><div class="sub" id="dev"></div>
<div class="msg" id="msg"></div>
<div class="card"><b>1. Choose a Wi-Fi network</b> <span class="sub">(signal strength in dBm)</span>
<div id="nets">Scanning…</div><button class="small" type="button" onclick="scan()">Refresh list</button></div>
<form class="card" id="f" onsubmit="return save(event)">
<b>2. Details</b>
<label>Network name</label><input name="ssid" id="ssid" required maxlength="32">
<label>Wi-Fi password</label><input name="pass" id="pass" type="password" maxlength="64">
<label>Room ID</label><input name="room" id="room" required maxlength="24" placeholder="e.g. R-305">
<label>Device token</label><input name="token" id="token" maxlength="64" autocomplete="off">
<button>Save and connect</button></form>
</main><script>
const $=id=>document.getElementById(id);
function bars(r){return r>-55?'▮▮▮▮':r>-67?'▮▮▮▯':r>-78?'▮▮▯▯':'▮▯▯▯'}
function show(t,c){const m=$('msg');m.className='msg '+c;m.innerHTML=t}
async function scan(){
  try{const n=await (await fetch('/api/scan')).json();
    n.sort((a,b)=>b.rssi-a.rssi);
    $('nets').innerHTML=n.length?n.map(x=>`<div class="net" onclick="pick(this,'${x.ssid.replace(/'/g,"\\'")}')"><span>${x.secure?'🔒 ':''}${x.ssid}</span><span><span class="bars">${bars(x.rssi)}</span> ${x.rssi} dBm</span></div>`).join(''):'No networks yet. Tap Refresh in a few seconds.';
  }catch(e){}
}
function pick(el,s){document.querySelectorAll('.net').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');$('ssid').value=s;$('pass').focus()}
async function state(){try{return await (await fetch('/api/setup')).json()}catch(e){return null}}
async function save(e){
  e.preventDefault();
  const r=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData($('f')))});
  const j=await r.json(); if(!j.ok){show(j.error,'err');return false}
  show('Connecting to “'+$('ssid').value+'”…','wait'); poll(); return false;
}
async function poll(){
  const s=await state();
  if(s&&s.state==='connected'){show('Connected! Device IP: <b>'+s.ip+'</b><br>Status page: http://'+s.ip+' or http://'+s.mdns+'<br>(join the same Wi-Fi to open it)','ok');return}
  if(s&&s.state==='error'){show(s.error,'err');return}
  setTimeout(poll,1000);
}
(async()=>{const s=await state(); if(s){$('dev').textContent='Device '+s.device_id;
  if(s.room)$('room').value=s.room; if(s.ssid)$('ssid').value=s.ssid;
  $('token').placeholder=s.has_token?'saved (leave empty to keep)':'required';
  if(s.state==='error')show(s.error,'err');}
  scan(); setInterval(scan,8000);})();
</script></body></html>)HTML";

static const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartClass status</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:0;background:#eef2f7;color:#111}
main{max-width:520px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:6px 0 2px}.sub{color:#555;font-size:13px}
.badge{display:inline-block;padding:4px 12px;border-radius:14px;color:#fff;font-weight:700;font-size:14px}
.LIVE{background:#2e7d32}.OFFLINE{background:#c62828}.SETUP{background:#1565c0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.c{background:#fff;border-radius:10px;padding:10px 12px;box-shadow:0 1px 3px #0002}
.k{color:#666;font-size:12px}.v{font-size:20px;font-weight:700;margin-top:2px;word-break:break-all}
.wide{grid-column:1/3}.warn{color:#c62828}
.banner{display:none;margin-top:10px;padding:14px;border-radius:10px;color:#fff;font-size:24px;font-weight:800;text-align:center}
.fire{background:#c62828;animation:b 0.4s steps(2) infinite}.panic{background:#6a1b9a}.note{background:#ef6c00;font-size:18px}
@keyframes b{50%{background:#7f0000}}
.SAFE{color:#2e7d32}.WARNING{color:#e6a100}.DANGER,.FIRE{color:#c62828}
</style></head><body><main>
<h1>SmartClass <span id="dev"></span></h1>
<div class="sub">Room <b id="room">-</b> · <span id="time">-</span> (Asia/Dhaka) · updated <span id="upd">-</span></div>
<div style="margin-top:8px">Connection: <span class="badge" id="conn">-</span> <span class="sub" id="pend"></span></div>
<div class="banner fire" id="bfire">FIRE &ndash; EVACUATE</div>
<div class="banner panic" id="bpanic">PANIC</div>
<div class="banner note" id="bnote"></div>
<div class="grid">
<div class="c"><div class="k">Temperature</div><div class="v" id="t">-</div></div>
<div class="c"><div class="k">Humidity</div><div class="v" id="rh">-</div></div>
<div class="c"><div class="k">Status</div><div class="v" id="st">-</div></div>
<div class="c"><div class="k">Heat index</div><div class="v" id="hi">-</div></div>
<div class="c"><div class="k">Trend</div><div class="v" id="tr">-</div></div>
<div class="c"><div class="k">Data quality</div><div class="v" id="q">-</div></div>
<div class="c"><div class="k">Flame</div><div class="v" id="fl">-</div></div>
<div class="c"><div class="k">Door</div><div class="v" id="door">-</div></div>
<div class="c"><div class="k">Last card UID</div><div class="v" id="uid">-</div></div>
<div class="c"><div class="k">Wi-Fi signal</div><div class="v" id="rssi">-</div></div>
<div class="c"><div class="k">Chip temperature</div><div class="v" id="chip">-</div></div>
<div class="c"><div class="k">Firmware</div><div class="v" id="fw">-</div></div>
<div class="c"><div class="k">Uptime</div><div class="v" id="up">-</div></div>
<div class="c wide"><div class="k">Address</div><div class="v" style="font-size:15px" id="addr">-</div></div>
</div></main><script>
const $=id=>document.getElementById(id);
async function load(){
  try{const s=await (await fetch('/api/status',{cache:'no-store'})).json();
    $('dev').textContent=s.device_id; $('room').textContent=s.room_id||'-'; $('time').textContent=s.local_time||'time not set yet';
    $('conn').textContent=s.connection; $('conn').className='badge '+s.connection;
    $('pend').textContent=s.pending?s.pending+' record(s) waiting to be sent':'';
    $('t').textContent=s.temp_c==null?'sensor error':s.temp_c+' °C'; $('t').className='v'+(s.temp_c==null?' warn':'');
    $('rh').textContent=s.rh==null?'sensor error':s.rh+' %'; $('st').textContent=s.status; $('st').className='v '+s.status;
    $('hi').textContent=s.heat_index_c==null?'-':s.heat_index_c+' °C'; $('tr').textContent=s.trend;
    $('q').textContent=s.quality; $('q').className='v'+(s.quality=='bad'?' warn':'');
    $('bfire').style.display=s.fire?'block':'none'; $('bfire').innerHTML='FIRE &ndash; EVACUATE'+(s.silenced?'<div style="font-size:14px">alarm silenced by Teacher &middot; door stays UNLOCKED</div>':'');
    $('bpanic').style.display=s.panic?'block':'none';
    $('bnote').style.display=s.notice?'block':'none'; $('bnote').textContent=s.notice;
    $('fl').textContent=s.flame?'FLAME':'no flame'; $('fl').className='v'+(s.flame?' warn':'');
    $('door').textContent=s.door; $('uid').textContent=s.last_uid||'-'+(s.rfid_error?' (reader error)':'');
    $('rssi').textContent=s.wifi?s.rssi+' dBm':'-'; $('chip').textContent=s.chip_temp_c+' °C'; $('fw').textContent=s.fw;
    $('up').textContent=s.uptime_s+' s'; $('addr').textContent='http://'+(s.ip||'-')+'  ·  http://'+s.mdns;
    $('upd').textContent=new Date().toLocaleTimeString('en-GB');
  }catch(e){$('conn').textContent='device not reachable';$('conn').className='badge OFFLINE'}
}
load(); setInterval(load,1000);
</script></body></html>)HTML";
