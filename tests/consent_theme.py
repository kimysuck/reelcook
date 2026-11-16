from playwright.sync_api import sync_playwright
from common import TV, L
B='http://localhost:8788'
FAKE=open('fake-supabase2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(**L(), ); ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2)
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/')
    for i,t in enumerate([450,500,450,500,600]):   # 0.45 .95 1.4 1.9 2.5
        pg.wait_for_timeout(t); pg.screenshot(path=f'sp{i}.png')
    pg.wait_for_timeout(700); pg.screenshot(path='gate.png')
    assert pg.is_disabled('#agGo')
    pg.click('[data-doc=terms]'); pg.wait_for_selector('.doc h1'); pg.wait_for_timeout(200); pg.screenshot(path='gate_doc.png')
    pg.click('.modal .x')
    pg.click('#agAll'); assert not pg.is_disabled('#agGo')
    pg.click('#agAll'); assert pg.is_disabled('#agGo')
    for k in ['age','terms','privacy']: pg.click(f'[data-agree={k}]')
    assert not pg.is_disabled('#agGo'); pg.click('#agGo')
    pg.wait_for_timeout(200); print('gate hidden', pg.is_hidden('#gate'), pg.evaluate("localStorage.getItem('rc_consent')"))
    # v1.11: 동의 직후 첫 실행 안내가 한 번 뜬다(F-U3) → 확인하고 닫기
    pg.wait_for_selector('.gsteps', timeout=5000); print('first-run guide shown after consent'); pg.click('#gdok')
    pg.reload(); pg.wait_for_timeout(3200); print('gate after reload hidden', pg.is_hidden('#gate'))
    # 테마
    pg.evaluate("localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    for th in ['bright','dark']:
        pg.evaluate(f"localStorage.setItem('rc_theme',JSON.stringify('{th}'))"); pg.reload(); pg.wait_for_timeout(3000)
        pg.screenshot(path=f'th_{th}.png'); print(th, pg.evaluate("document.documentElement.dataset.theme"), pg.evaluate("document.querySelector('meta[name=theme-color]').content"))
    pg.click('#setBtn'); pg.wait_for_timeout(300); pg.screenshot(path='th_set.png')
    print('errors', errs)
