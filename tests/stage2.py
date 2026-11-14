# 2단계: "결과가 이상해요"(이유 기록 + 캐시 건너뛰고 다시 분석 + 저장한 레시피 바꾸기), 저장한 레시피 직접 수정, 평가 모드
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
FAKE=open('fake-supabase2.js').read()
def share(pg, code):
    pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", code)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=1)
    ctx.grant_permissions(['clipboard-read','clipboard-write'], origin=B)
    ctx.add_init_script("if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'2026-11-12T00:00:00Z'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))}")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(2500)

    # 1) 분석 → 저장
    setm('mode=caption&script=ok'); share(pg,'BADRES1'); pg.wait_for_selector('.rhead h1', timeout=30000)
    pg.click('#save'); pg.wait_for_timeout(400)
    assert pg.is_visible('#editBtn'), 'no edit button after save'

    # 2) 결과가 이상해요 → 이유 고르기 → 다시 분석(캐시 건너뜀) → "바꾸기"로 저장한 레시피 교체
    n0=len(st()['gemModels'])
    pg.click('#badResult'); pg.wait_for_selector('[data-why]')
    assert pg.is_disabled('#bdgo'), 'go enabled before reason'
    pg.click('[data-why="amount"]'); setm('mode=caption&script=multi'); pg.click('#bdgo')
    pg.wait_for_selector('.pick', timeout=30000)
    s=st(); rep=[f for f in s['fails'] if f['error']=='user_report']
    print('report', rep[:1]); assert rep and rep[0]['reel_code']=='BADRES1' and rep[0]['notes']==['amount'], 'report not logged'
    assert len(s['gemModels'])>0, 'not re-analyzed (cache used)'
    assert pg.inner_text('#save').strip().endswith('바꾸기'), 'save button should say 바꾸기: '+pg.inner_text('#save')
    pg.click('#save'); pg.wait_for_timeout(400)
    my=pg.evaluate("JSON.parse(localStorage.getItem('rc_recipes'))")
    print('saved count', len(my)); assert len(my)==1, 'replace made a duplicate'
    assert my[0]['recipe']['sources']==['caption','owner_comment','onscreen_text'], 'saved recipe not replaced'

    # 3) 직접 수정: 제목, 분량(2숟갈→3숟갈), 재료 빼기, 단계 더하기
    pg.click('#editBtn'); pg.wait_for_selector('#edT')
    pg.fill('#edT','내 숙주볶음')
    amts=pg.eval_on_selector_all('[data-ia]','els=>els.map(e=>e.value)'); print('amounts', amts)
    i_soy=[i for i,v in enumerate(pg.eval_on_selector_all('[data-in]','els=>els.map(e=>e.value)')) if v=='간장'][0]
    pg.fill(f'[data-ia="{i_soy}"]','3 숟갈')
    names=pg.eval_on_selector_all('[data-in]','els=>els.map(e=>e.value)'); i_pep=names.index('후추')
    pg.click(f'[data-idel="{i_pep}"]')
    pg.click('#edAddS'); pg.fill('[data-st]:last-of-type' if False else f'[data-st="{pg.locator("[data-st]").count()-1}"]','접시에 담는다')
    pg.click('#eds'); pg.wait_for_selector('.rhead h1'); pg.wait_for_timeout(300)
    assert pg.inner_text('.rhead h1')=='내 숙주볶음', 'title not edited'
    assert 'AI 정리 + 직접 고침' in pg.inner_text('.ailabel'), 'edited label missing'
    ing=pg.inner_text('#app'); assert '후추' not in ing, 'deleted ingredient still shown'
    assert '3 숟갈' in ing, 'edited amount not shown'
    pg.click('[data-rt="step"]'); pg.wait_for_timeout(200); stx=pg.inner_text('#app')
    assert '접시에 담는다' in stx and '간장 3 숟갈' in stx, 'steps not updated / ingredient token lost'
    rec=pg.evaluate("JSON.parse(localStorage.getItem('rc_recipes'))[0].recipe")
    soy=[i for i in rec['ingredients'] if i['name']=='간장'][0]; print('soy', soy['orig_qty'], soy['ml'])
    assert soy['orig_qty']==3 and abs(soy['ml']-30)<0.01, 'gram/ml not rescaled'
    pg.screenshot(path='s2_edit.png')
    pg.click('#back'); pg.wait_for_timeout(300)

    # 4) 평가 모드: 일반 이용자에게는 안 보이고, 테스터로 로그인하면 보인다
    pg.click('#setBtn'); pg.wait_for_timeout(200); assert not pg.is_visible('#evalBtn'), 'eval visible to non-tester'; pg.click('#pwx')
    setm('mode=caption&email=tester@example.com'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    # 3개 분석(성공 · 요리 아님 · 성공) → 진단 정보 → ✓/✗+이유 → 요약 복사
    setm('mode=caption&email=tester@example.com&script=ok,notfood,ok')
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.fill('#evIn','https://www.instagram.com/reel/EVALA1/\nhttps://www.instagram.com/reel/EVALA2/ 메모\nhttps://www.instagram.com/reel/EVALA3/\nhttps://example.com/x')
    pg.click('#evGo'); pg.wait_for_timeout(500)
    nrun=pg.locator('[data-evrun]').count(); print('동시에 분석 중', nrun, pg.inner_text('[data-evrun]')); assert nrun>=2, 'not parallel'
    done="document.querySelectorAll('.evi').length===3 && ![...document.querySelectorAll('.evi .chip')].some(c=>/대기|분석 중/.test(c.textContent))"
    pg.wait_for_function(done, timeout=60000)
    print('diag', pg.inner_text('.evi .evd').replace('\n',' | '))
    assert '자막·음성에 레시피' in pg.inner_text('.evi .evd') and '캡션 분량 3/3 일치' in pg.inner_text('.evi .evd'), 'diagnosis missing'
    pg.click('[data-evm="0:ok"]'); pg.click('[data-evm="2:ng"]'); pg.click('[data-evw="2:amount"]'); pg.fill('[data-evn="2"]','분량이 달라요'); pg.press('[data-evn="2"]','Tab')
    pg.click('[data-evv="0"]'); pg.wait_for_selector('.rhead h1'); pg.click('#back'); pg.wait_for_selector('.evsum')
    pg.click('#evCopy'); pg.wait_for_timeout(300); txt=pg.evaluate('navigator.clipboard.readText()'); print(txt)
    for k in ['분석 3개: 성공 2 · 실패 1','✓ 1 · ✗ 1','(맞은 비율 50%)','[릴스 유형별]','- 자막·음성에 레시피: 2개 → ✓1 ✗1','- 자막: 2개','[틀린 이유] 분량 1','✗ 분량 / 메모: 분량이 달라요','자동검사 3/3','요리 아님']:
        assert k in txt, 'summary missing: '+k
    pg.screenshot(path='s2_eval.png', full_page=True)

    # 5) 새로 켜도 평가 기록이 남아 있다
    pg.reload(); pg.wait_for_timeout(2500); pg.evaluate("$('#layer').innerHTML=''")   # 첫 로그인 프로필 창 닫기
    if not pg.is_visible('.evsum'): pg.click('#setBtn'); pg.click('#evalBtn')
    pg.wait_for_selector('.evsum'); assert '✓ 1' in pg.inner_text('.evsum'), 'eval not kept after reload'

    # 6) 같은 링크로 다시 분석 → 2회차, 지난번 비율과 달라진 것 표시
    setm('mode=caption&email=tester@example.com&script=ok,ok,ok')
    pg.click('#evAgain'); pg.click('#yes'); pg.wait_for_function(done, timeout=60000)
    pg.click('[data-evm="0:ok"]'); pg.click('[data-evm="1:ok"]'); pg.click('[data-evm="2:ok"]')
    pg.click('#evCopy'); pg.wait_for_timeout(300); t2=pg.evaluate('navigator.clipboard.readText()'); print(t2.split('\n')[0:4])
    assert '2회차' in t2 and '지난번 50%' in t2 and '3번 ✗→✓' in t2, 'round compare missing'
print('errors', errs)
