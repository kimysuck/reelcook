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
    # 분석(ok) → 채점자 A(모두 통과) → 채점자 B(분량 불통과) → 검토 AI(B가 맞음)
    setm('mode=caption&email=tester@example.com&resetFiles=1&script=ok,jok,jamt,arbB')
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    assert pg.is_checked('#evAI'), 'AI judging on by default'
    pg.fill('#evIn','https://www.instagram.com/reel/JUDGE001/'); pg.click('#evGo')
    pg.wait_for_selector('.evai', timeout=90000); pg.wait_for_timeout(500)
    ai=pg.inner_text('.evai'); print('항목:', ai.replace('\n',' | '))
    assert 'AI 채점 틀림' in ai and '✗ 분량' in ai and '✓ 재료' in ai and '두 AI 일치 3/4 (검토 1)' in ai and '간장 2숟갈' in ai, 'judge line'
    assert '채점 기준: 재료 빠짐 없음 · 분량 ±30%' in pg.inner_text('#app'), 'rubric shown'
    g=[(x.split(':')[0], x.split(':')[2]) for x in st()['gemModels']]; print('호출:', g)
    assert [k for m,k in g]==['single','judge','judge','arb'] and g[1][0]=='gemini-3.8-flash' and g[2][0]=='gemini-3.6-flash' and g[3][0]=='gemini-3.7-flash', 'judge models'
    assert st()['files']['up']==2, 'judge should upload the video once'   # 분석 1 + 채점 1
    # 사람도 ✗ → 사람과 AI 일치 1/1
    pg.click('[data-evm="0:ng"]'); pg.click('#evCopy'); pg.wait_for_timeout(300); t=pg.evaluate('navigator.clipboard.readText()')
    print(t[t.index('[AI 채점]'):t.index('[AI 채점]')+260])
    for k in ['[AI 채점] 1개 · 맞은 비율 0%','기준별 통과: 재료 1/1 · 분량 0/1 · 순서 1/1 · 방법 1/1','채점 AI 둘의 일치: 3/4 기준 · 검토 AI가 결정 1번','사람과 AI 일치: 1/1개 (100%)','채점 모델: gemini-3.8-flash, gemini-3.6-flash, gemini-3.7-flash','AI 채점 틀림: ✓ 재료 · ✗ 분량','[릴스 유형별] 표본 1개 (목표 30개까지 29개)']:
        assert k in t, 'summary missing: '+k
    # 채점 토큰은 분석 통계와 따로
    s=st()['stats']; kinds={v['kind']:v for v in s.values()}; print('통계 judge:', kinds.get('judge'))
    assert kinds['judge']['n']==1 and kinds['judge']['tokens_in']==36000 and kinds['tok']['tokens_in']==12000, 'judge tokens separate'
print('errors', errs)
