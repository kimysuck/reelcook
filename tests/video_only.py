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
    pg.goto(B+'/'); pg.wait_for_timeout(400)
    def share(code): pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", code)
    setm('mode=silent&script=scanlog,pasta&video=reel.webm'); share('SCANUI01')
    pg.wait_for_function("document.body.innerText.includes('장면별로 기록')", timeout=30000); pg.screenshot(path='u_scan.png')
    pg.wait_for_selector('.rhead h1', timeout=30000); print('recipe', pg.inner_text('.rhead h1'), '|', pg.inner_text('.ailabel').split('\n')[-1])
    pg.click('#back'); pg.wait_for_timeout(200)
    setm('mode=silent&script=scannot'); share('SCANNOT01'); pg.wait_for_selector('.err', timeout=30000); print('err:', pg.inner_text('.err').replace('\n',' / '))
    pg.screenshot(path='u_err.png')
    print('errors', errs)
