"""Small HTML pages served by the platform (no secrets, no external scripts)."""

HOME_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FastRobox SmartClass T07</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#111}
a{color:#1f3a5f}</style></head><body>
<h1>FastRobox SmartClass: Team T07</h1>
<p>Secure platform for the AI-powered smart classroom.</p>
<ul><li><a href="/records">Newest database records</a> (login required)</li><li><a href="/healthz">Health check</a></li></ul>
</body></html>"""

RECORDS_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Records: T07</title>
<style>
 body{font-family:system-ui,Arial,sans-serif;margin:16px;color:#111;background:#f6f8fb}
 h1{font-size:20px;margin:0 0 8px} h2{font-size:15px;margin:16px 0 6px;color:#1f3a5f}
 .bar{display:flex;gap:12px;flex-wrap:wrap;align-items:stretch}
 .card{background:#fff;border:1px solid #d6dde6;border-radius:8px;padding:8px 12px}
 .big{font-size:26px;font-weight:700} .muted{color:#666;font-size:12px}
 .on{color:#fff;background:#2e7d32;border-radius:4px;padding:2px 8px;font-weight:700}
 .off{color:#fff;background:#c62828;border-radius:4px;padding:2px 8px;font-weight:700}
 table{border-collapse:collapse;width:100%;background:#fff;font-size:12.5px}
 th,td{border:1px solid #d6dde6;padding:3px 6px;text-align:left;white-space:nowrap}
 th{background:#e8eef5} .scroll{overflow-x:auto} tr.new td{background:#fff8c4}
</style></head><body>
<h1>Newest records: Team T07 <span class="muted" id="clock"></span></h1>
<div class="bar">
 <div class="card"><div class="muted">Telemetry rows</div><div class="big" id="ct">-</div></div>
 <div class="card"><div class="muted">Event rows</div><div class="big" id="ce">-</div></div>
 <div class="card" id="devs"></div>
 <div class="card"><button onclick="cmd('reset-fire')" style="padding:8px 12px;font-weight:700;border:0;border-radius:6px;background:#c62828;color:#fff;cursor:pointer">Reset fire</button>
 <button onclick="cmd('register-teacher')" style="padding:8px 12px;font-weight:700;border:0;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;margin-left:6px">Register Teacher tag</button>
 <div id="cmo" class="muted" style="margin-top:6px"></div></div>
 <div class="card"><button id="rp" onclick="replay()" style="padding:8px 12px;font-weight:700;border:0;border-radius:6px;background:#1f3a5f;color:#fff;cursor:pointer">Replay test: resend newest message</button>
 <div id="rpo" class="muted" style="margin-top:6px;max-width:420px;white-space:normal"></div></div>
</div>
<h2>Telemetry (newest first; &Delta;ts = seconds since the previous reading)</h2>
<div class="scroll"><table id="tt"></table></div>
<h2>Events</h2><div class="scroll"><table id="te"></table></div>
<h2>Online / offline log</h2><div class="scroll"><table id="ts"></table></div>
<script>
const dhaka = s => new Date(s*1000).toLocaleString('en-GB',{timeZone:'Asia/Dhaka',hour12:false});
let lastTop = 0;
function table(el, cols, rows, mark){
  const h = '<tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr>';
  el.innerHTML = h + rows.map((r,i)=>'<tr'+(mark&&mark(r,i)?' class="new"':'')+'>'+
     cols.map(c=>'<td>'+(c[1](r,i) ?? '')+'</td>').join('')+'</tr>').join('');
}
async function load(){
  try{
    const r = await fetch('/api/records',{cache:'no-store'}); if(!r.ok) return;
    const d = await r.json();
    document.getElementById('clock').textContent = 'server time '+dhaka(d.server_time)+' (Asia/Dhaka)';
    document.getElementById('ct').textContent = d.counts.telemetry;
    document.getElementById('ce').textContent = d.counts.events;
    document.getElementById('devs').innerHTML = d.devices.map(v=>
      '<div><b>'+v.device_id+'</b> room '+v.room_id+' <span class="'+(v.online?'on">ONLINE':'off">OFFLINE')+'</span>'+
      ' <span class="muted">last seen '+(v.last_seen?(d.server_time-v.last_seen)+' s ago':'never')+
      ' · last boot '+(v.last_boot_reason||'-')+'</span></div>').join('') || '<span class="muted">no device yet</span>';
    const t = d.telemetry, top = t.length?t[0].id:0;
    table(document.getElementById('tt'), [
      ['seq',x=>x.seq],['ts (Dhaka)',x=>dhaka(x.ts)],['&Delta;ts',(x,i)=>i+1<t.length?(x.ts-t[i+1].ts)+' s':''],
      ['device',x=>x.device_id],['room',x=>x.room_id],['uptime_s',x=>x.uptime_s],['temp_c',x=>x.temp_c],['rh',x=>x.rh],
      ['heat_index_c',x=>x.heat_index_c],['flame',x=>x.flame],['door',x=>x.door],['status',x=>x.status],
      ['heat_trend',x=>x.heat_trend],['rssi',x=>x.rssi],['heap_kb',x=>x.heap_kb],['chip_temp_c',x=>x.chip_temp_c],
      ['fw',x=>x.fw],['quality',x=>x.quality]], t, (x)=>lastTop && x.id>lastTop);
    lastTop = top;
    table(document.getElementById('te'), [['seq',x=>x.seq],['ts (Dhaka)',x=>dhaka(x.ts)],['device',x=>x.device_id],
      ['room',x=>x.room_id],['type',x=>'<b>'+x.type+'</b>'],['detail',x=>x.detail]], d.events);
    table(document.getElementById('ts'), [['time (Dhaka)',x=>dhaka(x.at)],['device',x=>x.device_id],['state',x=>x.state]], d.status_log);
  }catch(e){}
}
async function cmd(c){
  const o=document.getElementById('cmo'); o.textContent='sending...';
  try{const r=await fetch('/api/admin/'+c,{method:'POST'}); const d=await r.json();
    o.textContent=r.ok?('Sent "'+d.queued+'" to '+d.device_id+' (delivered within ~1 s)'+(c=='register-teacher'?': now tap the Teacher tag':'')):'error '+r.status;
  }catch(e){o.textContent='error: '+e}
}
async function replay(){
  const o=document.getElementById('rpo'); o.textContent='sending...';
  try{const r=await fetch('/api/replay-test',{method:'POST'}); const d=await r.json();
    o.innerHTML='Resent seq <b>'+d.resent_seq+'</b> → server answered <b style="color:'+(d.status==409?'#c62828':'#111')+'">'+d.status+
      '</b> '+d.server_reply+'<br>Rows with this seq: <b>'+d.rows_with_this_seq+'</b> · telemetry rows before '+d.telemetry_rows_before+', after '+d.telemetry_rows_after;
  }catch(e){o.textContent='error: '+e}
}
load(); setInterval(load, 1000);
</script></body></html>"""
