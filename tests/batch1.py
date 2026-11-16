# v1.11 (피드백 1차): F-U1 확인 필요 재료 · F-U3 첫 실행 안내 · F-U4 예상 시간 · AI 사용량 테스터 전용 · F-A2 점검 보호·sweep 제한
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
FAKE=open('fake-supabase2.js').read()
BASE="localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1');"
R={'title':'테스트','servings':2,'ingredients':[
  {'name':'간장','orig_qty':2,'orig_unit':'숟갈','ml':20,'primary':'ml'},
  {'name':'설탕','orig_qty':1,'orig_unit':'숟갈','grams':12,'primary':'g','estimated':True},
  {'name':'후추','orig_qty':None,'orig_unit':'약간','estimated':True}],'steps':[{'text':'[[0]]를 넣는다'}]}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L())
    # ── F-U3: 첫 실행 안내
    ctx=b.new_context(viewport={'width':390,'height':844}); ctx.add_init_script(BASE)
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_selector('.gsteps', timeout=5000); g=pg.inner_text('.gsteps'); print('안내:', g.replace('\n',' | ')[:120])
    assert '인스타에서 공유 → 릴쿡' in g, 'android guide'
    pg.click('#gdok'); pg.goto(B+'/'); pg.wait_for_timeout(1200); assert not pg.is_visible('.gsteps'), 'guide shown twice'
    pg.click('#setBtn'); pg.click('#guideBtn'); pg.wait_for_selector('.gsteps'); print('설정에서 다시 보기: OK'); pg.click('#gdx')
    ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844}); ctx.add_init_script(BASE); pg=ctx.new_page(); pg.goto(B+'/?share=1'); pg.wait_for_timeout(1500)
    assert not pg.is_visible('.gsteps'), 'guide on share launch'; print('공유로 처음 열면 안내 생략: OK'); ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    ctx.add_init_script(BASE); pg=ctx.new_page(); pg.goto(B+'/'); pg.wait_for_selector('.gsteps', timeout=5000)
    assert '링크 복사' in pg.inner_text('.gsteps'), 'ios guide'; print('아이폰 안내: 링크 복사 → 붙여넣기'); ctx.close()

    # ── F-U1 · F-U4 · 사용량
    ctx=b.new_context(viewport={'width':390,'height':844}); ctx.add_init_script(BASE+"localStorage.setItem('rc_guided','true');")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(1200)
    pg.evaluate("r=>{ openRecipe(normalize(r), null); S.rtab='step'; render(); }", R)
    t=pg.inner_text('#estJump'); print('F-U1:', t); assert '확인이 필요한 재료 1개' in t, 'word amount should not count'
    pg.click('#estJump'); pg.wait_for_timeout(200)
    assert pg.evaluate("S.rtab")=='ing' and pg.locator('.ing.isest').count()==1 and pg.locator('.ing.flash').count()==1, 'jump/flash'
    pg.evaluate("R2=>{ R2.ingredients.forEach(i=>i.estimated=false); openRecipe(normalize(R2), null); }", R); assert pg.locator('#estJump').count()==0, 'shown with 0'
    pg.click('#back')
    setm('mode=caption&deadline=60000&script=slow,ok')
    pg.evaluate("""()=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/BATCH001/';f.appendChild(t);document.body.appendChild(f);f.submit();}""")
    pg.wait_for_function("document.querySelector('.prog-time')&&S.jobId", timeout=20000)
    pt=pg.inner_text('.prog'); print('F-U4:', pt.split('\n')[1:3]); assert '보통 1~2분 걸려요' in pt and '영상만 있는 릴스는 조금 더 걸려요' in pt, 'time hint'
    pg.wait_for_selector('.rhead h1', timeout=90000); pg.click('#back'); setm('deadline=270000')
    # 일반 이용자: 남은 횟수만, 사용량 버튼 없음 / 점검 주소 막힘
    pg.click('#setBtn'); pg.wait_for_function("!document.querySelector('#quotaLine').innerText.includes('확인하는')", timeout=8000)
    q=pg.inner_text('#quotaLine'); print('일반:', q); assert '오늘 남은 분석' in q and pg.locator('#usageBtn').count()==0, 'non-tester usage'
    st=pg.evaluate("async()=>{ const r=await fetch('/api/jobs?diag=1',{headers:await jobHeaders()}); return r.status; }"); print('점검 주소(일반):', st); assert st==403, 'diag open'
    pg.evaluate("$('#layer').innerHTML=''")
    # 테스터: 사용량 버튼·점검
    setm('mode=caption&email=tester@example.com'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.wait_for_function("!document.querySelector('#quotaLine').innerText.includes('확인하는')", timeout=8000)
    print('테스터:', pg.inner_text('#quotaLine')); assert '제한이 없어요' in pg.inner_text('#quotaLine') and pg.locator('#usageBtn').count()==1, 'tester usage'
    st=pg.evaluate("async()=>{ const r=await fetch('/api/jobs?diag=1',{headers:await jobHeaders()}); return r.status; }"); assert st==200, 'tester diag'
    # sweep: 20초 안 두 번째 호출은 무시
    a=json.loads(urllib.request.urlopen(B+'/api/jobs?sweep=1', data=b'{}').read()); c=json.loads(urllib.request.urlopen(B+'/api/jobs?sweep=1', data=b'{}').read())
    print('sweep:', a, c); assert 'owners' in a and c.get('skipped'), 'sweep rate limit'
print('errors', errs)
