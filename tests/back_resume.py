from playwright.sync_api import sync_playwright
from common import TV
import urllib.request
B='http://localhost:8788'
urllib.request.urlopen(B+'/__set?mode=caption&script=').read()
FAKE=open('fake-supabase2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'2026-11-12T00:00:00Z'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(300)
    print('first launch splash shown', pg.is_visible('#splash'))
    pg.wait_for_timeout(3000)
    pg.evaluate("""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/BACKTEST1/';f.appendChild(t);document.body.appendChild(f);f.submit();}""")
    pg.wait_for_selector('.rhead h1', timeout=30000)
    print('share launch splash shown', pg.locator('#splash').count())
    back=lambda: (pg.evaluate("history.back()"), pg.wait_for_timeout(350))
    # 요리 모드 → 뒤로 → 레시피
    pg.click('#cookBtn'); pg.wait_for_timeout(300); back()
    print('after back from cook: cooking', pg.evaluate("S.cooking"), 'recipe', pg.evaluate("!!S.recipe"))
    # 공유 시트 → 뒤로
    pg.click('#shareBtn'); pg.wait_for_timeout(200); back()
    print('share sheet closed', pg.evaluate("$('#layer').innerHTML.trim()===''"), 'recipe', pg.evaluate("!!S.recipe"))
    # 인분 3, 재료탭 → 앱이 꺼졌다 켜진 것처럼 (숨김 → 새로고침)
    pg.click('#sp'); pg.click('[data-rt=step]'); pg.wait_for_timeout(200)
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))") ; pg.evaluate("saveResume()")
    pg.goto(B+'/'); pg.wait_for_timeout(1200)
    print('resumed recipe', pg.evaluate("S.recipe&&S.recipe.title"), 'servings', pg.evaluate("S.servings"), 'rtab', pg.evaluate("S.rtab"), 'splash', pg.locator('#splash').count())
    # 레시피 → 뒤로 → 첫 화면
    back(); print('back to root: recipe', pg.evaluate("!!S.recipe"), 'url', pg.url)
    # 다른 탭 → 뒤로 → 가져오기 탭
    pg.click('[data-tab=box]'); pg.wait_for_timeout(200); back(); print('tab after back', pg.evaluate("S.tab"))
    # 설정 → 뒤로
    pg.click('#setBtn'); pg.wait_for_timeout(200); back(); print('settings closed', pg.evaluate("$('#layer').innerHTML.trim()===''"))
    # 첫 화면에서 뒤로 → 안내, 2초 안에 다시 → 앱 밖으로
    back(); print('toast', pg.inner_text('.toast') if pg.locator('.toast').count() else None, 'still in app', pg.url.startswith(B))
    pg.evaluate("history.back()"); pg.wait_for_timeout(800); print('after 2nd back url', pg.url[:40])
    print('errors', errs)
