# v1.15 사용자 신뢰: ① 재료마다 근거(캡션에 적힘·음성·화면 보고 추정) ② 캡션 자동 대조 표시 ③ "결과가 이상해요"로도 배우기(횟수 제한)
from playwright.sync_api import sync_playwright
from common import TV, L
import urllib.request, json, time
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
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(B+'/'); pg.wait_for_timeout(1500)
    # ① ② 캡션과 일치
    setm('mode=caption&script=from'); share(pg,'TRUST01'); pg.wait_for_selector('.rhead h1', timeout=60000); pg.wait_for_timeout(500)
    head=pg.inner_text('.rhead'); print('머리:', head.replace('\n',' | ')[:300])
    assert '✓ 캡션에 적힌 분량과 일치' in head, 'cap ok badge'
    ing=pg.inner_text('#app'); assert '캡션에 적힘' in ing and '음성' in ing and '화면 보고 추정' in ing, 'from badges'
    # ② 캡션과 다른 분량
    pg.click('#back'); setm('mode=caption&script=capbad'); share(pg,'TRUST02'); pg.wait_for_selector('.rhead h1', timeout=60000); pg.wait_for_timeout(500)
    bad=pg.inner_text('.capok'); print('대조:', bad); assert '캡션과 다른 분량 1개' in bad and '간장(캡션 2, 앱 1)' in bad, 'cap bad badge'
    # ③ 결과가 이상해요 → 다시 분석 + 배우기 작업(일반 이용자도)
    setm('mode=caption&script=learnY,ok')
    pg.click('#badResult'); pg.wait_for_selector('[data-why]'); pg.click('[data-why="amount"]'); pg.click('#bdgo')
    for _ in range(60):
        if st()['lessons']: break
        time.sleep(0.5)
    L_=st()['lessons']; print('규칙:', L_); assert len(L_)==1 and L_[0]['source']=='report' and L_[0]['first_code']=='TRUST02', 'report lesson'
    pg.wait_for_selector('.rhead h1', timeout=60000)
    # 한 기기 하루 3번까지
    codes=[pg.evaluate("""async(n)=>{ const h=await jobHeaders(); const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify({link:'https://www.instagram.com/reel/LIM0'+n+'/',kind:'learn',report:true,recipes:[{title:'x',ingredients:[],steps:[]}],problems:[{k:'other',reason:'x'}]})}); return r.status }""", n) for n in range(3)]
    print('추가 신고:', codes); assert codes[:2]==[200,200] and codes[2]==429, 'per-device limit'
print('errors', errs)
