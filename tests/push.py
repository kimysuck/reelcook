# 분석 완료 알림: 알림을 켜면 서버가 분석을 끝낸 뒤 이 폰으로 (암호화된) 알림을 보낸다
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
def pushes(): return json.load(urllib.request.urlopen(B+'/__pushes'))
SUB=urllib.request.urlopen(B+'/__pushsub').read().decode()
FAKE=open('fake-supabase2.js').read()
def share(pg, code):
    pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", code)
def wait_push(n, sec=40):
    t=time.time()
    while time.time()-t<sec:
        p=pushes()
        if len(p)>=n: return p
        time.sleep(0.4)
    raise AssertionError(f'push not sent: {pushes()}')
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.grant_permissions(['notifications','clipboard-read','clipboard-write'], origin=B)
    ctx.add_init_script("window.__testPushSub="+SUB+";if(!localStorage.getItem('rc_consent')){localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))};localStorage.setItem('rc_splash_at',String(Date.now()))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1500)
    print('알림 상태', pg.evaluate('pushState()'))

    # 1) 알림이 켜져 있으면: 맡길 때 알림 주소를 같이 보내고, 앱을 닫아도 끝나면 알림
    setm('mode=caption&script=ok'); share(pg,'PUSH001')
    pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_job')||'null')||{}).id", timeout=20000)
    assert '끝나면 알림으로 알려 드릴게요' in pg.inner_text('#app'), 'no push notice'
    pg.close()
    m=wait_push(1)[0]; print('알림 1:', m)
    assert m.get('signed') and m['title']=='대패삼겹 숙주볶음 레시피가 준비됐어요' and m['url']=='/?job=1', 'bad push'
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_selector('.rhead h1', timeout=20000); pg.click('#back')

    # 2) 알림이 꺼져 있다가 분석 중에 "끝나면 알림 받기"를 누르면 → 이미 맡긴 작업에 알림 주소를 붙인다
    pg.evaluate("localStorage.setItem('rc_push',JSON.stringify('off'))"); pg.wait_for_timeout(200)
    setm('mode=caption&deadline=9000&script=slow,ok'); share(pg,'PUSH002')
    pg.wait_for_selector('[data-push-on]', timeout=20000); print('버튼:', pg.inner_text('[data-push-on]'))
    pg.click('[data-push-on]'); pg.wait_for_function("document.body.innerText.includes('끝나면 알림으로 알려 드릴게요')", timeout=10000)
    m=wait_push(2, 60)[1]; print('알림 2:', m['title']); assert '레시피가 준비됐어요' in m['title'], 'attached push not sent'
    pg.wait_for_selector('.rhead h1', timeout=30000); pg.click('#back'); setm('deadline=270000')

    # 3) 평가 모드 3개 → 알림은 모두 끝났을 때 한 번만
    setm('mode=caption&email=tester@example.com&script=ok,ok,ok'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.fill('#evIn','https://www.instagram.com/reel/PUSHEV1/\nhttps://www.instagram.com/reel/PUSHEV2/\nhttps://www.instagram.com/reel/PUSHEV3/')
    pg.click('#evGo'); pg.wait_for_function("document.querySelector('.evsum') && document.querySelector('.evsum').innerText.startsWith('3/3')", timeout=60000); pg.wait_for_timeout(1500)
    ev=[x for x in pushes()[2:]]; print('평가 알림:', [x['title'] for x in ev])
    assert len(ev)==1 and ev[0]['title']=='평가 분석이 모두 끝났어요' and ev[0]['url']=='/?eval=1', 'eval should notify once'

    # 4) 설정에서 알림 끄기 → 다음 분석은 알림 없음
    pg.click('#evBack'); pg.click('#setBtn'); pg.click('[data-pu="off"]'); pg.wait_for_timeout(300); pg.evaluate("$('#layer').innerHTML=''")
    n=len(pushes()); setm('mode=caption&script=ok'); share(pg,'PUSH004'); pg.wait_for_selector('.rhead h1', timeout=30000); pg.wait_for_timeout(1500)
    assert len(pushes())==n, 'pushed after turning off'; print('알림 끄면 안 보냄: OK')
print('errors', errs)
