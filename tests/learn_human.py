# v1.14 사람 평가에서 배우기: ✗+이유를 고르고 요약을 복사하면 서버가 영상을 다시 보고 규칙을 만든다(같은 뜻이면 기존 규칙 횟수만 올림)
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
FAKE=open('fake-supabase2.js').read()
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.grant_permissions(['clipboard-read','clipboard-write'], origin=B)
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1');localStorage.setItem('rc_guided','true')")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(1200)
    setm('mode=caption&email=tester@example.com'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    setm('mode=caption&email=tester@example.com&script=ok,learnY,learnN')
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.uncheck('#evAI')
    pg.fill('#evIn','https://www.instagram.com/reel/HUMAN01/'); pg.click('#evGo')
    pg.wait_for_selector('[data-evm="0:ng"]', timeout=90000); pg.wait_for_timeout(500)
    pg.click('[data-evm="0:ng"]'); pg.click('[data-evw="0:amount"]'); pg.fill('[data-evn="0"]','간장 2숟갈인데 1숟갈'); pg.dispatch_event('[data-evn="0"]','change')
    pg.click('#evCopy')
    for _ in range(40):
        if st()['lessons']: break
        time.sleep(0.5)
    L_=st()['lessons']; print('규칙:', L_)
    assert len(L_)==1 and L_[0]['source']=='human' and L_[0]['first_code']=='HUMAN01', 'human lesson'
    g=[x['kind'] for x in st()['gem']]; print('호출:', g); assert g==['single','learn'], 'learn call'
    # 두 번 복사해도 같은 항목을 다시 보내지 않는다
    pg.click('#evCopy'); time.sleep(2); assert [x['kind'] for x in st()['gem']]==['single','learn'], 'no duplicate learn'
print('errors', errs)
