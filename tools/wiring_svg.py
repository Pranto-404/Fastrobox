import sys
W,H=1600,1180
L=['3V3','EN','4','5','6','7','15','16','17','18','8','3','46','9','10','11','12','13','14','5V']
R=['TX','RX','1','2','42','41','40','39','38','37','36','35','0','45','48','47','21','20','19','GND']
cam={'4','5','6','7','15','16','17','18','8','9','10','11','12','13'}
y0,dy=190,38
def py(i): return y0+i*dy
o=[]
a=o.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial,Helvetica,sans-serif">')
a(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
a('<text x="40" y="48" font-size="30" font-weight="bold" fill="#111">FastRobox kit wiring: ESP32-S3 WROOM (N16R8, OV3660)</text>')
a('<text x="40" y="82" font-size="18" fill="#b00020" font-weight="bold">Unplug USB while wiring. Every module on 3V3. NOTHING on 5V. Read the pin labels printed on the board.</text>')
# board
bx,bw=560,300
a(f'<rect x="{bx}" y="140" width="{bw}" height="{py(19)-140+50}" rx="14" fill="#1b1b1b"/>')
a(f'<rect x="{bx+85}" y="170" width="130" height="150" rx="6" fill="#9a9a9a"/><text x="{bx+150}" y="235" font-size="14" text-anchor="middle" fill="#222">ESP32-S3</text><text x="{bx+150}" y="255" font-size="14" text-anchor="middle" fill="#222">N16R8</text>')
a(f'<circle cx="{bx+150}" cy="370" r="34" fill="#333" stroke="#777" stroke-width="3"/><text x="{bx+150}" y="420" font-size="14" text-anchor="middle" fill="#ddd">OV3660 camera</text>')
a(f'<text x="{bx+150}" y="{py(19)+20}" font-size="15" text-anchor="middle" fill="#ddd">USB-C   USB-C</text>')
a(f'<text x="{bx+150}" y="{py(19)-20}" font-size="13" text-anchor="middle" fill="#bbb">RST  BOOT(0)  RGB LED(48)</text>')
used={'L':{'3V3':'#d32f2f','14':'#6a1b9a'},'R':{'1':'#f9a825','42':'#1565c0','41':'#fbc02d','40':'#9e9e9e','39':'#8e24aa','38':'#ef6c00','47':'#e65100','21':'#2e7d32','GND':'#111'}}
for i,n in enumerate(L):
    y=py(i); c=used['L'].get(n)
    fill=c or ('#555' if n in cam or n in('EN','5V') else '#888')
    a(f'<circle cx="{bx+15}" cy="{y}" r="9" fill="{fill}" stroke="#fff" stroke-width="2"/>')
    a(f'<text x="{bx+32}" y="{y+5}" font-size="15" fill="{"#fff" if c else "#aaa"}" font-weight="{"bold" if c else "normal"}">{n}</text>')
    if n in cam: a(f'<text x="{bx-12}" y="{y+5}" font-size="12" text-anchor="end" fill="#999">camera</text>')
for i,n in enumerate(R):
    y=py(i); c=used['R'].get(n)
    fill=c or '#888'
    a(f'<circle cx="{bx+bw-15}" cy="{y}" r="9" fill="{fill}" stroke="#fff" stroke-width="2"/>')
    a(f'<text x="{bx+bw-32}" y="{y+5}" font-size="15" text-anchor="end" fill="{"#fff" if c else "#aaa"}" font-weight="{"bold" if c else "normal"}">{n}</text>')
a(f'<text x="{bx-12}" y="{py(19)+5}" font-size="13" text-anchor="end" fill="#b00020" font-weight="bold">5V: do NOT use</text>')
for n,t in (('37','PSRAM'),('36','PSRAM'),('35','PSRAM'),('20','USB'),('19','USB'),('0','BOOT'),('48','RGB LED'),('2','LED')):
    a(f'<text x="{bx+bw+14}" y="{py(R.index(n))+5}" font-size="12" fill="#999">{t}</text>')
def wire(pts,color,w=5,dash=''):
    d=' '.join(f'{x},{y}' for x,y in pts)
    a(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" {dash}/>')
def module(x,y,w,title,sub,pins,col):
    h=40+len(pins)*dy
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{col}" stroke="#0d3b66" stroke-width="2"/>')
    a(f'<text x="{x+w/2+20}" y="{y+26}" font-size="18" font-weight="bold" fill="#fff" text-anchor="middle">{title}</text>')
    if sub: a(f'<text x="{x+w/2+20}" y="{y+h-12}" font-size="13" fill="#e3f2fd" text-anchor="middle">{sub}</text>')
    pos={}
    for i,p in enumerate(pins):
        yy=y+50+i*dy; pos[p]=yy
        a(f'<circle cx="{x}" cy="{yy}" r="8" fill="#ffd54f" stroke="#333" stroke-width="2"/>')
        a(f'<text x="{x+16}" y="{yy+5}" font-size="15" fill="#fff" font-weight="bold">{p}</text>')
    return pos
MX=1180
dht=module(MX,120,230,'DHT11','blue sensor module',['VCC','DATA','GND'],'#1e88e5')
rfid=module(MX,300,260,'RC522 RFID','3.3 V ONLY',['SDA','SCK','MOSI','MISO','IRQ','GND','RST','3.3V'],'#1565c0')
fl=module(MX,690,230,'Flame sensor','blue screw = sensitivity',['VCC','GND','DO'],'#0277bd')
bz=module(MX,880,230,'Active buzzer','long leg = +',['+','-'],'#37474f')
rx=bx+bw-15
def sig(pin,lane,ty,col):
    y=py(R.index(pin)); wire([(rx,y),(lane,y),(lane,ty),(MX,ty)],col)
sig('1',900,dht['DATA'],'#f9a825')
sig('42',930,rfid['MISO'],'#1565c0')
sig('41',960,rfid['SDA'],'#fbc02d')
sig('40',990,rfid['RST'],'#9e9e9e')
sig('39',1020,fl['DO'],'#8e24aa')
sig('38',1050,bz['+'],'#ef6c00')
sig('47',1080,rfid['SCK'],'#e65100')
sig('21',1110,rfid['MOSI'],'#2e7d32')
a(f'<text x="{MX+70}" y="{rfid["IRQ"]+5}" font-size="13" fill="#e3f2fd">(leave empty)</text>')
# 3V3 bus
lx=bx+15; vy=py(0)
red='#d32f2f'
wire([(lx,vy),(500,vy),(500,105),(1150,105),(1150,fl['VCC'])],red,6)
for t in (dht['VCC'],rfid['3.3V'],fl['VCC']):
    wire([(1150,t),(MX,t)],red,6); a(f'<circle cx="1150" cy="{t}" r="7" fill="{red}"/>')
a('<text x="760" y="100" font-size="14" fill="#d32f2f" font-weight="bold">3V3 joint: 1 wire from board → 3 modules</text>')
# GND bus
gy=py(19); blk='#111'
wire([(rx,gy),(rx+40,gy),(rx+40,1120),(1165,1120),(1165,dht['GND'])],blk,6)
for t in (dht['GND'],rfid['GND'],fl['GND'],bz['-']):
    wire([(1165,t),(MX,t)],blk,6); a(f'<circle cx="1165" cy="{t}" r="7" fill="{blk}"/>')
a('<text x="905" y="1145" font-size="14" fill="#111" font-weight="bold">GND joint: 1 wire from board GND → 4 modules</text>')
# panic
ty=py(L.index('14'))
wire([(lx,ty),(330,ty)],'#6a1b9a',6)
a(f'<line x1="300" y1="{ty}" x2="330" y2="{ty}" stroke="#b87333" stroke-width="8" stroke-linecap="round"/>')
a(f'<text x="290" y="{ty-14}" font-size="16" fill="#6a1b9a" font-weight="bold" text-anchor="end">PANIC PAD</text>')
a(f'<text x="290" y="{ty+8}" font-size="14" fill="#333" text-anchor="end">bare metal end of one wire</text>')
a(f'<text x="290" y="{ty+28}" font-size="14" fill="#333" text-anchor="end">must not touch any pin</text>')
# legend
leg=[('#d32f2f','3V3 → RC522 3.3V, DHT11 VCC, Flame VCC'),('#111','GND → RC522, DHT11, Flame, Buzzer −'),
     ('#fbc02d','GPIO 41 → RC522 SDA'),('#e65100','GPIO 47 → RC522 SCK'),('#2e7d32','GPIO 21 → RC522 MOSI'),
     ('#1565c0','GPIO 42 → RC522 MISO'),('#9e9e9e','GPIO 40 → RC522 RST'),('#f9a825','GPIO 1 → DHT11 DATA'),
     ('#8e24aa','GPIO 39 → Flame DO'),('#ef6c00','GPIO 38 → Buzzer +'),('#6a1b9a','GPIO 14 → panic wire (bare end)')]
a('<text x="40" y="150" font-size="18" font-weight="bold" fill="#111">Connections</text>')
for i,(c,t) in enumerate(leg):
    y=180+i*30
    a(f'<rect x="40" y="{y-12}" width="30" height="10" fill="{c}"/><text x="80" y="{y}" font-size="15" fill="#111">{t}</text>')
a('<text x="40" y="560" font-size="14" fill="#555">Board held camera-up, USB-C at the bottom.</text>')
a('<text x="40" y="582" font-size="14" fill="#555">Grey pins = camera / PSRAM / USB / strapping.</text>')
a('<text x="40" y="604" font-size="14" fill="#555">Joints: strip ~1 cm, twist together, tape.</text>')
a('</svg>')
open(sys.argv[1],'w').write('\n'.join(o))
