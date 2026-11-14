from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json
B='http://localhost:8788'
urllib.request.urlopen(B+'/__set?mode=caption&script=cover&resetUsage=1').read()
FAKE=open('fake-supabase2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(**L(), args=['--autoplay-policy=no-user-gesture-required']); ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'2026-11-12T00:00:00Z'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_at',String(Date.now()))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/PLAYER01/';f.appendChild(t);document.body.appendChild(f);f.submit();}""")
    pg.wait_for_function("typeof reelMemo!=='undefined' && reelMemo && reelMemo.u", timeout=20000)
    print('prefetch started before result:', pg.evaluate("!S.recipe"))
    pg.wait_for_selector('.rhead h1', timeout=30000)
    pg.wait_for_function("S.recipe && S.recipe.cover && S.recipe.cover.startsWith('data:image')", timeout=20000)
    st=json.load(urllib.request.urlopen(B+'/__st')); print('video range requests', st['ranges'])
    pg.wait_for_timeout(500); pg.screenshot(path='p_hero.png')
    pg.click('[data-rt=step]'); pg.click('#vguide'); pg.wait_for_selector('#player video'); pg.wait_for_timeout(1500)
    print('playing', pg.evaluate("!PL.v.paused"), 't', round(pg.evaluate("PL.v.currentTime"),1), 'step', pg.inner_text('#plc'))
    pg.screenshot(path='p_play.png')
    pg.evaluate("PL.v.currentTime=9.5"); pg.wait_for_timeout(900)
    print('follow → step', pg.inner_text('#plc'))
    pg.click('#plp'); pg.wait_for_timeout(500); print('prev → ', pg.inner_text('#plc'), 't', round(pg.evaluate("PL.v.currentTime"),1))
    pg.click('#pll'); pg.wait_for_timeout(200); pg.evaluate("PL.v.currentTime=7.5"); pg.wait_for_timeout(700)
    print('loop keeps step', pg.inner_text('#plc'), 't', round(pg.evaluate("PL.v.currentTime"),1))
    pg.click('#plh'); pg.wait_for_timeout(200); pg.screenshot(path='p_min.png')
    pg.evaluate("history.back()"); pg.wait_for_timeout(400); print('back closes player', pg.locator('#player').count()==0, 'recipe', pg.evaluate("!!S.recipe"))
    pg.evaluate("window.scrollTo(0,0)"); pg.click('#pickCover'); pg.wait_for_selector('.cpick button'); pg.screenshot(path='p_pick.png')
    old=pg.evaluate("S.recipe.cover.length"); pg.click('.cpick button >> nth=0'); pg.wait_for_timeout(500); print('cover changed', old!=pg.evaluate("S.recipe.cover.length"))
    pg.set_viewport_size({'width':844,'height':390}); pg.click('[data-rt=step]'); pg.click('#vguide'); pg.wait_for_timeout(1200); pg.screenshot(path='p_land.png')
    print('errors', errs)
