from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json
B='http://localhost:8788'
def setm(q): urllib.request.urlopen(B+'/__set?'+q).read()
FAKE=open('fake-supabase2.js').read()
def share(pg, code):
    pg.evaluate("""(c)=>{const f=document.createElement('form');f.method='POST';f.action='/share-target';f.enctype='multipart/form-data';
 const t=document.createElement('input');t.name='text';t.value='https://www.instagram.com/reel/'+c+'/';f.appendChild(t);document.body.appendChild(f);f.submit();}""", code)
with sync_playwright() as p:
    b=p.chromium.launch(**L(), ); ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"',at:'2026-11-12T00:00:00Z'}));localStorage.setItem('rc_pass',JSON.stringify('1234'))")
    ctx.route('**/supabase-js@2/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(3000)
    # 1) 붐빔 → 다른 모델로 전환 안내 → 레시피 2개
    setm('mode=caption&script=503,503,multi&resetUsage=1'); share(pg,'MULTI1')
    # 붐빔 → 다른 모델 전환은 서버 기록으로 확인 (화면 안내는 너무 빨리 지나갈 수 있음)
    pg.wait_for_selector('.pick', timeout=30000); pg.wait_for_timeout(1500); pg.screenshot(path='u_multi.png')
    import json as _j; st=_j.load(urllib.request.urlopen(B+'/__st')); seq=[g.split(':')[1] for g in st['gemModels']]
    print('switch seq', st['gemModels'][:3]); assert seq[:3]==['503','503','multi'] and st['gemModels'][0].split(':')[0]!=st['gemModels'][2].split(':')[0], 'model switch failed'
    print('picker', pg.inner_text('.pk-h'), pg.inner_text('.ailabel'))
    pg.click('[data-pick="1"]'); pg.wait_for_timeout(500); print('switched', pg.inner_text('.rhead h1'))
    pg.click('#save'); pg.wait_for_timeout(400); pg.click('[data-pick="0"]'); pg.wait_for_timeout(300); pg.click('[data-pick="1"]'); pg.wait_for_timeout(300)
    print('saved flag kept', pg.is_visible('[data-pick="1"] .ic'), 'save btn on', pg.get_attribute('#save','class'))
    pg.screenshot(path='u_multi2.png', full_page=False)
    pg.click('#back'); pg.wait_for_timeout(300)
    # 2) 요리 아님
    setm('mode=caption&script=notfood'); share(pg,'NOTFOOD1'); pg.wait_for_selector('.err', timeout=20000); print('notfood:', pg.inner_text('.err'))
    # 3) 하루 한도 전부 소진
    setm('mode=caption&script='+','.join(['429d']*6)); share(pg,'QUOTADAY1'); pg.wait_for_selector('.err', timeout=30000); print('quota:', pg.inner_text('.err'))
    # 4) 사용량 화면
    pg.click('#setBtn'); pg.click('#usageBtn'); pg.wait_for_selector('.usage', timeout=8000); pg.wait_for_timeout(300); pg.screenshot(path='u_usage.png')
    print('usage rows', pg.locator('.usage tr').count(), pg.inner_text('#ub')[:120].replace('\n',' '))
    print('errors', errs)
