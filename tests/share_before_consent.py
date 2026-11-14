from playwright.sync_api import sync_playwright
from common import TV
import urllib.request
B='http://localhost:8788'; urllib.request.urlopen(B+'/__set?mode=caption').read()
FAKE=open('fake-supabase2.js').read()
share="""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/DcWRR4CsHvb/';f.appendChild(t);document.body.appendChild(f);f.submit();}"""
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1500); pg.evaluate("localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    pg.evaluate(share); pg.wait_for_timeout(2500)
    print('gate shown', pg.is_visible('#gate'), 'busy before', pg.evaluate("S.busy"), pg.evaluate("S.link"))
    pg.click('#agAll'); pg.click('#agGo')
    pg.wait_for_selector('.rhead h1', timeout=30000); print('analyzed', pg.inner_text('.rhead h1'), pg.inner_text('.ailabel'))
    print('errors', errs)
