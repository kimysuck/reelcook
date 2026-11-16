# 시간이 오래 걸리는 분석: 실패하지 않고 "이어서 분석"으로 끝까지 간다
# (테스트에서는 서버 제한 시간을 12초로 줄이고, AI가 30초 걸리는 'slow' 답을 흉내 낸다)
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
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'x'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1');localStorage.setItem('rc_guided','true')")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1500)
    a0=st().get('apifyCalls',0)

    # 1) 첫 요청에서 시간 초과 → 이어서 분석(가벼운 설정, 올린 영상 다시 씀) → 레시피
    setm('mode=caption&deadline=12000&resetFiles=1&script=slow,ok'); share(pg,'LONGVID1')
    pg.wait_for_selector('.rhead h1, .err', timeout=90000)
    assert pg.locator('.rhead h1').count(), 'failed: '+(pg.inner_text('.err') if pg.locator('.err').count() else '?')
    s=st(); g=s['gem']; print('files', s['files'], 'apify', s['apifyCalls']-a0, [(x['sc'],x['file'],x['cfg'].get('mediaResolution'),(x['cfg'].get('thinkingConfig') or {}).get('thinkingLevel')) for x in g])
    assert s['files']['up']==1, 'video uploaded more than once'
    assert s['apifyCalls']-a0==1, 'reel info fetched again on continue'
    assert all(x['file'] for x in g), 'video not sent as uploaded file'
    assert g[1]['cfg'].get('mediaResolution')=='MEDIA_RESOLUTION_MEDIUM' and g[1]['cfg']['thinkingConfig']['thinkingLevel']=='low', 'continue not lighter'
    assert s['files']['del']==1, 'uploaded video not deleted'
    pg.click('#back'); pg.wait_for_timeout(300)

    # 2) 영상만 있는 릴스: 장면 기록까지 끝내고 시간 초과 → 장면 기록을 넘겨받아 레시피 정리만 다시
    setm('mode=silent&deadline=12000&resetFiles=1&script=scanlog,slow,pasta'); share(pg,'LONGVID2')
    pg.wait_for_selector('.rhead h1, .err', timeout=90000)
    assert pg.locator('.rhead h1').count(), 'two-stage continue failed'
    kinds=[(x['kind'],x['sc']) for x in st()['gem']]; print('two-stage', kinds)
    assert kinds==[('scan','scanlog'),('compose','slow'),('compose','pasta')], 'scan repeated on continue'
    pg.click('#back'); pg.wait_for_timeout(300)

    # 3) 세 번 다 시간 초과면 그때만 실패, 실패 기록에 단계별 시간이 남는다
    setm('mode=caption&deadline=12000&resetFiles=1&script=slow,slow,slow'); share(pg,'LONGVID3')
    pg.wait_for_selector('.err', timeout=120000); print('final:', pg.inner_text('.err').split('\n')[0])
    f=[x for x in st()['fails'] if x['reel_code']=='LONGVID3'][0]; print('fail notes', f['notes'])
    assert f['error']=='too_long' and any('hop2' in n for n in f['notes']) and any(':cut:' in n for n in f['notes']) and any(n.startswith('t_fetch') for n in f['notes']), 'notes missing'
    assert st()['files']['del']==1, 'video not deleted after final failure'
    setm('deadline=270000')
print('errors', errs)
