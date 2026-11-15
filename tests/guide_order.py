from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request
B='http://localhost:8788'
urllib.request.urlopen(B+'/__set?mode=caption&script=jumble').read()
FAKE=open('fake-supabase2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(**L(), args=['--autoplay-policy=no-user-gesture-required']); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1')")
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
    # 영상에 장면이 없는 단계(평가 2회차 10번: 5단계부터 앞 단계로 되돌아감) → 고른 단계에 머문다
    pg.evaluate("S.recipe.steps[4].clip=null; S.recipe.steps[3].clip={start:999,end:1003}; closePlayer(true); openPlayer(0)"); pg.wait_for_timeout(800); pg.evaluate("PL.v.pause()")
    print(' 영상 길이', round(pg.evaluate('PL.dur'),1), '시간표', pg.evaluate('PL.tl.map(e=>e.i+1)'))
    assert 4 not in pg.evaluate('PL.tl.map(e=>e.i+1)'), 'clip beyond video length kept in timeline'
    pg.evaluate("gotoStep(4)"); pg.wait_for_timeout(100)
    for t in [13,15.5,18.5]:
        pg.evaluate(f"PL.v.currentTime={t}; PL.v.dispatchEvent(new Event('timeupdate'))"); pg.wait_for_timeout(60)
        print(' 장면 없는 5단계 at', t, '->', pg.inner_text('#plc')); assert pg.inner_text('#plc').startswith('5 /'), 'jumped away from step without scene'
    assert '영상에 없는 단계' in pg.inner_text('#plg') and pg.evaluate('PL.v.paused'), 'no notice / video not paused'
    pg.evaluate("gotoStep(3)"); pg.wait_for_timeout(100); assert pg.inner_text('#plc').startswith('4 /') and '영상에 없는 단계' in pg.inner_text('#plg'), 'clip past end not treated as missing'
    pg.click('#pln'); pg.wait_for_timeout(100); assert pg.inner_text('#plc').startswith('5 /'), 'next button stuck'
    print('errors', errs)
