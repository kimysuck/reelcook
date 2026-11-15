# 앱을 꺼도 서버가 분석을 끝낸다: 분석 중에 앱을 닫고 → 서버가 혼자 끝내고 → 다시 열면 결과가 나온다
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
def st(): return json.load(urllib.request.urlopen(B+'/__st'))
FAKE=open('fake-supabase2.js').read()
INIT="if(!localStorage.getItem('rc_consent')){localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))};localStorage.setItem('rc_splash_at',String(Date.now()))"
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
    s=wait_server(lambda s: any(j['link'].endswith('BGJOB01/') and j['status']=='done' for j in s['jobs']), 90)
    print('서버 혼자 끝냄:', [(j['status'],j['hop']) for j in s['jobs']])
    assert [j for j in s['jobs'] if j['link'].endswith('BGJOB01/')][0]['hop']==1, 'did not continue on server'
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/')
    pg.wait_for_selector('.rhead h1', timeout=20000); print('다시 열자 레시피:', pg.inner_text('.rhead h1'))
    wait_server(lambda s: not any(j['link'].endswith('BGJOB01/') for j in s['jobs']), 10); print('받아 간 작업은 서버에서 삭제됨')
    assert pg.evaluate("localStorage.getItem('rc_job')") in (None,'null'), 'rc_job not cleared'
    pg.click('#back'); pg.wait_for_timeout(300)

    # 2) 평가 모드: 3개를 맡기고 바로 앱을 닫음 → 서버가 2개씩 돌려 모두 끝냄 → 다시 열면 결과가 채워짐
    setm('mode=caption&deadline=270000&email=tester@example.com&script=ok,ok,ok'); pg.evaluate("sb.auth.signInWithOAuth()"); pg.wait_for_timeout(1500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#evalBtn'); pg.wait_for_selector('#evIn')
    pg.fill('#evIn','https://www.instagram.com/reel/BGEVAL1/\nhttps://www.instagram.com/reel/BGEVAL2/\nhttps://www.instagram.com/reel/BGEVAL3/')
    pg.click('#evGo'); pg.wait_for_function("(JSON.parse(localStorage.getItem('rc_eval')).items).every(x=>x.job)", timeout=20000)
    s=st(); ev=[j for j in s['jobs'] if 'BGEVAL' in j['link']]; print('맡긴 평가 작업', [(j['status'],j['prio']) for j in ev])
    assert len(ev)==3 and all(j['prio']==1 for j in ev), 'eval jobs not queued on server'
    pg.close(); print('앱 닫음')
    most=0; t=time.time()
    while time.time()-t<60:
        js=[j for j in st()['jobs'] if 'BGEVAL' in j['link']]; most=max(most, sum(j['status']=='running' for j in js))
        if js and all(j['status']=='done' for j in js): break
        time.sleep(0.3)
    print('서버가 동시에 돌린 최대 개수', most); assert most<=2, 'more than 2 at once'
    assert all(j['status']=='done' for j in js), 'eval jobs not finished on server'
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(2500); pg.evaluate("$('#layer').innerHTML=''")
    pg.click('#setBtn'); pg.click('#evalBtn')
    pg.wait_for_function("document.querySelector('.evsum') && document.querySelector('.evsum').innerText.startsWith('3/3')", timeout=20000)
    print('다시 열자 평가:', pg.inner_text('.evsum'))

    # 3) 서버에 작업 표가 없으면(SQL 실행 전) 예전 방식으로 그대로 분석
    pg.click('#evBack'); setm('mode=caption&jobs=0&script=ok'); share(pg,'NOJOB01')
    pg.wait_for_selector('.rhead h1', timeout=30000); assert not any(j['link'].endswith('NOJOB01/') for j in st()['jobs']), 'used jobs when off'
    print('작업 표 없을 때 예전 방식으로 분석: OK'); setm('jobs=1')
print('errors', errs)
