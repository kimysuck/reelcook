# v1.13 F-J1 AI 채점: 채점 AI 둘(A·B)이 기준 4개를 따로 판정 → 의견이 갈린 기준만 검토 AI가 결정. 사람 판정과 일치율.
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json
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
    # v1.13.1: 채점 모델 이름이 API에 없으면(404) 예비 모델로 넘어가 끝까지 채점, B는 A가 쓴 모델을 피한다. 채점 작업은 prio 2
    setm('mode=caption&email=tester@example.com&resetFiles=1&script=ok,gone,jok,jok')
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.fill('#evIn','https://www.instagram.com/reel/JUDGE002/'); pg.click('#evGo')
    pg.wait_for_selector('.evai', timeout=90000); pg.wait_for_timeout(500)
    ai=pg.inner_text('.evai'); print('항목:', ai.replace('\n',' | '))
    assert 'AI 채점 실패' not in ai and '4/4' in ai, 'judge should pass via fallback'
    g=[(x.split(':')[0], x.split(':')[1], x.split(':')[2]) for x in st()['gemModels']]; print('호출:', g)
    assert [k for m,s_,k in g]==['single','judge','judge','judge'], 'calls'
    assert g[1][:2]==('gemini-3.8-flash','gone') and g[2][0]!='gemini-3.8-flash' and g[3][0] not in ('gemini-3.8-flash', g[2][0]), 'fallback models'
print('errors', errs)
