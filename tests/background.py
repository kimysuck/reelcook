# 앱을 꺼도 서버가 분석을 끝낸다: 분석 중에 앱을 닫고 → 서버가 혼자 끝내고 → 다시 열면 결과가 나온다
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
FAKE=open('fake-supabase2.js').read()
INIT="if(!localStorage.getItem('rc_consent')){localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))};localStorage.setItem('rc_splash_off','1');localStorage.setItem('rc_guided','true')"
def share(pg, code):
    pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", code)
def wait_server(cond, sec=60):
    t=time.time()
    while time.time()-t<sec:
        s=st()
        if cond(s): return s
        time.sleep(0.5)
    raise AssertionError('server timeout: '+json.dumps(st()['jobs'])[:400])
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.grant_permissions(['clipboard-read','clipboard-write'], origin=B)
    ctx.add_init_script(INIT)
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1500)

    # 1) 공유 → 분석 중에 앱을 닫음(이어서 분석이 필요한 긴 분석) → 서버가 끝냄 → 다시 열면 레시피
    setm('mode=caption&deadline=12000&resetFiles=1&script=slow,ok'); share(pg,'BGJOB01')
    pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_job')||'null')||{}).id", timeout=20000)
    assert '앱을 닫아도 분석은 서버에서 계속돼요' in pg.inner_text('#app'), 'no background notice'
    pg.close(); print('앱 닫음')
    s=wait_server(lambda s: any((j['link'] or '').endswith('BGJOB01/') and j['status']=='done' for j in s['jobs']), 90)
    print('서버 혼자 끝냄:', [(j['status'],j['hop']) for j in s['jobs']])
    assert [j for j in s['jobs'] if (j['link'] or '').endswith('BGJOB01/')][0]['hop']==1, 'did not continue on server'
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/')
    pg.wait_for_selector('.rhead h1', timeout=20000); print('다시 열자 레시피:', pg.inner_text('.rhead h1'))
    wait_server(lambda s: not any((j['link'] or '').endswith('BGJOB01/') for j in s['jobs']), 10); print('받아 간 작업은 서버에서 삭제됨')
    assert pg.evaluate("localStorage.getItem('rc_job')") in (None,'null'), 'rc_job not cleared'
    pg.click('#back'); pg.wait_for_timeout(300)

    # 2) 평가 모드: 3개를 맡기고 바로 앱을 닫음 → 서버가 2개씩 돌려 모두 끝냄 → 다시 열면 결과가 채워짐
    setm('mode=caption&deadline=270000&email=tester@example.com&script=ok,ok,ok'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.fill('#evIn','https://www.instagram.com/reel/BGEVAL1/\nhttps://www.instagram.com/reel/BGEVAL2/\nhttps://www.instagram.com/reel/BGEVAL3/')
    pg.click('#evGo'); pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_eval')).items).every(x=>x.job)", timeout=20000)
    s=st(); ev=[j for j in s['jobs'] if 'BGEVAL' in (j['link'] or '')]; print('맡긴 평가 작업', [(j['status'],j['prio']) for j in ev])
    assert len(ev)==3 and all(j['prio']==1 for j in ev), 'eval jobs not queued on server'
    pg.close(); print('앱 닫음')
    most=0; t=time.time()
    while time.time()-t<60:
        js=[j for j in st()['jobs'] if 'BGEVAL' in (j['link'] or '')]; most=max(most, sum(j['status']=='running' for j in js))
        if js and all(j['status']=='done' for j in js): break
        time.sleep(0.3)
    print('서버가 동시에 돌린 최대 개수', most); assert most<=2, 'more than 2 at once'
    assert all(j['status']=='done' for j in js), 'eval jobs not finished on server'
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(2500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#evalBtn')
    pg.wait_for_function("document.querySelector('.evsum') && document.querySelector('.evsum').innerText.startsWith('3/3')", timeout=20000)
    print('다시 열자 평가:', pg.inner_text('.evsum'))
    secs=pg.evaluate("JSON.parse(localStorage.getItem('rc_eval')).items.map(x=>[x.sec,x.wait])"); print('서버가 잰 분석 시간·기다림', secs)
    assert all(a is not None and a<30 for a,w in secs) and all(w is not None for a,w in secs), 'server-measured time missing'

    # 3) 설정 > AI 사용량의 서버 분석 점검: 정상
    pg.click('#setBtn'); pg.click('#usageBtn'); pg.wait_for_function("document.querySelector('#jdiag') && !document.querySelector('#jdiag').innerText.includes('확인하는')", timeout=15000)
    print('점검:', pg.inner_text('#jdiag')); assert '정상' in pg.inner_text('#jdiag'), 'diag not ok'
    pg.evaluate("document.querySelectorAll('body > .modal').forEach(m=>m.remove()); $('#layer').innerHTML=''")
    pg.click('#evBack'); pg.wait_for_timeout(300)

    # 4) 서버 작업 상태 확인이 계속 오류로 답하면 → "인터넷 끊김"이 아니라 바로 예전 방식으로 분석해 레시피를 보여 준다
    setm('mode=caption&jobsGetFail=1&script=ok,ok'); share(pg,'GETFAIL01')
    pg.wait_for_selector('.rhead h1, .err', timeout=60000)
    assert pg.locator('.rhead h1').count(), 'no fallback on server error: '+(pg.inner_text('.err') if pg.locator('.err').count() else '')
    print('상태 확인 오류 → 예전 방식으로 분석: OK'); setm('jobsGetFail=0'); pg.evaluate("$('#layer').innerHTML=''"); pg.click('#back'); pg.wait_for_timeout(300)
    pg.evaluate("jobsOff=false")

    # 5) 서버가 작업을 시작하지 못하면(다음 단계 호출 실패) → 오래 기다리지 않고 예전 방식으로
    pg.evaluate("localStorage.setItem('rc_job_stuck_ms','4000')")
    setm('mode=caption&jobbase=http://localhost:1&script=ok'); share(pg,'STUCK01')
    pg.wait_for_selector('.rhead h1, .err', timeout=60000)
    assert pg.locator('.rhead h1').count(), 'no fallback when stuck: '+(pg.inner_text('.err') if pg.locator('.err').count() else '')
    print('작업이 시작 안 됨 → 예전 방식으로 분석: OK'); pg.evaluate("$('#layer').innerHTML=''"); pg.click('#back'); pg.wait_for_timeout(300)
    pg.evaluate("jobsOff=false; localStorage.removeItem('rc_job_stuck_ms')")
    pg.evaluate("$('#layer').innerHTML=''"); pg.click('#setBtn'); pg.click('#usageBtn'); pg.wait_for_function("document.querySelector('#jdiag') && !document.querySelector('#jdiag').innerText.includes('확인하는')", timeout=20000)
    print('점검(주소 문제):', pg.inner_text('#jdiag')); assert '문제 있음' in pg.inner_text('#jdiag'), 'diag did not show problem'
    pg.evaluate("document.querySelectorAll('body > .modal').forEach(m=>m.remove()); $('#layer').innerHTML=''"); setm('jobbase=http://localhost:8788')

    # 6) 안전망: 앱을 닫았고 서버의 다음 단계 호출도 끊긴 상태 → 1분마다 오는 sweep만으로 끝까지 분석된다
    pg.evaluate("jobsOff=false; localStorage.setItem('rc_job_stuck_ms','600000')")
    setm('mode=caption&jobbase=http://localhost:1&script=ok'); share(pg,'SWEEP01')
    pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_job')||'null')||{}).id", timeout=20000); pg.close(); print('앱 닫음(다음 단계 호출 끊김)')
    time.sleep(1); assert [j for j in st()['jobs'] if (j['link'] or '').endswith('SWEEP01/')][0]['status']=='queued', 'should be stuck'
    setm('jobbase=http://localhost:8788'); time.sleep(21)   # 20초 넘게 멈춘 작업만 다시 시작
    print('sweep:', urllib.request.urlopen(B+'/api/jobs?sweep=1', data=b'{}').read().decode())
    s=wait_server(lambda s: any((j['link'] or '').endswith('SWEEP01/') and j['status']=='done' for j in s['jobs']), 30); print('안전망으로 끝남 (앱은 닫힌 채)')
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_selector('.rhead h1', timeout=20000); pg.evaluate("$('#layer').innerHTML=''; localStorage.removeItem('rc_job_stuck_ms')"); pg.click('#back')
    pg.click('#setBtn'); pg.click('#usageBtn'); pg.wait_for_function("document.querySelector('#jdiag') && !document.querySelector('#jdiag').innerText.includes('확인하는')", timeout=15000)
    print('점검:', pg.inner_text('#jdiag').replace('\n',' / ')); assert '끝까지 이어서 하기: 켜짐' in pg.inner_text('#jdiag') and '안전망(1분마다 확인): 켜짐' in pg.inner_text('#jdiag'), 'diag bg/sweep'
    pg.evaluate("document.querySelectorAll('body > .modal').forEach(m=>m.remove()); $('#layer').innerHTML=''")
    assert st()['bg']>0, 'waitUntil not used'

    # 7) 서버에 작업 표가 없으면(SQL 실행 전) 예전 방식으로 그대로 분석
    setm('mode=caption&nojobs=1&script=ok'); share(pg,'NOJOB01')
    pg.wait_for_selector('.rhead h1', timeout=30000); assert not any((j['link'] or '').endswith('NOJOB01/') for j in st()['jobs']), 'used jobs when off'
    print('작업 표 없을 때 예전 방식으로 분석: OK'); setm('nojobs=0')
print('errors', errs)
