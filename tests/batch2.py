# v1.12 (피드백 2차): F-U2 원작자 표시 · F-J2 사용 후기 · F-A1 운영 지표 · F-J3 비용 · F-U4 서버 평균 시간
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
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1');localStorage.setItem('rc_guided','true')")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(1200)

    # ── F-U2: 원작자 아이디와 원본 링크
    setm('mode=caption&script=ok'); share(pg,'OWNER001'); pg.wait_for_selector('.rhead h1', timeout=60000)
    cr=pg.inner_text('.credit'); print('원작자:', cr); assert '@cook' in cr and '원본 릴스 보기' in cr, 'credit'
    assert pg.get_attribute('.credit a','href')=='https://www.instagram.com/cook/', 'owner link'
    # 저장된 분석으로 다시 열어도(캐시) 원작자 유지
    pg.click('#back'); share(pg,'OWNER001'); pg.wait_for_selector('.rhead h1', timeout=30000); assert '@cook' in pg.inner_text('.credit'), 'cached owner'
    # 공개 피드용 레시피에는 원작자 정보가 빠진다(링크만)
    pub=pg.evaluate("publicRecipe(S.recipe).source"); print('피드 공개용 출처:', pub); assert pub=={'link':'https://www.instagram.com/reel/OWNER001/'}, 'public recipe source'
    pg.click('#back')

    # ── 운영 통계가 쌓였는지 (ok 1 · cached 1 · apify 1 · 토큰)
    s=st()['stats']; kinds={v['kind']:v for v in s.values()}; print('통계:', {k:(v['n'],v['sec'],v['tokens_in']) for k,v in kinds.items()})
    assert kinds['ok']['n']==1 and kinds['cached']['n']==1 and kinds['apify']['n']==1 and kinds['tok']['tokens_in']>0, 'stats'

    # ── F-J2: 사용 후기 (설정 → 남기기 → 한 번만)
    pg.click('#setBtn'); pg.click('#surveyBtn'); pg.wait_for_selector('.survey .sq')
    assert pg.is_disabled('#svGo'), 'submit before answers'
    for i in range(10): pg.click(f'[data-sq="{i}:{4 if i%2==0 else 2}"]')   # SUS = (5*3 + 5*3)*2.5 = 75
    pg.click('[data-ck="10"]'); pg.fill('#svText','공유 한 번으로 돼서 편해요'); pg.click('#svGo'); pg.wait_for_timeout(600)
    f=st()['feedback']; print('후기 저장:', f[0]['sus'], f[0]['cook_min'], f[0]['comment'], f[0]['owner'][:6]); assert len(f)==1 and f[0]['cook_min']==10 and f[0]['owner'].startswith('d:'), 'feedback saved'
    pg.click('#setBtn'); pg.click('#surveyBtn'); pg.wait_for_timeout(300); assert not pg.is_visible('.survey'), 'survey twice'
    pg.evaluate("$('#layer').innerHTML=''")
    # 같은 폰에서 기록을 지우고 다시 보내도 서버가 막는다(409)
    code=pg.evaluate("async()=>{ const r=await fetch('/api/usage',{method:'POST',headers:{'Content-Type':'application/json',...await jobHeaders()},body:JSON.stringify({feedback:{sus:[3,3,3,3,3,3,3,3,3,3]}})}); return r.status; }")
    print('중복 후기:', code); assert code==409, 'duplicate feedback'

    # ── 테스터 화면: 운영 지표 · 비용 · 후기 (F-A1 · F-J3)
    setm('mode=caption&email=tester@example.com'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#usageBtn'); pg.wait_for_selector('.usage.ops', timeout=8000); pg.wait_for_timeout(300)
    t=pg.inner_text('#ub'); ops=t[t.index('운영 지표'):t.index('서버 분석')]; print(ops)
    assert '오늘\t1' in ops.replace(' +저장 1','') or '오늘\n1' in ops, 'ops today'
    # 3.8 Flash 프로모션 $0.75/$3.75, 정가 $1.50/$7.50 → 입력 12k·출력 0.9k = $0.012375 → ₩17 (정가 ₩34)
    assert '분석 1건당 입력 12.0k · 출력 0.9k 토큰 → ₩17 (정가 ₩34)' in ops and '환율 1360원' in ops, 'cost'
    assert '1명 · SUS 평균 75점' in ops and '요리 시작까지 평균 10분' in ops and '공유 한 번으로' in ops, 'feedback summary'
print('errors', errs)
