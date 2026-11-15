# 시작 애니메이션(v1.10): 앱을 새로 켤 때마다 나온다. 다시 켜도, 인스타 공유로 열어도 나오고, 구글 로그인에서 돌아올 때만 생략
from playwright.sync_api import sync_playwright
from common import TV, L
B='http://localhost:8788'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    def shown(): pg.wait_for_timeout(300); return pg.is_visible('#splash')
    pg.goto(B+'/'); a=shown(); print('처음 켤 때', a); assert a, 'first launch'
    pg.wait_for_selector('#splash', state='detached', timeout=6000)
    pg.goto(B+'/'); a=shown(); print('바로 다시 켤 때', a); assert a, 'relaunch within 6h should show now'
    pg.goto(B+'/?share=1'); a=shown(); print('공유로 열 때', a); assert a, 'share launch'
    pg.goto(B+'/?job=1'); a=shown(); print('알림으로 열 때', a); assert a, 'notification launch'
    pg.goto(B+'/?code=abc'); a=shown(); print('로그인에서 돌아올 때', a); assert not a, 'login return should skip'
    # 아이콘: 새 아이콘 주소(?v=2)가 매니페스트·페이지에 있고 실제로 받아진다
    import json, urllib.request
    m=json.loads(urllib.request.urlopen(B+'/manifest.webmanifest').read()); srcs=[i['src'] for i in m['icons']]; print('아이콘', srcs)
    assert all(s.endswith('?v=2') for s in srcs) and all(urllib.request.urlopen(B+s).status==200 for s in srcs), 'icons'
print('errors', errs)
