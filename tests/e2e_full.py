from playwright.sync_api import sync_playwright
from common import TV
import json, urllib.request
B='http://localhost:8788'
def st(): return json.loads(urllib.request.urlopen(B+'/__st').read())
def get(p): urllib.request.urlopen(B+p).read()
get('/__set?mode=caption'); get('/__unsafe?v=0')
FAKE=open('fake-supabase2.js').read()
share="""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/DcWRR4CsHvb/';f.appendChild(t);document.body.appendChild(f);f.submit();}"""
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'2026-11-12T00:00:00Z'}))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    ctx.route('https://fake.supabase.co/storage/v1/object/public/photos/**', lambda r: r.fulfill(status=200, content_type='image/jpeg', body=urllib.request.urlopen(B+'/__photo/'+r.request.url.split('/photos/')[1]).read()))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(500); pg.screenshot(path='splash.png'); print('splash visible:', pg.is_visible('#splash'))
    pg.wait_for_timeout(1300); print('splash gone:', pg.query_selector('#splash') is None)
    pg.evaluate("localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    # 로그인 → 첫 프로필 설정
    pg.click('#who'); pg.wait_for_selector('#nn', timeout=5000); print('onboarding:', pg.inner_text('.sheet h3'))
    pg.fill('#nn','자취요리왕'); pg.set_input_files('#avIn','face.jpg'); pg.wait_for_timeout(500); pg.click('#pfs'); pg.wait_for_selector('#nn', state='detached', timeout=8000)
    print('header:', pg.inner_text('#who'), '| profile:', {k:st()['profiles'][0][k] for k in ('name','setup_done','avatar_flagged')})
    # 분석 → 레시피 화면 UI
    pg.evaluate(share); pg.wait_for_selector('.rhead h1', timeout=20000)
    print('detail: nav hidden', not pg.is_visible('nav.tabs'), '| actbar:', pg.inner_text('#actbar').replace('\n',' '))
    pg.screenshot(path='detail.png')
    pg.click('[data-rt=step]'); pg.wait_for_timeout(300); pg.mouse.wheel(0,600); pg.wait_for_timeout(600); print('actbar hidden on scroll:', 'hide' in pg.get_attribute('#actbar','class'))
    pg.mouse.wheel(0,-300); pg.wait_for_timeout(500); print('actbar back on scroll up:', 'hide' not in pg.get_attribute('#actbar','class'))
    # 공유 → 레시피만 공유
    pg.click('#shareBtn'); pg.wait_for_selector('#shR'); pg.screenshot(path='sharesheet.png'); pg.click('#shR')
    pg.fill('#px','진짜 쉬워요'); pg.click('#pg'); pg.wait_for_selector('.post', timeout=8000)
    print('recipe post:', pg.inner_text('.post .kindtag'), '|', pg.inner_text('.post .rcard b'))
    # 요리 인증 (부적절 사진 → 모자이크)
    get('/__unsafe?v=1')
    pg.click('#newCook'); pg.set_input_files('#pIn','dish.jpg'); pg.wait_for_selector('#chgP'); pg.fill('#pt','오늘 저녁'); pg.click('[data-st="5"]'); pg.click('#pg')
    pg.wait_for_selector('.flagged', timeout=8000); print('flagged label:', pg.inner_text('.flagged'))
    get('/__unsafe?v=0')
    # 부적절한 글 → 거절
    pg.click('#newCook'); pg.set_input_files('#pIn','dish.jpg'); pg.wait_for_selector('#chgP'); pg.fill('#pt','욕설 테스트'); pg.click('#pg'); pg.wait_for_selector('#perr .err', timeout=8000)
    print('bad text:', pg.inner_text('#perr')); pg.click('#cc')
    pg.click('[data-ff="recipe"]'); print('filter recipe count:', len(pg.query_selector_all('.post')))
    pg.click('[data-ff="all"]'); pg.wait_for_timeout(300); pg.screenshot(path='feed2.png', full_page=True)
    s=st(); print('posts:', s['posts']); print('uploads:', s['uploads'])
    print('errors:', errs)
