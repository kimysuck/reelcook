from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request
B='http://localhost:8788'
urllib.request.urlopen(B+'/__set?mode=caption&script=jumble').read()
FAKE=open('fake-supabase2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(**L(), args=['--autoplay-policy=no-user-gesture-required']); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_at',String(Date.now()))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/JUMBLE01/';f.appendChild(t);document.body.appendChild(f);f.submit();}""")
    pg.wait_for_selector('.rhead h1', timeout=30000); pg.wait_for_function("S.media&&S.media.status==='ready'", timeout=30000)
    pg.click('[data-rt=step]'); pg.click('#vguide'); pg.wait_for_timeout(800)
    pg.evaluate("PL.v.pause()")
    seq=[]
    for t in [0.5,2,4,8,10.5,12,13,14,15.5,17,18.5,19.5]:
        pg.evaluate(f"PL.v.currentTime={t}; PL.v.dispatchEvent(new Event('timeupdate'))"); pg.wait_for_timeout(60)
        seq.append((t, pg.inner_text('#plc')))
    print('opening/sequence:', seq)
    pg.evaluate("PL.v.dispatchEvent(new Event('ended'))"); pg.wait_for_timeout(100); print('after end:', pg.inner_text('#plc'), round(pg.evaluate("PL.v.currentTime"),1))
    # 직접 4단계 고르기 → 그 장면 동안 유지
    pg.evaluate("gotoStep(3)"); pg.wait_for_timeout(100)
    for t in [11.5,13,15.5]:
        pg.evaluate(f"PL.v.currentTime={t}; PL.v.dispatchEvent(new Event('timeupdate'))"); pg.wait_for_timeout(60)
        print(' manual 4단계 at', t, '->', pg.inner_text('#plc'))
    pg.evaluate("PL.v.currentTime=17; PL.v.dispatchEvent(new Event('timeupdate'))"); pg.wait_for_timeout(60); print(' after its clip ->', pg.inner_text('#plc'))
    print('errors', errs)
