# 인스타 "공유"로 앱이 열릴 때: 로그인·설정이 늦게 불러와져도
#  - 테스터 계정의 하루 횟수 예외가 그대로 적용되고 (예전: 로그인 없이 맡겨져 10회 제한에 걸림)
#  - 알림 주소가 작업에 붙어서 앱을 꺼도 끝나면 알림이 온다 (예전: 알림 주소 없이 맡겨져 알림이 안 옴)
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
def pushes(): return json.load(urllib.request.urlopen(B+'/__pushes'))
SUB=urllib.request.urlopen(B+'/__pushsub').read().decode()
FAKE=open('fake-supabase2.js').read()
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.grant_permissions(['notifications'], origin=B)
    ctx.add_init_script("window.__testPushSub="+SUB+";if(!localStorage.getItem('rc_consent')){localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))};localStorage.setItem('rc_splash_off','1')")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1200)
    setm('mode=caption&email=tester@example.com'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500)
    # 오늘 10회를 다 쓴 상태 + 서버 설정이 3초 늦게 옴 → 공유로 앱 열기
    setm('mode=caption&email=tester@example.com&fill=10&configDelay=3000&script=ok')
    pg.evaluate("""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/RACE001/';f.appendChild(t);document.body.appendChild(f);f.submit();}""")
    pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_job')||'null')||{}).id", timeout=30000)
    j=[x for x in st()['jobs'] if (x['link'] or '').endswith('RACE001/')][0]; print('맡긴 작업:', j['status'])
    pg.close(); print('앱 닫음')
    t=time.time()
    while time.time()-t<40 and not pushes(): time.sleep(0.5)
    ps=pushes(); print('알림:', [x.get('title') for x in ps])
    assert ps and ps[0]['title']=='대패삼겹 숙주볶음 레시피가 준비됐어요', 'no push (or tester limit applied): '+json.dumps(ps, ensure_ascii=False)
    setm('configDelay=0&fill=0')
print('errors', errs)
