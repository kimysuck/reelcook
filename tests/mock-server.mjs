import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(HERE,'..');
process.env.GEMINI_API_KEY='k'; process.env.APP_PASSCODE='1234'; process.env.APIFY_TOKEN='tok'; process.env.SUPABASE_URL='https://fake.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_x'; process.env.SUPABASE_SECRET_KEY='sb_secret_x'; process.env.TESTER_EMAILS=process.env.TESTER_EMAILS||'tester@example.com'; process.env.JOB_BASE_URL='http://localhost:8788';
const CACHE=new Map(); const DB={profiles:[],recipes:[],posts:[],likes:[]}; const PHOTOS=new Map();
const MOCK={title:"대패삼겹 숙주볶음",emoji:"🥓",summary:"10분 자취 요리",servings:2,difficulty:"쉬움",total_min:10,confidence:"high",assumptions:[],
ingredients:[{name:"대패삼겹살",group:"주재료",original:"200g",orig_qty:200,orig_unit:"g",grams:200,primary:"g",buy:true,brand:"",buy_keyword:"대패삼겹살"},
{name:"숙주",group:"주재료",original:"한봉지",orig_qty:1,orig_unit:"봉",grams:300,primary:"g",buy:true},
{name:"간장",group:"양념",original:"간장 2숟갈",orig_qty:2,orig_unit:"숟갈",grams:24,ml:20,primary:"ml",buy:false},
{name:"굴소스",group:"양념",original:"1숟갈",orig_qty:1,orig_unit:"숟갈",grams:18,ml:15,primary:"ml",buy:true,brand:"이금기 굴소스",buy_keyword:"이금기 굴소스"},
{name:"설탕",group:"양념",original:"반숟갈",orig_qty:0.5,orig_unit:"숟갈",grams:6,primary:"g",buy:false},
{name:"후추",group:"양념",original:"톡톡",orig_qty:null,orig_unit:"약간",grams:0.3,primary:"g",buy:false}],
steps:[{text:"팬에 [[0]]을 올려 바싹 굽는다",heat:"중불",seconds:180,cue:"가장자리가 갈색이 되면",tip:"기름은 안 둘러도 돼요",mistake:"",clip:{start:"00:02",end:"00:06"},photo:"00:05"},{text:"[[2]], [[3]], [[4]]를 붓고 [[1]]을 넣어 30초 볶는다",heat:"강불",seconds:30,cue:"",tip:"",mistake:"오래 볶으면 숙주에서 물이 나와요",clip:{start:"00:12",end:"00:16"},photo:"00:15"}],
tools:[],nutrition_per_serving:{kcal:520,carb_g:12,protein_g:22,fat_g:42,sugar_g:5,sodium_mg:1300},beginner_notes:["재료를 먼저 다 손질해 두세요"]};
const st={mode:'caption', gem:[], firstEmpty:false, script:[], usage:{}, quota:{}, quotaFill:0, fails:[]};
const realFetch=globalThis.fetch; const JOBS=[]; const STATS={}; const FEEDBACK=[]; const LESSONS=[];
// Vercel의 "응답한 뒤에도 끝까지 일하기"(waitUntil) 흉내: 기록만 하고, 일은 이 서버에서 계속된다
const BG=[]; globalThis[Symbol.for('@vercel/request-context')]={get:()=>({waitUntil:p=>{ BG.push(1); }})};
// 가짜 "폰": 알림 받을 주소와 열쇠. 서버가 보낸 푸시를 실제 폰처럼 복호화해서 기록한다
import crypto from 'node:crypto';
const PHONE=crypto.createECDH('prime256v1'); PHONE.generateKeys(); const PHONE_AUTH=crypto.randomBytes(16); const PUSHES=[];
const PHONE_SUB={endpoint:'https://fcm.googleapis.com/fcm/send/test-phone', keys:{p256dh:PHONE.getPublicKey().toString('base64url'), auth:PHONE_AUTH.toString('base64url')}};
function phoneReceive(opts){ const hm=(k,d)=>crypto.createHmac('sha256',k).update(d).digest(); const enc=Buffer.from(opts.body);
  const salt=enc.subarray(0,16), n=enc[20], asPub=enc.subarray(21,21+n), ct=enc.subarray(21+n);
  const ikm=hm(hm(PHONE_AUTH,PHONE.computeSecret(asPub)),Buffer.concat([Buffer.from('WebPush: info\0'),PHONE.getPublicKey(),asPub,Buffer.from([1])]));
  const prk=hm(salt,ikm), d=crypto.createDecipheriv('aes-128-gcm',hm(prk,Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0,16),hm(prk,Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0,12));
  d.setAuthTag(ct.subarray(ct.length-16)); const pl=Buffer.concat([d.update(ct.subarray(0,ct.length-16)),d.final()]);
  const h=opts.headers.Authorization, t=h.match(/t=([^,]+)/)[1], k=Buffer.from(h.match(/k=(\S+)/)[1],'base64url'), [a,b,sg]=t.split('.');
  const key=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:k.subarray(1,33).toString('base64url'),y:k.subarray(33).toString('base64url')},format:'jwk'});
  PUSHES.push({...JSON.parse(pl.subarray(0,pl.length-1).toString()), signed:crypto.verify('sha256',Buffer.from(a+'.'+b),{key,dsaEncoding:'ieee-p1363'},Buffer.from(sg,'base64url'))}); }
// analysis_jobs 표 흉내 (lib/jobs.js가 쓰는 필터만)
function jobsRest(url, opts){
  const q=new URL(url).searchParams, m=(opts.method||'GET').toUpperCase();
  const val=(k)=>q.get(k); const list=v=>v.replace(/^in\.\(|\)$/g,'').split(',');
  const pred=r=>{ for (const [k,v] of q){ if (['select','order','limit','or'].includes(k)) continue;
      if (v.startsWith('eq.') && String(r[k])!==v.slice(3)) return false;
      if (v.startsWith('in.') && !list(v).includes(String(r[k]))) return false;
      if (v.startsWith('gt.') && !(r[k]>v.slice(3))) return false;
      if (v.startsWith('lt.') && !(r[k]<v.slice(3))) return false; }
    const o=val('or'); if (o){ const iso=(o.match(/updated_at\.lt\."([^"]+)"/)||[])[1]; if (!(r.status==='queued' || (r.status==='running' && r.updated_at<iso))) return false; }
    return true; };
  const J=o=>({ok:true,status:200,json:async()=>o});
  if (m==='POST'){ const b=JSON.parse(opts.body); const now=new Date().toISOString(); const row={id:crypto.randomUUID(),created_at:now,updated_at:now,status:'queued',hop:0,prio:0,tester:false,stage:null,state:null,result:null,...b}; JOBS.push(row); return J([row]); }
  const rows=JOBS.filter(pred);
  if (m==='PATCH'){ const b=JSON.parse(opts.body); rows.forEach(r=>Object.assign(r,b)); return J(rows.map(r=>({...r}))); }
  if (m==='DELETE'){ for (const r of rows) JOBS.splice(JOBS.indexOf(r),1); return J([]); }
  let out=rows.slice(); const ord=val('order')||''; if (ord.startsWith('prio')) out.sort((a,b)=>a.prio-b.prio||a.created_at.localeCompare(b.created_at)); else out.sort((a,b)=>a.created_at.localeCompare(b.created_at));
  if (val('limit')) out=out.slice(0,+val('limit')); return J(out.map(r=>({...r})));
}
globalThis.fetch=async (url,opts)=>{ url=String(url); opts=opts||{};
  if(url.startsWith('http://localhost:8788/')) return realFetch(url,opts);
  if(url.startsWith('https://fcm.googleapis.com/')){ try{ phoneReceive(opts); }catch(e){ PUSHES.push({error:String(e)}); } return {ok:true,status:201}; }   // 서버가 스스로 다음 단계를 부를 때
  // 운영 통계·사용 후기 (v1.12)
  if(url.includes('/rest/v1/rpc/bump_analysis_stats')){ const b=JSON.parse(opts.body); const k=b.p_day+'|'+b.p_kind; const r=STATS[k]||(STATS[k]={day:b.p_day,kind:b.p_kind,n:0,sec:0,tokens_in:0,tokens_out:0}); r.n+=b.p_n; r.sec+=b.p_sec; r.tokens_in+=b.p_in; r.tokens_out+=b.p_out; return {ok:true,status:204,json:async()=>null}; }
  if(url.startsWith('https://fake.supabase.co/rest/v1/analysis_stats')){ if((opts.method||'GET')==='DELETE') return {ok:true,status:204,json:async()=>null}; return {ok:true,status:200,json:async()=>Object.values(STATS)}; }
  if(url.startsWith('https://fake.supabase.co/rest/v1/feedback')){ const m=opts.method||'GET';
    if(m==='POST'){ const b=JSON.parse(opts.body); if(FEEDBACK.some(f=>f.owner===b.owner)) return {ok:false,status:409,json:async()=>({code:'23505'})}; FEEDBACK.unshift({at:new Date().toISOString(),...b}); return {ok:true,status:201,json:async()=>null}; }
    if(m==='DELETE') return {ok:true,status:204,json:async()=>null}; return {ok:true,status:200,json:async()=>FEEDBACK.slice()}; }
  if(url.startsWith('https://fake.supabase.co/rest/v1/analysis_jobs')){ if(st.nojobs) return {ok:false,status:404,json:async()=>({message:'relation does not exist'})}; return jobsRest(url,opts); }
  // Google 파일 저장소(Files API) 흉내: 올리기 시작 → 올리기 → 처리 상태 → 지우기
  if(url.startsWith('https://generativelanguage.googleapis.com/upload/v1beta/files')){ st.files=st.files||{up:0,del:0};
    if(!url.includes('upload_id')) return {ok:true,status:200,headers:new Map([['x-goog-upload-url','https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=u'+(++st.files.up)]]),json:async()=>({})};
    const id='f'+st.files.up; return {ok:true,status:200,json:async()=>({file:{name:'files/'+id,uri:'https://generativelanguage.googleapis.com/v1beta/files/'+id,mimeType:'video/webm',state:'PROCESSING'}})}; }
  const fm=url.match(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/(files\/[a-z0-9-]+)$/);
  if(fm){ if(opts.method==='DELETE'){ st.files.del++; return {ok:true,status:200,json:async()=>({})}; } const id=fm[1].split('/')[1]; return {ok:true,status:200,json:async()=>({name:fm[1],uri:'https://generativelanguage.googleapis.com/v1beta/files/'+id,mimeType:'video/webm',state:'ACTIVE'})}; }
  if(url.includes('/rest/v1/rpc/bump_analysis_quota')){ const b=JSON.parse(opts.body); st.quota[b.p_who]=(st.quota[b.p_who]??st.quotaFill)+1; return {ok:true,status:200,json:async()=>st.quota[b.p_who]}; }
  if(url.includes('/rest/v1/analysis_quota')){ if((opts&&opts.method)==='DELETE') return {ok:true,status:204,json:async()=>null}; const who=decodeURIComponent((url.match(/who=eq\.([^&]+)/)||[])[1]||''); const n=st.quota[who]??st.quotaFill; st.lastWho=who; return {ok:true,status:200,json:async()=>n?[{n}]:[]}; }
  if(url.includes('/rest/v1/analysis_failures')){ const m=(opts&&opts.method)||'GET'; if(m==='POST'){ st.fails.unshift({at:new Date().toISOString(),...JSON.parse(opts.body)}); return {ok:true,status:201,json:async()=>null}; } if(m==='DELETE') return {ok:true,status:204,json:async()=>null}; return {ok:true,status:200,json:async()=>st.fails.slice(0,10)}; }
  if(url.includes('/rest/v1/rpc/bump_ai_usage')){ const b=JSON.parse(opts.body); const r=st.usage[b.p_model]||(st.usage[b.p_model]={model:b.p_model,day:b.p_day,calls:0,ok:0,busy:0,limited:0,tokens_in:0,tokens_out:0,day_exhausted:false}); r.calls++; r.ok+=b.p_ok; r.busy+=b.p_busy; r.limited+=b.p_limited; r.day_exhausted=r.day_exhausted||b.p_exhausted; r.tokens_in+=b.p_in||0; r.tokens_out+=b.p_out||0; return {ok:true,status:204,json:async()=>({})}; }
  // 배운 규칙 표 (v1.14)
  if(url.includes('/rest/v1/analysis_lessons')){ const m=(opts&&opts.method)||'GET', id=+((url.match(/id=eq\.(\d+)/)||[])[1]||0);
    if(m==='POST'){ const row={id:LESSONS.length+1,created_at:new Date().toISOString(),...JSON.parse(opts.body)}; LESSONS.push(row); return {ok:true,status:201,json:async()=>[row]}; }
    if(m==='PATCH'){ const p=JSON.parse(opts.body); LESSONS.filter(l=>l.id===id).forEach(l=>Object.assign(l,p)); return {ok:true,status:200,json:async()=>LESSONS.filter(l=>l.id===id)}; }
    let out=LESSONS.slice(); if(url.includes('active=eq.true')) out=out.filter(l=>l.active); return {ok:true,status:200,json:async()=>out}; }
  if(url.includes('/rest/v1/ai_usage')) return {ok:true,status:200,json:async()=>Object.values(st.usage)};
  // 배우기(learn) 호출은 learn* 응답만, 다른 호출은 learn*이 아닌 응답만 쓴다 → 배우기 작업과 다시 분석이 동시에 돌아도 순서가 섞이지 않음
  if(url.includes('generativelanguage') && opts.body && opts.body.includes('품질 담당') && !st.script.some(x=>x.startsWith('learn'))) return {ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({real:false,why:'mock',rule:'',kind:'other',same:null})}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:10}})};
  if(url.includes('generativelanguage') && !opts.body.includes('콘텐츠 검토') && st.script.some(x=>(opts.body.includes('품질 담당'))===x.startsWith('learn'))){
    const ix=st.script.findIndex(x=>(opts.body.includes('품질 담당'))===x.startsWith('learn')); const sc=st.script.splice(ix,1)[0]; const model=(url.match(/models\/([^:]+):/)||[])[1]; const b=JSON.parse(opts.body);
    st.gem.push({model,sc,kind:(b.contents[0].parts[0].text.includes('품질 담당')?'learn':b.contents[0].parts[0].text.includes('채점의 검토자')?'arb':b.contents[0].parts[0].text.includes('레시피 채점자')?'judge':b.contents[0].parts[0].text.includes('꼼꼼히 기록하는 사람')?'scan':b.contents[0].parts[0].text.includes('[영상 장면 기록')?'compose':'single'),cfg:b.generationConfig,vm:b.contents[0].parts[1]?.video_metadata,file:!!b.contents[0].parts[1]?.file_data,nparts:b.contents[0].parts.length,prompt:b.contents[0].parts[0].text});
    if(sc==='slow'){ await new Promise((res,rej)=>{ const t=setTimeout(res,30000); opts.signal&&opts.signal.addEventListener('abort',()=>{ clearTimeout(t); const e=new Error('aborted'); e.name='AbortError'; rej(e); }); }); }
    await new Promise(r=>setTimeout(r,300));
    const E=(status,error)=>({ok:false,status,json:async()=>({error})});
    if(sc==='gone') return E(404,{code:404,message:'models/'+model+' is not found for API version v1beta, or is not supported for generateContent.',status:'NOT_FOUND'});
    if(sc==='503') return E(503,{code:503,message:'The model is overloaded due to high demand.',status:'UNAVAILABLE'});
    if(sc==='429m') return E(429,{code:429,message:'quota',status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'2s'}]});
    if(sc==='429d') return E(429,{code:429,message:'quota',status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'40000s'}]});
    const J=o=>({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(o)}]}}],usageMetadata:{promptTokenCount:12000,candidatesTokenCount:900}})});
    const r2={...MOCK,title:'숙주 겉절이',sources:['onscreen_text','speech'],ingredients:MOCK.ingredients.slice(1,4),steps:[{text:'[[0]]를 데친다',heat:'강불',seconds:60,cue:'',tip:'',mistake:'',clip:{start:'00:06',end:'00:09'},photo:'00:08'}]};
    if(sc==='multi') return J({is_food:true,evidence:{speech:'간장 두 숟갈',onscreen_text:'숙주 1봉',caption:'레시피',comments_used:['작성자 1']},recipes:[{...MOCK,sources:['caption','owner_comment','onscreen_text']},r2]});
    // AI 채점(F-J1): 채점자 A·B와 검토 AI
    const CR=(amt)=>({criteria:{ingredients:{pass:true,reason:'',evidence:'00:03'},amounts:{pass:amt,reason:amt?'':'간장 2숟갈인데 1숟갈로 나옴',evidence:'캡션'},steps:{pass:true,reason:''},method:{pass:true,reason:''}}});
    if(sc==='jok') return J(CR(true));
    if(sc==='learnY') return J({real:true,why:'캡션에 간장 2숟갈',rule:'캡션에 숫자 분량이 있으면 그 숫자를 그대로 옮긴다',kind:'amounts',same:null});
    if(sc==='learnSame') return J({real:true,why:'같은 실수',rule:'',kind:'amounts',same:1});
    if(sc==='learnN') return J({real:false,why:'영상에 실제로 1숟갈',rule:'',kind:'amounts',same:null});
    if(sc==='jamt') return J(CR(false));
    if(sc==='arbB') return J({decisions:{amounts:{pass:false,right:'B',why:'캡션에 간장 2숟갈'}}});
    if(sc==='notfood') return J({is_food:false,reason:'맛집 소개 영상이에요',recipes:[]});
    if(sc==='empty') return J({is_food:true,recipes:[]});
    if(sc==='cover') return J({is_food:true,evidence:{},recipes:[{...MOCK,cover_time:'00:12',sources:['caption','speech'],steps:MOCK.steps.map((x,i)=>({...x,clip:{start:i?'00:08':'00:02',end:i?'00:14':'00:06'},photo:i?'00:11':'00:04'}))}]});
    if(sc==='jumble'){ const mk=(t,a,b)=>({text:t,heat:'중불',seconds:0,cue:'',tip:'',mistake:'',clip:{start:a,end:b},photo:a});
      return J({is_food:true,evidence:{},recipes:[{...MOCK,steps:[mk('1단계','00:03','00:07'),mk('2단계','00:07','00:12'),mk('3단계','00:15','00:19'),mk('4단계','00:11','00:16'),mk('5단계','00:18','00:20')]}]}); }
    if(sc==='scanlog') return J({is_cooking:true,dishes:['크림 스테이크 파스타'],final_dish_time:'00:02',scenes:[{start:'00:05',end:'00:06',action:'고기에 소금 후추',ingredients:[{name:'소고기',amount_seen:'손바닥 두 개 크기',from:'화면'}],heat:'없음'},{start:'00:12',end:'00:14',action:'생크림 붓기',ingredients:[{name:'생크림',amount_seen:'팩 절반',from:'포장지'}],heat:'중불'}]});
    if(sc==='scannot') return J({is_cooking:false,reason:'완성된 음식을 먹는 장면만 나와요',scenes:[]});
    if(sc==='pasta'){ const I=(name,group,q,u,g,ml,est)=>({name,group,original:'',orig_qty:q,orig_unit:u,grams:g,ml:ml||null,primary:ml?'ml':'g',estimated:!!est,buy:!['소금','후추','버터','다진 마늘'].includes(name),brand:'',buy_keyword:name});
      const st=(text,heat,sec,a,b,ph,cue,tip)=>({text,heat,seconds:sec,cue:cue||'',tip:tip||'',mistake:'',clip:{start:a,end:b},photo:ph});
      return J({is_food:true,evidence:{speech:'',onscreen_text:'Creamy Steak Pasta',caption:'없음'},recipes:[{title:'크림 스테이크 파스타',summary:'버터 크림 소스에 구운 스테이크를 올린 파스타',servings:2,difficulty:'보통',total_min:25,confidence:'medium',sources:['onscreen_text','visual'],cover_time:'00:02',assumptions:['분량은 화면 속 양을 보고 추정했어요'],
        ingredients:[I('소고기 스테이크','주재료',300,'g',300),I('페투치니','주재료',200,'g',200),I('생크림','소스',1,'컵',200,200,1),I('파마산 치즈','소스',4,'숟갈',40,0,1),I('버터','소스',2,'숟갈',20,0,1),I('다진 마늘','소스',1,'숟갈',10,0,1),I('소금','양념',null,'약간',2),I('후추','양념',null,'약간',1)],
        steps:[st('[[0]]에 [[6]]과 [[7]]을 앞뒤로 뿌린다','없음',0,'00:05','00:06','00:05.5'),st('달군 팬에 [[0]]을 올려 앞뒤로 굽는다','강불',240,'00:07','00:10','00:09','겉이 짙은 갈색이 되면','굽는 동안 자주 뒤집지 마세요'),
          st('끓는 소금물에 [[1]]을 삶는다','강불',600,'00:10','00:11','00:10.5'),st('팬에 [[4]]와 [[5]]을 넣어 녹인다','중불',60,'00:11','00:12','00:11.5'),
          st('[[2]]를 붓고 [[7]]을 뿌린다','중불',90,'00:12','00:14.8','00:13.5','가장자리가 보글보글 끓으면'),st('[[3]]를 갈아 넣고 저어 녹인다','약불',60,'00:15','00:16.8','00:16','소스가 숟가락을 코팅하면'),
          st('삶은 [[1]]을 넣고 소스와 버무린다','약불',60,'00:17','00:19.3','00:19')],tools:[],nutrition_per_serving:{kcal:980,carb_g:78,protein_g:45,fat_g:52,sugar_g:4,sodium_mg:900},beginner_notes:['면 삶은 물을 한 컵 남겨 두면 소스 농도 맞추기 좋아요']}]}); }
    if(sc==='ok') return J({is_food:true,evidence:{},recipes:[{...MOCK,sources:['onscreen_text','speech','visual']}]});
    // v1.15 재료마다 근거·캡션 대조: from 표시, capbad는 간장을 캡션(2숟갈)과 다르게
    if(sc==='from'||sc==='capbad') return J({is_food:true,evidence:{},recipes:[{...MOCK,sources:['caption','visual'],ingredients:MOCK.ingredients.map((i,k)=>({...i,from:k===0?'visual':k===1?'speech':'caption',estimated:k===0,...(sc==='capbad'&&i.name==='간장'?{orig_qty:1}:{})}))}]});
  }
  if(url==='https://fake.supabase.co/auth/v1/user'){ const t=(opts.headers.Authorization||'').replace('Bearer ',''); const id=t.replace('tok-',''); const p=DB.profiles.find(x=>x.id===id);
    return p?{ok:true,status:200,json:async()=>({id, email:p.email||st.userEmail||'kim@example.com', user_metadata:{full_name:'김영석', avatar_url:''}})}:{ok:false,status:401,json:async()=>({})}; }
  if(url.startsWith('https://fake.supabase.co/storage/v1/object/photos/')){ const path=url.split('/photos/')[1]; PHOTOS.set(path,opts.body); st.uploads=(st.uploads||[]); st.uploads.push(path+' '+opts.body.length+'B'+(opts.headers.Authorization?' AUTH!':'')); return {ok:true,status:200,text:async()=>''}; }
  const rm=url.match(/^https:\/\/fake\.supabase\.co\/rest\/v1\/(posts|profiles)(\?.*)?$/);
  if(rm){ const t=rm[1], m=(opts&&opts.method)||'GET';
    if(m==='POST'){ const row={id:'p'+Math.random().toString(36).slice(2,8), created_at:new Date().toISOString(), ...JSON.parse(opts.body)}; DB[t].push(row); return {ok:true,status:201,json:async()=>[row]}; }
    if(m==='PATCH' && st.nocol){ return {ok:false,status:400,text:async()=>JSON.stringify({code:'PGRST204',message:"Could not find the 'setup_done' column of 'profiles' in the schema cache"}),json:async()=>({})}; }
    if(m==='PATCH'){ const id=decodeURIComponent((url.match(/id=eq\.([^&]+)/)||[])[1]); const row=DB[t].find(x=>x.id===id); Object.assign(row,JSON.parse(opts.body)); return {ok:true,status:200,json:async()=>[row]}; } }
  if(url.startsWith('https://fake.supabase.co/rest/v1/reel_cache')){ st.dbcalls=(st.dbcalls||[]); const m=(opts&&opts.method)||'GET'; st.dbcalls.push(m+' '+(opts&&opts.headers&&opts.headers.apikey));
    const code=(url.match(/code=eq\.([^&]+)/)||[])[1];
    if(m==='GET') return {ok:true,status:200,json:async()=>CACHE.has(code)?[CACHE.get(code)]:[]};
    if(m==='POST'){ const b=JSON.parse(opts.body); CACHE.set(b.code,b); return {ok:true,status:201,json:async()=>({})}; }
    if(m==='PATCH'){ const b=JSON.parse(opts.body); if(CACHE.has(code)) Object.assign(CACHE.get(code),b); return {ok:true,status:204,json:async()=>({})}; } }
  if(url.includes('api.apify.com')){ st.apify=JSON.parse(opts.body); st.apifyCalls=(st.apifyCalls||0)+1; await new Promise(r=>setTimeout(r,800));
    const cap = st.mode==='silent' ? '' : '대패숙주 레시피\n간장 2숟갈 굴소스 1숟갈';
    return {ok:true,status:200,json:async()=>[{caption:cap,owner_username:'cook',comments: st.mode==='silent'?[{text:'맛있겠다',username:'fan'}]:[{text:'레시피: 설탕 반숟갈 추가!',username:'cook'},{text:'맛있겠다',username:'fan'}],video_url:'https://scontent-ssn1-1.cdninstagram.com/v/a.mp4',duration_seconds: st.mode==='long'?200:40}]}; }
  if(url.includes('cdninstagram')){ const buf=fs.readFileSync(st.videoFile||path.join(HERE,'reel.webm')); const rg=(opts&&opts.headers&&opts.headers.Range)||null;
    if(rg){ const m=rg.match(/bytes=(\d+)-(\d*)/); const a=+m[1], b=Math.min(m[2]?+m[2]:buf.length-1, buf.length-1); const part=buf.subarray(a,b+1);
      st.ranges=(st.ranges||0)+1;
      return {ok:true,status:206,headers:new Map([['content-type','video/webm'],['content-range',`bytes ${a}-${b}/${buf.length}`],['content-length',String(part.length)]]),body:(async function*(){ yield part; })(),arrayBuffer:async()=>part}; }
    return {ok:true,status:200,headers:new Map([['content-length',String(buf.length)],['content-type','video/webm']]),arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length),body:(async function*(){ yield buf; })()}; }
  if(url.includes('generativelanguage') && opts.body.includes('콘텐츠 검토')){ const b=JSON.parse(opts.body); const txt=b.contents[0].parts[0].text; const hasImg=b.contents[0].parts.length>1;
    st.mods=(st.mods||[]); st.mods.push({hasImg});
    const v={image_safe: !(hasImg && st.unsafeImage), text_safe: !/욕설/.test(txt.split('[글]')[1]||''), category: st.unsafeImage&&hasImg?'sexual':'none', reason: st.unsafeImage&&hasImg?'노출이 있는 사진':''};
    return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(v)}]}}]})}; }
  if(url.includes('generativelanguage')){ const b=JSON.parse(opts.body); st.gem.push({vm:b.contents[0].parts[1]?.video_metadata,cfg:b.generationConfig,nparts:b.contents[0].parts.length,prompt:b.contents[0].parts[0].text});
    await new Promise(r=>setTimeout(r, (st.mode==='long'||st.mode==='cut')?12000:1200));
    const empty = st.firstEmpty && st.gem.length===1;
    return {ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(empty?{...MOCK,ingredients:[],steps:[]}:MOCK)}]}}]})}; }
  return {ok:false,status:404,text:async()=>'',json:async()=>({})};
};
const types={'.html':'text/html','.js':'text/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname.startsWith('/__db/')){ const t=u.pathname.split('/')[2]; let raw=''; for await(const c of req) raw+=c;
    if(!raw){ res.end(JSON.stringify(DB[t])); return; }
    const b=JSON.parse(raw); if(b.op==='insert'){ const row={id:b.row.id||('r'+Math.random().toString(36).slice(2,8)), created_at:new Date().toISOString(), ...b.row}; DB[t].push(row); res.end(JSON.stringify(row)); return; }
    if(b.op==='delete'){ DB[t]=DB[t].filter(r=>!b.ids.includes(r.id||r.post_id+'|'+r.user_id)); res.end('{}'); return; } }
  if(u.pathname.startsWith('/__photo/')){ const buf=PHOTOS.get(decodeURIComponent(u.pathname.slice(9))); res.setHeader('Content-Type','image/jpeg'); res.end(buf||''); return; }
  if(u.pathname==='/__nocol'){ st.nocol=u.searchParams.get('v')==='1'; res.end('ok'); return; }
  if(u.pathname==='/__pushsub'){ res.end(JSON.stringify(PHONE_SUB)); return; }
  if(u.pathname==='/__pushes'){ res.end(JSON.stringify(PUSHES)); return; }
  if(u.pathname==='/__unsafe'){ st.unsafeImage=u.searchParams.get('v')==='1'; res.end('ok'); return; }
  if(u.pathname==='/__set'){ if(u.searchParams.has('fill')){ st.quotaFill=+u.searchParams.get('fill'); st.quota={}; } if(u.searchParams.has('email')) st.userEmail=u.searchParams.get('email'); st.videoFile=u.searchParams.get('video')||null; st.script=(u.searchParams.get('script')||'').split(',').filter(Boolean); if(u.searchParams.get('resetUsage')) st.usage={}; if(u.searchParams.has('deadline')) process.env.ANALYZE_DEADLINE_MS=u.searchParams.get('deadline'); if(u.searchParams.has('resetFiles')) st.files={up:0,del:0}; if(u.searchParams.has('configDelay')) st.configDelay=+u.searchParams.get('configDelay'); if(u.searchParams.has('nojobs')) st.nojobs=u.searchParams.get('nojobs')==='1'; if(u.searchParams.has('jobsGetFail')) st.jobsGetFail=u.searchParams.get('jobsGetFail')==='1'; if(u.searchParams.has('jobbase')) process.env.JOB_BASE_URL=u.searchParams.get('jobbase'); if(u.searchParams.has('jobs')){ if(u.searchParams.get('jobs')==='0') delete process.env.JOB_BASE_URL; else process.env.JOB_BASE_URL='http://localhost:8788'; } Object.assign(st,{mode:u.searchParams.get('mode')||'caption',firstEmpty:u.searchParams.get('empty')==='1',gem:[]}); res.end('ok'); return; }
  if(u.pathname==='/__st'){ res.end(JSON.stringify({lessons:LESSONS,stats:STATS,feedback:FEEDBACK,bg:BG.length,jobs:JOBS.map(j=>({id:j.id,status:j.status,stage:j.stage,hop:j.hop,prio:j.prio,owner:j.owner,link:j.link})),files:st.files,apifyCalls:st.apifyCalls||0,uploads:st.uploads,mods:st.mods,posts:DB.posts.map(p=>({kind:p.kind,flagged:p.flagged,title:p.title,photo:p.photo_path})),profiles:DB.profiles,dbcalls:st.dbcalls,cache:[...CACHE.keys()],ranges:st.ranges,apify:st.apify,usage:st.usage,quota:st.quota,lastWho:st.lastWho,fails:st.fails,cacheSrc:[...CACHE.values()].map(c=>Object.keys(c.source||{})),script:st.script,gemModels:st.gem.map(g=>g.model+':'+(g.sc||'')+':'+(g.kind||'')+':'+g.nparts+':'+JSON.stringify(g.cfg&&g.cfg.mediaResolution||'')),gem:st.gem.map(g=>({file:g.file,kind:g.kind,sc:g.sc,vm:g.vm,cfg:g.cfg,nparts:g.nparts,hasComment:g.prompt.includes('설탕 반숟갈 추가'),lesson:g.prompt.includes('지난 채점에서 배운 규칙'),tail:g.prompt.slice(-260)}))})); return; }
  if(u.pathname.startsWith('/api/')){
    let raw=''; for await(const c of req) raw+=c; req.body=raw?JSON.parse(raw):{}; req.query=Object.fromEntries(u.searchParams);
    res.status=c=>{res.statusCode=c;return res;}; res.json=o=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(o));};
    if(u.pathname==='/api/config' && st.configDelay) await new Promise(r=>setTimeout(r,st.configDelay));   // 앱 시작 때 설정이 늦게 오는 상황
    if(st.mode==='cut') setTimeout(()=>res.socket.destroy(),3000);
    if(st.jobsGetFail && u.pathname==='/api/jobs' && req.method==='GET' && !u.searchParams.has('diag')){ res.statusCode=500; res.end('<html>Internal Server Error</html>'); return; }   // 서버 작업 상태 확인이 계속 실패
    const {default:h}=await import(ROOT+u.pathname+'.js'); return h(req,res);
  }
  let p=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname);
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream'); fs.createReadStream(p).pipe(res);
}).listen(8788,()=>console.log('up'));
