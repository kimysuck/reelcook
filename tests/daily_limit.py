from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request
B='http://localhost:8788'
FAKE=open('fake-supabase2.js').read()
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
with sync_playwright() as p:
    b=p.chromium.launch(**L(), ); ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_at',String(Date.now()))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(800)
    pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(800); pg.evaluate("$('#layer').innerHTML=''")
    def share(c): pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", c)
    setm('mode=caption&script=ok&fill=10&email=tester@example.com'); share('TESTER0001')
    pg.wait_for_selector('.rhead h1, .err', timeout=30000); print('tester (10회 다 쓴 상태):', 'OK 레시피' if pg.locator('.rhead h1').count() else pg.inner_text('.err'))
    pg.evaluate("history.back()"); pg.wait_for_timeout(400)
    setm('mode=caption&script=ok&fill=10&email=kim@example.com'); share('NORMAL0001')
    pg.wait_for_selector('.rhead h1, .err', timeout=30000); print('일반 회원:', pg.inner_text('.err').split('\n')[0] if pg.locator('.err').count() else '레시피(잘못)')
    pg.screenshot(path='u_limit.png')
    setm('mode=caption&script=ok&fill=5&email=kim@example.com'); share('NORMAL0002')
    pg.wait_for_selector('.rhead h1', timeout=30000); pg.wait_for_timeout(300); print('남은 횟수 안내:', pg.inner_text('.toast') if pg.locator('.toast').count() else None)
    print('errors', errs)
