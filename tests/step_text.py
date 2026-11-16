# 단계 문장 조립: 평가 모드에서 나온 실제 틀린 사례들 ("계란 2개 2개", "간장 2숟갈 2 숟갈", "파슬리 가루 약간를 약간", "적당히"→"약간")
from playwright.sync_api import sync_playwright
from common import TV, L
B='http://localhost:8788'
R={'title':'테스트','servings':2,'ingredients':[
  {'name':'계란','orig_qty':2,'orig_unit':'개','count':2,'count_unit':'개','primary':'count'},
  {'name':'간장','orig_qty':2,'orig_unit':'숟갈','ml':20,'primary':'ml'},
  {'name':'파슬리 가루','orig_qty':None,'orig_unit':'약간'},
  {'name':'면','orig_qty':None,'orig_unit':'적당히'},
  {'name':'우유','orig_qty':200,'orig_unit':'ml','ml':200,'primary':'ml'},
  {'name':'물','orig_qty':2,'orig_unit':'컵','ml':360,'primary':'ml'},
  {'name':'마요네즈','orig_qty':None,'orig_unit':'듬뿍'},
  {'name':'케첩','orig_qty':5,'orig_unit':'숟갈','ml':50,'primary':'ml'}],
 'steps':[{'text':t} for t in ['팬에 [[0]] 2개를 깨 넣는다','[[0]]를 2개 넣는다','[[1]] 2 숟갈을 넣는다','[[2]]를 약간 뿌린다','[[3]]을 넣고 적당히 익힌다',
   '[[4]]로 끓인다','[[5]]로 끓인다','[[0]]이 익으면 [[1]]과 섞는다','라면에 [[6]]를 듬뿍 바른다','[[7]] 5숟갈과 [[1]]를 섞는다']]}
WANT=['팬에 계란 2개를 깨 넣는다','계란 2개를 넣는다','간장 2숟갈을 넣는다','파슬리 가루를 약간 뿌린다','면을 넣고 적당히 익힌다',
  '우유 200ml로 끓인다','물 2컵으로 끓인다','계란 2개가 익으면 간장 2숟갈과 섞는다','라면에 마요네즈를 듬뿍 바른다','케첩 5숟갈과 간장 2숟갈을 섞는다']
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(**L()); ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('rc_consent',JSON.stringify({version:'"+TV+"'}));localStorage.setItem('rc_pass',JSON.stringify('1234'));localStorage.setItem('rc_splash_off','1');localStorage.setItem('rc_guided','true')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_timeout(1200)
    pg.evaluate("r=>{ S.unit='orig'; openRecipe(normalize(r), null); }", R)
    ing=pg.inner_text('#app'); print('재료 표시:', [l for l in ing.split('\n') if '적당히' in l or '듬뿍' in l or '약간' in l])
    assert '적당히' in ing and '듬뿍' in ing, 'word amounts not kept as written'
    pg.click('[data-rt="step"]'); pg.wait_for_timeout(200)
    got=pg.eval_on_selector_all('.stx','els=>els.map(e=>e.innerText.trim())')
    bad=[(g,w) for g,w in zip(got,WANT) if g!=w]
    for g,w in zip(got,WANT): print('OK ' if g==w else 'BAD', g)
    assert not bad, f'step text wrong: {bad}'
    share=pg.evaluate('recipeText(S.recipe)'); assert '계란 2개를 넣는다' in share and '파슬리 가루를 약간' in share, 'share text wrong'
print('errors', errs)
