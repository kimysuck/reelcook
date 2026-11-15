import html, os
from pathlib import Path
BASE = Path(__file__).resolve().parent
T = I = (BASE / 'img').as_uri() + '/'
PRIV = BASE / 'private'
esc = html.escape

CSS = (BASE / 'style.css').read_text()

def private(name, fallback):
    # 개인적인 내용(가족 이야기 등)은 공개 저장소에 올리지 않고 devlog/private/ 에만 둔다 (.gitignore)
    p = PRIV / name
    return p.read_text() if p.exists() else fallback

def head(day, idx, total):
    lab = '앱 소개' if day == 'pin' else f'DAY {day}'
    return f'<div class="top"><div class="logo">릴쿡 <span class="bars"><i></i><i></i><i></i></span></div><div>{lab} · {idx} / {total}</div></div>'

def rows(rs):
    out = '<div class="rows">'
    for lab, txt in rs:
        out += f'<div class="r"><div class="rl {lab[1]}">{lab[0]}</div><div class="rt">{txt}</div></div>'
    return out + '</div>'

def phone(src, cap='', cls='', style=''):
    c = f'<div class="cap">{cap}</div>' if cap else ''
    return f'<div class="ph {cls}"><img src="{src}" style="{style}">{c}</div>'

def phones(ps, cls=''):
    return f'<div class="phones {cls}">' + ''.join(phone(*p) for p in ps) + '</div>'

def code(s):
    return f'<pre>{s}</pre>'

def bullets(bs):
    return '<ul class="bl">' + ''.join(f'<li>{b}</li>' for b in bs) + '</ul>'

def card(day, body, cls=''):
    return (cls, day, body)

DAYS = []

# ───────────── DAY 1 ─────────────
d1 = []
d1.append(('cover', f'''
<div class="kick">DAY 1 · 2026.11.11 (수)</div>
<h1>아이디어에서<br>v1.3까지</h1>
<p class="lead">인스타그램 요리 릴스를 공유하면 AI가 초보자용 레시피로 정리해 주는 웹앱 <b>릴쿡</b>의 첫날 기록입니다. '저장만 해 두던 요리 릴스를 실제로 따라 할 수 있게 하자'는 문제의식에서 출발해, 분석 파이프라인부터 로그인·DB, 디자인, 약관까지 서비스의 뼈대를 하루 만에 세웠습니다.</p>
<div class="stat"><div><b>20건</b>GitHub 커밋</div><div><b>v0.1 → v1.3.1</b>버전</div><div><b>09:48 – 23:32</b>작업 시간</div></div>
<div class="chips"><span>공유 수신</span><span>자동 분석</span><span>장면 재생</span><span>로그인·DB</span><span>디자인 시스템</span><span>약관·동의</span><span>모델 자동 전환</span></div>
'''))
d1.append(('', f'''
<div class="tag">개발 동기</div>
<h2>저장만 해 두던<br>요리 릴스</h2>
{private("motivation_story.html", '<div class="placeholder">개발 동기 본문은 devlog/private/motivation_story.html 에 있습니다</div>')}
<div class="quote">"릴스 속 레시피만 뽑아내<br>초보자도 따라 할 수 있는 가이드로 만들자"</div>
'''))
d1.append(('', f'''
<div class="tag">개발 동기 · 문제 정의</div>
<h2>릴스로 요리할 때<br>겪은 세 가지 불편</h2>
<div class="pains">
 <div class="pn"><div class="pq"><span>01</span><b>영상을 멈춰 가며 봐야 한다</b>레시피가 영상 곳곳에 흩어져 있어 단계마다 멈추고 되감아야 함</div><div class="pa">→</div><div class="ps"><b>단계별 정리 + 장면 재생</b>조리 단계마다 해당 구간만 반복, 전체 화면 영상 가이드</div></div>
 <div class="pn"><div class="pq"><span>02</span><b>재료가 맞는지 헷갈린다</b>화면 속 재료가 내가 가진 재료와 같은 것인지 확인하기 어려움</div><div class="pa">→</div><div class="ps"><b>재료 목록과 근거 표시</b>캡션·작성자 댓글·화면 근거를 함께 보여 주고, 장보기 목록 제공</div></div>
 <div class="pn"><div class="pq"><span>03</span><b>계량이 애매하다</b>정확한 양 없이 눈대중으로 만드는 레시피는 초보자가 시도하기 어려움</div><div class="pa">→</div><div class="ps"><b>g·ml 단위와 인분 조절</b>영상 속 단위를 g·ml로 바꾸고, 인분에 맞춰 양 자동 계산</div></div>
</div>
<p class="note">목표 사용자 · 릴스로 요리를 시작하려는 요리 초보</p>
'''))
d1.append(('', f'''
<div class="tag">서비스 개요</div>
<h2>공유 한 번으로<br>레시피가 완성되는 구조</h2>
<p class="lead">사용자는 인스타그램에서 <b>공유 → 릴쿡</b>만 누릅니다. 앱이 릴스의 캡션·댓글·영상을 수집하고, Google Gemini가 이를 분석해 <b>g·ml 단위 재료, 단계별 조리법, 해당 장면</b>을 담은 레시피로 정리합니다.</p>
{phones([(T+'d_home.jpg','① 링크 공유'),(T+'u_scan.jpg','② AI 분석'),(T+'d_ing.jpg','③ 레시피')])}
'''))
d1.append(('', f'''
<div class="tag">시스템 구성</div>
<h2>서버 없이 시작한<br>서버리스 구조</h2>
<div class="arch">
 <div class="ab ab-a"><b>인스타그램 앱</b><span>공유 메뉴 (Web Share Target)</span></div>
 <div class="ar">↓</div>
 <div class="ab ab-b"><b>릴쿡 PWA</b><span>index.html · Service Worker · IndexedDB</span></div>
 <div class="ar">↓ 링크 · 진행 상황 스트리밍</div>
 <div class="ab ab-c"><b>Vercel 서버리스 함수</b><span>api/analyze · reel · video · post · account</span></div>
 <div class="tri">
  <div class="ab"><b>Apify</b><span>릴스 캡션·영상 수집</span></div>
  <div class="ab"><b>Google Gemini</b><span>영상·글 분석, 레시피 생성</span></div>
  <div class="ab"><b>Supabase (서울)</b><span>로그인·DB·사진 저장</span></div>
 </div>
</div>
<p class="note">GitHub main 브랜치에 올리면 Vercel이 자동 배포. API 키는 모두 Vercel 환경변수로만 관리.</p>
'''))
d1.append(('', f'''
<div class="tag">트러블슈팅 · v0.2</div>
<h2>서버에서 릴스를<br>가져오지 못하는 문제</h2>
{rows([(('현상','bad'),'링크만으로 캡션과 영상을 자동 수집하도록 만들었지만, 배포 서버에서는 수집이 실패'),
       (('원인','why'),'인스타그램이 클라우드 데이터센터(Vercel) IP에서 오는 요청을 차단'),
       (('해결','good'),'Apify 스크레이퍼를 거쳐 수집하는 경로를 추가하고, 실패하면 직접 수집으로 자동 전환. 원인 확인용 진단 API(ig-test)도 함께 구현'),
       (('결과','res'),'링크 공유만으로 캡션·작성자 댓글·영상 확보. 캡션을 직접 붙여 넣는 수동 입력은 보조 수단으로 유지')])}
'''))
d1.append(('', f'''
<div class="tag">트러블슈팅 · v0.3 – v0.6</div>
<h2>긴 영상 분석 중<br>연결이 끊기는 문제</h2>
{rows([(('현상','bad'),'긴 릴스를 분석하면 504 시간 초과, 휴대폰에서는 "Failed to fetch" 오류'),
       (('원인','why'),'서버 함수 제한 시간(60초) 초과, 그리고 응답이 없는 연결을 모바일 네트워크가 중간에 끊음'),
       (('해결','good'),'제한 시간 300초로 확대 · 분석 단계를 실시간으로 보내는 스트리밍 응답(NDJSON) + 5초마다 연결 유지 신호 · 75초 이상 영상은 초당 장면 수를 0.5–0.25장으로 낮춤 · 270초 자체 마감 후 재시도 안내'),
       (('결과','res'),'긴 영상도 끊김 없이 분석되고, 사용자는 "영상 받는 중 → 분석 중" 진행 상황을 볼 수 있음')])}
{code('''<span class="c">// 진행 상황 + 연결 유지 신호</span>
res.write(JSON.stringify({ stage: <span class="s">'video'</span> }) + <span class="s">'\\n'</span>);
<span class="k">const</span> beat = setInterval(() =&gt; res.write(<span class="s">'{"hb":1}\\n'</span>), <span class="s">5000</span>);''')}
'''))
d1.append(('', f'''
<div class="tag">트러블슈팅 · v0.4</div>
<h2>AI 모델 사용 불가·<br>과부하 대응</h2>
{rows([(('현상','bad'),'지정한 Gemini 모델이 신규 사용자에게 제공되지 않는다는 오류, 이용자가 몰릴 때는 503(과부하)로 분석 실패'),
       (('해결','good'),'같은 모델을 간격을 두고 재시도한 뒤 하위 모델로 자동 전환하는 대체 체계(fallback chain) 도입'),
       (('발전','res'),'v1.3에서 6개 모델 체계로 확장: 과부하(503)는 90초, 분당 한도는 대기 시간만큼, 일일 한도는 초기화 시각까지 해당 모델을 건너뜀')])}
{code('''<span class="c">// lib/gemini.js — 실패 유형별 다음 모델로 전환</span>
<span class="k">const</span> kind = classify(r);   <span class="c">// busy · quota_min · quota_day · model_gone</span>
<span class="k">if</span> (kind === <span class="s">'busy'</span>) { cool.set(model, now + <span class="s">90_000</span>); <span class="k">break</span>; }
<span class="k">if</span> (kind === <span class="s">'quota_day'</span>) { cool.set(model, nextReset()); <span class="k">break</span>; }''')}
'''))
d1.append(('', f'''
<div class="tag">기능 추가 · v0.5 – v0.7</div>
<h2>단계마다<br>해당 장면을 다시 보기</h2>
{bullets(['AI가 조리 단계마다 <b>영상 구간(clip)</b>과 <b>대표 장면(photo)</b> 시각을 함께 출력',
          'Vercel 응답 크기 제한(4.5MB)을 피하려고 인스타 영상을 <b>3MB 단위 Range 요청</b>으로 나눠 중계(api/video.js)',
          '저장한 레시피의 영상·장면은 휴대폰(IndexedDB)에 보관 → 인스타 링크가 만료돼도 재생 가능',
          '영상 속 단위(숟갈·컵)를 기본으로 보여 주고 g·ml 정밀 모드 전환, 양념 비율 카드, 분석·조리 중 화면 꺼짐 방지'])}
{phones([(T+'d_step.jpg','단계별 장면'),(T+'d_cook.jpg','요리 모드')],'two')}
'''))
d1.append(('', f'''
<div class="tag">기능 추가 · v0.8 – v0.9.1</div>
<h2>로그인·클라우드 저장<br>그리고 자랑 피드</h2>
{bullets(['Supabase로 구글 로그인, 레시피 클라우드 동기화, 요리 인증 피드(사진·별점·하트) 구현. 모든 표에 행 단위 보안(RLS) 적용',
          '<b>분석 결과 캐시</b>: 같은 릴스는 즉시 결과를 돌려줘 수집·AI 비용 0',
          '피드에 올리는 사진·글은 Gemini가 먼저 검토 → 부적절한 사진은 모자이크본만 저장'])}
{rows([(('문제','bad'),'프로필 저장 실패 — Supabase 신규 비밀 키(sb_secret_)를 Authorization 헤더에 넣어 거부됨 → apikey 헤더에만 넣도록 수정. 피드 조회 오류는 표 관계가 두 갈래로 모호해 생긴 것으로, 연결 키(user_id)를 명시해 해결')])}
{phones([(T+'th_set.jpg','','short','position:absolute;bottom:0'),(T+'d_feed.jpg','','short')],'two short')}
'''))
d1.append(('', f'''
<div class="tag">디자인 · v1.0 → v1.1</div>
<h2>템플릿 느낌을 걷어 낸<br>디자인 시스템</h2>
<p class="lead">v1.0에서 UI의 이모지 137개를 걷어 내고 직접 그린 선 아이콘, 간판체 제목(Black Han Sans), 불 세기 3칸 게이지로 바꿨습니다. 이후 "식욕이 돌지 않는다"는 피드백을 반영해 v1.1에서 <b>고추장 빨강·노른자 노랑·애호박 초록</b> 팔레트와 음식 사진 표지로 다시 바꿨습니다.</p>
<div class="vs">
 <div>{phone(I+'v10_home.jpg','v1.0')}{phone(I+'v10_cook.jpg','v1.0')}</div>
 <div class="vsa">→</div>
 <div>{phone(I+'v11_home.jpg','v1.1')}{phone(I+'v11_ing.jpg','v1.1')}</div>
</div>
'''))
d1.append(('', f'''
<div class="tag">법적 기반 · v1.2</div>
<h2>약관·개인정보 처리방침과<br>최초 동의</h2>
{bullets(['이용약관·개인정보 처리방침 작성, 첫 실행 시 필수 동의(만 14세 이상·약관·개인정보 수집), 동의 기록과 회원 탈퇴 API',
          '공개 게시물에는 원작자의 캡션·댓글·장면을 싣지 않도록 서버에서 제거, AI가 정리한 내용임을 화면에 표시',
          '데이터 저장 지역(서울)과 문의 메일 명시. <b>기능이 바뀔 때마다 약관 버전을 올려 재동의</b>를 받는 운영 규칙 수립',
          '기본·밝게·다크·자동 테마, 릴스가 레시피 카드로 바뀌는 시작 애니메이션'])}
{phones([(T+'gate.jpg','최초 동의'),(T+'th_bright.jpg','밝게'),(T+'th_dark.jpg','다크')],'three short')}
'''))
d1.append(('', f'''
<div class="tag">분석 품질 · v1.3 – v1.3.1</div>
<h2>레시피 인식 정확도와<br>AI 사용량 관리</h2>
{bullets(['댓글을 <b>작성자/시청자</b>로 구분해 작성자 댓글의 레시피를 우선 근거로 사용',
          '영상 속 자막을 읽기 위해 고해상도 프레임 분석(MEDIA_RESOLUTION_HIGH)',
          '릴스 하나에 요리가 여러 개면 레시피를 나눠 제공, 레시피마다 근거(캡션·댓글·화면) 표시',
          '모든 AI 호출을 DB(ai_usage)에 기록하고 설정에서 모델별 사용량 확인',
          '<b>토큰 절감(v1.3.1)</b>: 영상 장면 수 조절, 시청자 댓글 8개·300자 제한, 고정 지시문을 프롬프트 앞에 두어 캐시 적중률 향상'])}
{phones([(T+'u_multi.jpg','레시피 2개'),(T+'u_usage.jpg','AI 사용량','','margin-top:-150px')],'two short')}
'''))
d1.append(('', f'''
<div class="tag">DAY 1 정리</div>
<h2>첫날 변경 사항</h2>
<table class="tb">
<tr><th>시간</th><th>버전</th><th>내용</th></tr>
<tr><td>09:48</td><td>v0.1</td><td>PWA, 공유 수신, Gemini 레시피 분석</td></tr>
<tr><td>10:28–11:07</td><td>v0.2–0.4</td><td>링크 자동 수집(Apify), 300초 제한, 모델 대체 체계</td></tr>
<tr><td>18:09–18:18</td><td>v0.5–0.6</td><td>영상 단위·양념 비율, 스트리밍 응답, 긴 영상 대응</td></tr>
<tr><td>19:16</td><td>v0.7</td><td>단계별 장면 재생, 영상 조각 중계</td></tr>
<tr><td>19:41–21:15</td><td>v0.8–0.9.1</td><td>로그인·DB·피드, 콘텐츠 검토, 키 헤더 수정</td></tr>
<tr><td>21:33–21:48</td><td>v1.0–1.1</td><td>디자인 시스템 개편, 색 팔레트 변경</td></tr>
<tr><td>22:07–23:10</td><td>v1.2</td><td>테마, 약관·처리방침, 최초 동의, 탈퇴</td></tr>
<tr><td>23:26–23:32</td><td>v1.3–1.3.1</td><td>댓글 구분, 자막 인식, 다중 레시피, 사용량, 토큰 절감</td></tr>
</table>
<p class="note">다음 과제 · 앱 사용 흐름(뒤로가기·재실행) 개선, 영상 가이드 고도화</p>
'''))
DAYS.append((1, d1))

# ───────────── DAY 2 ─────────────
d2 = []
d2.append(('cover', f'''
<div class="kick">DAY 2 · 2026.11.12 (목)</div>
<h1>쓰기 편한 앱,<br>보여 줄 수 있는 앱</h1>
<p class="lead">전날 밤부터 이어진 작업으로 <b>앱 사용 흐름</b>을 다듬고, 영상을 보며 따라 하는 <b>전체 화면 영상 가이드</b>를 만들었습니다. 이어서 비공개 계정에 올릴 20초 데모 광고 영상을 제작했습니다.</p>
<div class="stat"><div><b>4건</b>GitHub 커밋</div><div><b>v1.3.2 → v1.4.1</b>버전</div><div><b>20초</b>데모 영상</div></div>
<div class="chips"><span>뒤로가기·이어서 열기</span><span>영상 가이드</span><span>표지 선택</span><span>회귀 버그 수정</span><span>데모 광고</span></div>
'''))
d2.append(('', f'''
<div class="tag">사용성 개선 · v1.3.2</div>
<h2>뒤로가기를 누르면<br>앱이 꺼지던 문제</h2>
{rows([(('현상','bad'),'안드로이드에서 뒤로가기를 누르면 이전 화면이 아니라 앱이 종료되고, 다시 켜면 시작 화면부터 다시 시작'),
       (('원인','why'),'한 페이지 안에서 화면만 바꾸는 구조(SPA)라 화면 이동이 브라우저 방문 기록에 남지 않음'),
       (('해결','good'),'화면을 열 때마다 방문 기록을 추가(history.pushState)해 뒤로가기로 한 단계씩 복귀, 첫 화면에서는 두 번 눌러야 종료. 보던 화면(요리 단계 포함)을 기기에 저장해 재실행 시 그대로 복원, 6시간 안에 다시 열면 시작 애니메이션 생략'),
       (('부가','res'),'개인정보 처리방침의 "기기에만 저장되는 정보"에 마지막으로 보던 화면을 추가')])}
'''))
d2.append(('', f'''
<div class="tag">기능 추가 · v1.4</div>
<h2>전체 화면<br>영상 가이드</h2>
{bullets(['영상을 재생하면 <b>현재 장면에 해당하는 조리 단계</b>가 자동으로 표시되고, 단계 구간만 반복 재생 가능',
          '가로로 돌리면 영상과 단계 설명을 나란히 배치',
          '분석이 진행되는 동안 영상을 미리 내려받음(2MB 조각 3개 병렬) → 가이드를 열자마자 재생',
          'AI가 고른 <b>완성 장면</b>을 표지로 쓰고, 마음에 들지 않으면 직접 고르는 "표지 바꾸기"'])}
<div class="land">{phone(T+'p_land.jpg','가로 모드','land')}</div>
<div class="phones">{phone(T+'p_play.jpg','세로 가이드','short')}{phone(T+'p_pick.jpg','표지 고르기','short','position:absolute;bottom:0')}</div>
'''))
d2.append(('', f'''
<div class="tag">트러블슈팅 · v1.4</div>
<h2>단일 레시피에서<br>장면이 사라진 회귀 버그</h2>
{rows([(('현상','bad'),'v1.3 이후 요리가 하나뿐인 릴스에서 단계별 장면과 표지 사진이 표시되지 않음'),
       (('원인','why'),'다중 레시피 기능을 넣으면서, 레시피를 열 때 영상 정보(setMedia)를 비우는 코드가 단일 레시피에도 실행됨'),
       (('해결','good'),'다중 레시피 묶음이 아닐 때만 영상 정보를 초기화하도록 조건 추가'),
       (('교훈','res'),'새 기능이 기존 기능을 깨뜨리는 회귀(regression)를 막기 위해 이후 시나리오별 자동 테스트를 추가')])}
{code('''<span class="c">// 수정 전: 항상 초기화 → 단일 레시피도 장면 정보 손실</span>
S.setMedia = <span class="k">null</span>;
<span class="c">// 수정 후: 다중 레시피 묶음이 아닐 때만</span>
<span class="k">if</span> (!set) S.setMedia = <span class="k">null</span>;''')}
'''))
d2.append(('', f'''
<div class="tag">트러블슈팅 · v1.4.1</div>
<h2>영상 가이드의 단계 표시가<br>재생 순서와 어긋나는 문제</h2>
{rows([(('현상','bad'),'재생 중 단계 표시가 순서대로 넘어가지 않고 앞뒤로 오감(예: 3단계 다음 다시 2단계). 반복 재생하면 오프닝에 마지막 단계 설명이 표시됨'),
       (('원인','why'),'AI가 추정한 단계별 장면 시각 일부가 실제 순서와 반대이거나 서로 겹침. 재생 시각으로 단계를 찾을 때 이런 구간도 그대로 반영'),
       (('해결','good'),'시작 시각이 앞 단계보다 0.5초 이상 뒤인 단계만 자동 전환 시간표에 포함(단조 증가 타임라인). 첫 장면 전에는 "곧 시작"을 표시하고, 직접 고른 단계는 해당 장면이 끝날 때까지 유지')])}
{code('''<span class="c">// 시작 시각이 순서대로 늘어나는 단계만 시간표에 포함</span>
<span class="k">function</span> timeline(){ <span class="k">let</span> last = -<span class="s">1</span>;
  steps.forEach((x, i) =&gt; { <span class="k">if</span> (x.clip.start &gt;= last + <span class="s">0.5</span>)
    { out.push({ i, start: x.clip.start }); last = x.clip.start; } }); }''')}
'''))
d2.append(('', f'''
<div class="tag">홍보 · 데모 영상</div>
<h2>20초 데모<br>광고 영상 제작</h2>
{bullets(['준비한 요리 영상과 앱 화면을 엮어 "릴스 공유 → 레시피 완성" 흐름을 20초로 구성',
          '앱 시작 애니메이션 로고로 마무리, <b>DEMO·제작 중</b> 문구로 개발 단계임을 명시',
          '소리 없이 보는 사용자를 고려한 자막과 TTS 내레이션 대본(SRT) 작성',
          'CapCut 모바일 편집 방법 정리, 비공개 계정용 캡션과 고정 댓글(다운로드 링크) 작성'])}
{private("ad_strip.html", "")}
'''))
d2.append(('', f'''
<div class="tag">DAY 2 정리</div>
<h2>둘째 날 변경 사항</h2>
<table class="tb">
<tr><th>시간</th><th>버전</th><th>내용</th></tr>
<tr><td>00:02</td><td>v1.3.2</td><td>뒤로가기 단계 이동, 보던 화면 복원, 시작 애니메이션 생략 조건</td></tr>
<tr><td>00:17</td><td>v1.4</td><td>전체 화면 영상 가이드, 영상 미리 받기, 표지 선택, 회귀 버그 수정</td></tr>
<tr><td>00:30</td><td>v1.4.1</td><td>단조 증가 타임라인, "곧 시작" 표시, 수동 선택 유지</td></tr>
<tr><td>이후</td><td>—</td><td>20초 데모 광고 영상, 캡션·고정 댓글</td></tr>
</table>
<p class="note">다음 과제 · 캡션 없이 영상에만 레시피가 있는 릴스를 분석하지 못하는 문제</p>
'''))
DAYS.append((2, d2))

# ───────────── DAY 3 ─────────────
d3 = []
d3.append(('cover', f'''
<div class="kick">DAY 3 · 2026.11.13 (금)</div>
<h1>영상만 있는 릴스를<br>읽어 내기</h1>
<p class="lead">캡션이나 댓글 없이 <b>영상의 자막과 음성에만 레시피가 담긴 릴스</b>는 재료와 분량을 제대로 뽑아내지 못했습니다. 실제 실패 사례를 바탕으로 분석을 두 단계로 나누는 구조로 다시 설계했습니다.</p>
<div class="stat"><div><b>1건</b>GitHub 커밋</div><div><b>v1.5</b>버전</div><div><b>2단계</b>분석 파이프라인</div></div>
<div class="chips"><span>장면 기록</span><span>레시피 작성</span><span>자동 재분석</span><span>실패 원인 코드</span></div>
'''))
d3.append(('', f'''
<div class="tag">문제 정의</div>
<h2>정보가 영상 속에만<br>있을 때 생긴 한계</h2>
{rows([(('현상','bad'),'캡션·작성자 댓글에 분량이 없는 릴스에서 재료나 양이 빠지거나, 요리 영상인데도 "레시피가 아니다"로 판단'),
       (('원인','why'),'한 번의 AI 호출로 긴 영상을 이해하는 일과 정해진 형식(JSON)의 레시피를 쓰는 일을 동시에 시키면서 자막·음성의 세부 정보가 누락'),
       (('조건','res'),'무료 AI 한도 안에서 해결해야 하므로, 정보가 부족한 릴스에만 추가 호출을 쓰는 방식이 필요')])}
'''))
d3.append(('', f'''
<div class="tag">해결 · v1.5</div>
<h2>2단계 분석<br>파이프라인</h2>
<div class="flow">
 <div class="fb"><div class="fn">조건</div><b>캡션·작성자 댓글에 분량 정보가 없을 때만</b><span>정보가 충분하면 기존 1회 분석 유지</span></div>
 <div class="fa">↓</div>
 <div class="fb"><div class="fn">1단계 · 장면 기록</div><b>영상을 처음부터 끝까지 보고 기록</b><span>장면 시각, 화면 자막, 음성, 등장 재료, 눈에 보이는 양 (고해상도 프레임)</span></div>
 <div class="fa">↓</div>
 <div class="fb"><div class="fn">2단계 · 레시피 작성</div><b>캡션 + 댓글 + 장면 기록 → 레시피</b><span>영상 단위를 그대로 옮기고, 화면만 보고 정한 양은 "추정"으로 표시</span></div>
 <div class="fa">↓</div>
 <div class="fb"><div class="fn">보완</div><b>결과가 비면 자동 재분석</b><span>실패 시 원인 코드(예: no_recipe · two_stage)를 화면에 표시</span></div>
</div>
'''))
d3.append(('', f'''
<div class="tag">구현 · v1.5</div>
<h2>코드와 화면</h2>
{code('''<span class="c">// api/analyze.js — 1단계: 장면 기록</span>
emit({ stage: <span class="s">'scan'</span> });
<span class="k">const</span> scanCfg = { mediaResolution: <span class="s">'MEDIA_RESOLUTION_HIGH'</span> };
<span class="k">const</span> sc = <span class="k">await</span> generate({ cfgs: [scanCfg], ... });
<span class="c">// 2단계: 장면 기록을 주된 근거로 레시피 작성</span>
<span class="k">const</span> p2 = buildPrompt({ caption, comments, scanLog: log });''')}
{phones([(T+'u_scan.jpg','장면 기록 중','short'),(T+'u_err.jpg','실패 원인 표시','short')],'two short')}
<p class="note">갤러리에서 고른 영상은 장면 10–20장을 뽑아 분석</p>
'''))
d3.append(('', f'''
<div class="tag">DAY 3 정리</div>
<h2>셋째 날 변경 사항</h2>
<table class="tb">
<tr><th>시간</th><th>버전</th><th>내용</th></tr>
<tr><td>00:07</td><td>v1.5</td><td>영상만 있는 릴스 2단계 분석, 자동 재분석, 갤러리 영상 장면 10–20장, 실패 원인 코드</td></tr>
</table>
<div class="sum">
 <div><b>설계 포인트</b>모든 릴스에 2단계를 쓰지 않고 <b>정보가 부족할 때만</b> 실행해 AI 호출 수를 관리</div>
 <div><b>검증</b>실제로 분석에 실패한 릴스 사례를 기준으로 설계하고, 가짜 서버 기반 자동 테스트(video_only)로 재발 방지</div>
</div>
<p class="note">다음 과제 · 앱 전체 기능 점검, 공개 운영을 위한 사용량 제한</p>
'''))
DAYS.append((3, d3))

# ───────────── DAY 4 ─────────────
d4 = []
d4.append(('cover', f'''
<div class="kick">DAY 4 · 2026.11.14 (토)</div>
<h1>운영할 수 있는<br>서비스로</h1>
<p class="lead">기능 전체를 다시 점검해 <b>5단계 로드맵</b>을 세우고, 그 1단계로 사용량 제한·실패 기록·자동 테스트 등 <b>운영 기반</b>을 갖췄습니다. 이후 작업을 Claude Code로 옮겨 이어 갈 수 있도록 작업 규칙도 문서화했습니다. 자정 직전에는 로드맵 2단계(평가 모드·레시피 직접 수정·재분석)를 <b>v1.7</b>로 배포했습니다.</p>
<div class="stat"><div><b>6건</b>GitHub 커밋</div><div><b>v1.6 → v1.7</b>버전</div><div><b>10개</b>자동 테스트</div></div>
<div class="chips"><span>로드맵</span><span>하루 10회 제한</span><span>실패 기록</span><span>개인정보 최소화</span><span>자동 테스트</span><span>DB 통합 스크립트</span><span>평가 모드</span><span>레시피 직접 수정</span></div>
'''))
d4.append(('', f'''
<div class="tag">기획 · 전체 점검</div>
<h2>기능 점검과<br>5단계 로드맵</h2>
<table class="tb tb3">
<tr><th>단계</th><th>내용</th></tr>
<tr><td>1 (완료)</td><td>하루 분석 횟수 제한, 실패 기록, 개인정보 최소화, 자동 테스트</td></tr>
<tr><td>2</td><td>평가 모드(릴스 20개 일괄 분석 후 정답 체크), 레시피 직접 수정, "결과가 이상해요" 재분석</td></tr>
<tr><td>3</td><td>갤러리 영상 음성 분석, 영상 용량 확대, 코드 파일 분리, 타이머 알림</td></tr>
<tr><td>4</td><td>요리 모드 음성 명령, 레시피 검색·태그, 카카오톡 공유, 피드 신고·차단</td></tr>
<tr><td>5</td><td>출시 시 유료 요금제 전환, 수집 방식 재검토, 약관 전문가 검토</td></tr>
</table>
<p class="note">평가 모드는 AI가 직접 릴스를 감상할 수 없다는 점을 고려해, 앱이 일괄 분석하고 사람이 정답 여부를 표시하는 방식으로 설계</p>
'''))
d4.append(('', f'''
<div class="tag">운영 기반 · v1.6</div>
<h2>하루 분석 10회 제한과<br>테스터 예외</h2>
{rows([(('배경','why'),'무료 AI 한도는 모든 사용자가 공유하므로, 한 사람이 과도하게 쓰면 다른 사용자의 분석이 막힘'),
       (('설계','good'),'한국 시간 자정 기준 1인 하루 10회. 로그인 사용자는 계정 ID, 비로그인 사용자는 IP를 솔트 해시로 바꿔 기록(원본 IP 미저장). 개발·테스트용 계정은 Vercel 환경변수(TESTER_EMAILS)에만 등록해 제한 제외'),
       (('부가','res'),'일일 한도에 걸렸을 때 "AI 과부하"가 아닌 정확한 안내 문구가 나오도록 오류 분류 수정')])}
{code('''<span class="c">// lib/quota.js</span>
<span class="k">export const</span> DAILY_LIMIT = +process.env.DAILY_LIMIT || <span class="s">10</span>;
<span class="k">export function</span> isTester(user) { <span class="c">/* TESTER_EMAILS에 있으면 예외 */</span> }
<span class="k">return</span> <span class="s">'ip:'</span> + sha256(ip + salt).slice(<span class="s">0</span>, <span class="s">24</span>);  <span class="c">// 원본 IP 저장 안 함</span>''')}
'''))
d4.append(('', f'''
<div class="tag">운영 기반 · v1.6</div>
<h2>실패 기록과<br>개인정보 최소화</h2>
{bullets(['분석이 실패하면 원인 코드·모델·소요 시간을 기록(analysis_failures)하고, 설정의 사용량 화면에서 최근 실패를 확인',
          '분석 캐시에서 <b>시청자 댓글을 제거</b>해 다른 사람의 글을 필요 이상 보관하지 않도록 변경',
          '오래된 기록은 보관 기간이 지나면 자동 정리(cleanupMaybe)',
          '바뀐 내용에 맞춰 약관을 개정(2026-11-14)하고 모든 사용자에게 재동의 요청'])}
{phones([(T+'th_set.jpg','설정','short','position:absolute;bottom:0'),(T+'u_usage.jpg','AI 사용량','short','margin-top:-150px')],'two short')}
'''))
d4.append(('', f'''
<div class="tag">품질 관리</div>
<h2>배포 전 자동 테스트<br>9개 시나리오</h2>
<table class="tb tb2">
<tr><td>e2e_full</td><td>공유 → 분석 → 저장 전체 흐름</td></tr>
<tr><td>share_before_consent</td><td>동의 전 공유가 들어온 경우</td></tr>
<tr><td>consent_theme</td><td>최초 동의, 테마 전환</td></tr>
<tr><td>back_resume</td><td>뒤로가기, 보던 화면 복원</td></tr>
<tr><td>video_guide · guide_order</td><td>영상 가이드, 단계 전환 순서</td></tr>
<tr><td>video_only</td><td>영상만 있는 릴스 2단계 분석</td></tr>
<tr><td>daily_limit · multi_quota_ui</td><td>하루 10회 제한, 다중 레시피·한도 화면</td></tr>
</table>
{rows([(('설계','good'),'가짜 서버(mock-server)로 동작해 실제 API 키와 무료 AI 사용량을 쓰지 않음. bash tests/run_all.sh 한 번으로 전체 실행'),
       (('문제','bad'),'테스트가 간헐적으로 실패 — 이전 테스트 서버 프로세스가 포트를 점유하고 있었음 → 실행 전 포트 정리, 잠깐 나타났다 사라지는 화면 문구 대신 서버 기록으로 검증')])}
'''))
d4.append(('', f'''
<div class="tag">작업 환경</div>
<h2>DB 변경 통합과<br>작업 규칙 문서화</h2>
{rows([(('문제','bad'),'DB 구조 변경이 버전마다 별도 SQL 파일로 나뉘어 있어, 어떤 파일을 어디서 실행해야 하는지 혼란'),
       (('해결','good'),'v1.2–v1.4 변경을 한 파일로 합치고 여러 번 실행해도 안전하게(멱등성) 작성. 안내할 때는 파일 이름 대신 복사할 SQL 전문과 메뉴 위치를 단계별로 제공'),
       (('문서화','res'),'CLAUDE.md에 프로젝트 요약·현재 상태·다음 할 일과 필수 규칙(약관 동시 수정, 배포 전 테스트, 비밀 키 관리, main 브랜치만 배포)을 정리'),
       (('이전','why'),'Claude Code 클라우드 환경에서 테스트가 돌도록 설치된 크롬 경로(CHROME_PATH)를 자동 사용')])}
'''))
d4.append(('', f'''
<div class="tag">로드맵 2단계 · v1.7</div>
<h2>평가 모드와<br>레시피 직접 수정</h2>
{bullets(['<b>평가 모드</b> · 릴스 링크를 최대 20개 넣으면 차례로 분석하고, 결과마다 맞음(✓)·틀림(✗)을 표시해 요약을 복사. 사람이 정답을 판정하고 개발자가 원인을 고치는 품질 개선 루프의 시작점',
          '<b>저장한 레시피 직접 수정</b> · 제목·인분·재료·분량·단계 편집. 분량을 바꾸면 g·ml도 같은 비율로 환산하고, 고친 레시피는 "AI 정리 + 직접 고침"으로 구분 표시',
          '<b>"결과가 이상해요"</b> · 이유를 고르면 캐시를 건너뛰고 처음부터 다시 분석. 이유는 누가 보냈는지 없이 실패 기록에만 남기고, 저장본은 사용자가 고를 때만 교체',
          '기능에 맞춰 약관 개정, 자동 테스트 10개로 확대'])}
{phones([(T+'v17_bad.jpg','결과가 이상해요'),(T+'v17_edit.jpg','레시피 수정')],'two short')}
'''))
d4.append(('', f'''
<div class="tag">DAY 4 정리</div>
<h2>넷째 날 변경 사항</h2>
<table class="tb">
<tr><th>시간</th><th>버전</th><th>내용</th></tr>
<tr><td>v1.6 전</td><td>—</td><td>전체 기능 점검, 5단계 로드맵 합의</td></tr>
<tr><td>23:14</td><td>v1.6</td><td>하루 10회 제한, 실패 기록, 캐시 개인정보 최소화, 자동 정리, 약관 개정, 테스트 저장소 이동</td></tr>
<tr><td>23:20</td><td>—</td><td>DB 변경 SQL 통합(멱등)</td></tr>
<tr><td>23:25</td><td>—</td><td>CLAUDE.md 작업 규칙 문서화</td></tr>
<tr><td>23:31</td><td>—</td><td>클라우드 테스트 환경 대응</td></tr>
<tr><td>23:40</td><td>—</td><td>개발 도구 설정(코드 탐색·출력 압축 MCP, 과잉 구현 방지 규칙)</td></tr>
<tr><td>23:52</td><td>v1.7</td><td>평가 모드, 레시피 직접 수정, "결과가 이상해요" 재분석, 약관 개정</td></tr>
</table>
<p class="note">다음 과제 · 평가 모드로 실제 릴스 정확도 측정, 측정 결과에 따라 분석 규칙 개선</p>
'''))
DAYS.append((4, d4))

# ───────────── DAY 5 ─────────────
d5 = []
d5.append(('cover', f'''
<div class="kick">DAY 5 · 2026.11.15 (일)</div>
<h1>회고, 그리고<br>평가로 고치는 하루</h1>
<p class="lead">지금까지의 대화와 커밋 기록을 날짜별로 다시 검토해 개발 일지를 정리했습니다. 무엇을 만들었고, 어디서 막혔고, 어떻게 풀었는지를 돌아봅니다. 이어서 평가 모드로 실제 릴스의 정확도를 측정하고, 앱을 닫아도 분석이 끝나고 알림이 오는 구조를 완성했습니다.</p>
<div class="stat"><div><b>11건</b>GitHub 커밋</div><div><b>v1.7 → v1.9.2</b>버전</div><div><b>29% → 67%</b>평가 정확도</div></div>
<div class="chips"><span>회고</span><span>진단형 평가 모드</span><span>이어서 분석</span><span>서버 백그라운드 분석</span><span>분석 완료 알림</span><span>재현 테스트</span><span>자동 테스트 15개</span></div>
'''))
d5.append(('', f'''
<div class="tag">회고</div>
<h2>프롬프트가 기능이<br>되기까지</h2>
<div class="map">
 <div class="m"><div class="p">AI 서버가 붐빈다는 오류가 반복되고, 무료 사용량을 확인할 수 없다</div><div class="a">→</div><div class="f">6개 모델 자동 전환<span>+ 모델별 사용량 화면</span></div></div>
 <div class="m"><div class="p">영상만 분석하면 가능한 릴스다. 해결책을 마련해 달라</div><div class="a">→</div><div class="f">2단계 분석 파이프라인<span>장면 기록 → 레시피</span></div></div>
 <div class="m"><div class="p">릴스 하나에 레시피가 여러 개일 수 있다. 기능이 우선이다</div><div class="a">→</div><div class="f">다중 레시피 선택<span>레시피별 근거 표시</span></div></div>
 <div class="m"><div class="p">뒤로가기를 누르면 앱이 꺼지고, 다시 켜면 처음부터 시작된다</div><div class="a">→</div><div class="f">방문 기록·화면 복원<span>6시간 내 재실행 시 바로 열기</span></div></div>
 <div class="m"><div class="p">영상 가이드의 단계가 순서대로 넘어가지 않는다</div><div class="a">→</div><div class="f">단조 증가 타임라인<span>오프닝 "곧 시작" 표시</span></div></div>
 <div class="m"><div class="p">하루 10회로 제한하되 테스터는 제한하지 말 것</div><div class="a">→</div><div class="f">일일 한도 + 테스터 예외<span>이메일은 환경변수에만</span></div></div>
</div>
<p class="note">효과적이었던 요청 방식 · 현상을 구체적으로 + 원하는 결과 + 우선순위를 한 번에 전달</p>
'''))
d5.append(('', f'''
<div class="tag">회고</div>
<h2>배운 점과<br>다음 계획</h2>
<div class="list">
 <div class="li"><div class="n">1</div><div><b>비밀 정보는 코드와 대화 밖에서 관리</b><span>API 키·테스터 이메일은 Vercel 환경변수에만, Supabase 비밀 키는 정해진 헤더로만 전송</span></div></div>
 <div class="li"><div class="n">2</div><div><b>무료 한도는 설계로 아낀다</b><span>모델 자동 전환, 결과 캐시, 영상 장면 수 조절, 필요할 때만 2단계 분석</span></div></div>
 <div class="li"><div class="n">3</div><div><b>작게 자주 배포하고 자동으로 검증</b><span>5일간 29번 커밋, 회귀 버그 이후 시나리오별 자동 테스트 도입</span></div></div>
 <div class="li"><div class="n">4</div><div><b>기능과 약관은 함께 바뀐다</b><span>새로운 데이터를 다룰 때마다 처리방침을 고치고 재동의</span></div></div>
</div>
<div class="next"><b>다음 계획</b>평가 모드로 분석 정확도를 수치화 · 레시피 직접 수정 · "결과가 이상해요" 재분석</div>
'''))
d5.append(('', f'''
<div class="tag">품질 관리 · 평가 모드 개선</div>
<h2>채점표에서<br>진단 도구로</h2>
{rows([(('문제','bad'),'첫 평가 모드는 맞음·틀림만 기록해, 틀렸을 때 원인이 자료 부족인지 AI 판단 오류인지 구분할 수 없었음'),
       (('설계','good'),'릴스마다 있던 자료(캡션·작성자 댓글·자막·음성·영상)와 AI가 근거로 쓴 자료, 추정 재료 비율, 캡션 분량 자동 대조를 함께 기록. 틀린 결과에는 이유(분량·재료·순서·다른 요리·누락)를 선택'),
       (('결과','res'),'유형별·근거별·이유별 집계와 회차 비교를 한 번에 복사해 개선 작업의 입력으로 사용. 테스터 계정에만 표시')])}
{phones([(T+'v17_eval.jpg','평가 모드')],'short')}
'''))
d5.append(('', f'''
<div class="tag">트러블슈팅 · 분석 시간 초과</div>
<h2>요리 릴스인데<br>분석이 실패하는 문제</h2>
{rows([(('현상','bad'),'평가 모드 첫 릴스부터 too_long(시간 초과)으로 실패'),
       (('원인','why'),'릴스 수집(최대 90초)·영상 다운로드·고화질 분석·재분석이 한 번의 서버 요청(제한 약 4분 30초)에 몰림. 재시도할 때마다 영상 전체를 다시 전송'),
       (('해결','good'),'시간이 모자라면 실패 대신 진행 상태(캡션·댓글·장면 기록)를 넘기고 가벼운 설정으로 이어서 분석(최대 3회). 영상은 Google Files API에 한 번 올려 주소로 재사용'),
       (('결과','res'),'실패 기록에 단계별 소요 시간(수집·다운로드·업로드·모델별 호출)을 남겨 원인 추적이 가능해짐')])}
{code('''<span class="c">// 시간이 모자라면 실패 대신 이어서 분석</span>
<span class="k">if</span> (out.reason === <span class="s">'too_long'</span> &amp;&amp; hop + <span class="s">1</span> &lt; MAX_HOPS)
  <span class="k">return</span> {{ continue: <span class="k">true</span>, resume: {{ caption, comments, file, scanLog }} }};''')}
'''))
d5.append(('', f'''
<div class="tag">평가 1회차 · v1.7.1</div>
<h2>정확도 29%,<br>원인의 절반은 앱</h2>
{rows([(('앱','bad'),'단계 문장에 분량이 두 번 들어가고 조사가 맞지 않음("계란 2개 2개", "가루 약간를") → 문장 조립 함수가 중복 분량을 지우고 받침에 맞게 조사 교정'),
       (('앱','bad'),'"적당히·듬뿍"이 모두 "약간"으로 표시돼 의미가 바뀜 → 말로 된 분량은 원문 그대로 표시'),
       (('AI','why'),'캡션 숫자를 바꾸거나(5 → 5.5) 필요 없는 양을 추정 → 자료의 숫자는 유지하고, 꼭 필요한 재료만 ½·1·2 같은 쉬운 값으로 추정'),
       (('AI','why'),'영상만 보고 개수를 적게 셈 → 장면 기록에서 봉지·개수·넣은 횟수를 세도록 지시')])}
{code('''<span class="s">"[[2]]를 2개 넣는다"</span>   → 계란 2개를 넣는다
<span class="s">"[[5]]를 약간 뿌린다"</span> → 파슬리 가루를 약간 뿌린다''')}
'''))
d5.append(('', f'''
<div class="tag">구조 개선 · v1.8</div>
<h2>앱을 닫아도<br>서버가 끝까지 분석</h2>
{rows([(('배경','why'),'평가 12건 중 5건이 미완료. 분석이 앱과 서버가 연결된 동안에만 진행돼, 사용자가 앱을 나가면 중단됨'),
       (('설계','good'),'분석을 "작업"으로 서버(Supabase)에 맡기고, 서버가 다음 단계를 스스로 호출해 끝까지 진행. 기기 단위로 동시 2건, 일반 분석이 평가보다 우선'),
       (('앱','res'),'한 번의 요청으로 모든 작업 상태를 확인하고, 다시 열면 결과를 이어 받음. 받은 작업은 즉시 삭제(최대 3일 보관)하고 처리방침에 반영')])}
{phones([(T+'v18_bg.jpg','분석 중 화면')],'short')}
'''))
d5.append(('', f'''
<div class="tag">트러블슈팅 · v1.8.1</div>
<h2>서버 오류를<br>"인터넷 끊김"으로 안내</h2>
{rows([(('현상','bad'),'DB 설정 후 앱을 다시 열자 "인터넷 연결이 끊겼어요" 오류'),
       (('원인','why'),'서버가 오류로 응답해도 앱이 약 100초 기다린 뒤 일괄적으로 네트워크 오류로 분류. 앱 내부 오류도 같은 문구로 표시돼 실제 원인이 가려짐'),
       (('해결','good'),'작업 확인이 10초 넘게 오류이거나 90초 넘게 시작되지 않으면 즉시 직접 분석으로 전환. 실제 네트워크 오류만 인터넷 안내, 그 밖에는 원인 코드 표시. 서버 간 호출 주소를 고정해 별도 설정을 없앰'),
       (('결과','res'),'설정 > AI 사용량에 서버 분석 점검(작업 표·서버 자기 호출) 항목 추가')])}
'''))
d5.append(('', f'''
<div class="tag">평가 2회차 · v1.8.2</div>
<h2>정확도<br>29% → 67%</h2>
<div class="stat2"><div><b>29%</b>1회차 (7건 평가)</div><div><b>67%</b>2회차 (12건 평가)</div><div><b>12/12</b>분석 성공</div></div>
<div style="height:26px"></div>
{rows([(('앱','bad'),'영상 가이드에서 장면 시각이 없는 단계로 넘어가면 앞 단계로 되돌아감 → 해당 단계에 머물고 영상 정지, 영상 길이를 넘는 시각은 무시'),
       (('AI','why'),'단계 재료 누락, 영어 레시피 번역투, 튀김을 삶기로 판단, 영상 속 "기름 두르기" 누락 → 재료 빠짐없이, 한국식 계량(cup→컵, oz→g), 팬 속 액체로 조리 방법 판단, 보이는 기본 동작 포함'),
       (('측정','res'),'평균 509초는 대기·앱 종료 시간까지 포함한 값 → 서버가 실제 분석 시간과 대기 시간을 분리 측정')])}
'''))
d5.append(('', f'''
<div class="tag">신규 기능 · v1.9</div>
<h2>분석이 끝나면<br>폰으로 알림</h2>
{bullets(['웹 푸시를 외부 라이브러리 없이 표준(RFC 8291 암호화, RFC 8292 VAPID 서명)대로 직접 구현',
          '서명 키를 기존 서버 비밀 키에서 파생해 환경변수 추가·DB 변경 없이 배포',
          '알림 주소는 분석 작업에 함께 저장하고 작업과 함께 삭제. 브라우저 푸시 서비스 주소만 허용',
          '평가 모드는 모든 분석이 끝났을 때 한 번만 알림, 앱을 보고 있는 중에는 생략',
          '테스트에서는 가짜 기기가 실제 기기처럼 알림을 복호화하고 서명을 검증'])}
{phones([(T+'v19_set.jpg','알림 설정·시험')],'short')}
'''))
d5.append(('', f'''
<div class="tag">트러블슈팅 · v1.9.1 – v1.9.2</div>
<h2>앱을 열어야 끝나던<br>분석과 알림</h2>
{rows([(('현상','bad'),'앱을 닫으면 알림이 오지 않고 다시 열어야 레시피가 표시됨. 테스터 계정에 하루 분석 한도가 적용됨'),
       (('원인 1','why'),'서버가 다음 단계를 호출한 뒤 2.5초 만에 연결을 끊어, 호출받은 쪽의 분석까지 중단됨'),
       (('해결','good'),'요청 즉시 응답(202)하고 분석은 waitUntil로 끝까지 실행. Supabase 예약 작업(pg_cron)이 1분마다 멈춘 작업을 재시작하는 안전망 추가'),
       (('원인 2','why'),'인스타그램 공유로 앱이 열리면 로그인·설정을 불러오기 전에 분석을 맡겨, 로그인 정보와 알림 주소가 빠짐'),
       (('해결','good'),'분석을 맡기기 전 로그인·설정 로딩을 최대 8초 대기. 이전 코드에서 같은 실패를 재현하는 테스트를 먼저 만들어 수정 효과를 검증')])}
'''))
d5.append(('', f'''
<div class="tag">DAY 5 정리</div>
<h2>다섯째 날 변경 사항</h2>
<table class="tb tb3">
<tr><th>시간</th><th>버전</th><th>내용</th></tr>
<tr><td>00:10</td><td>—</td><td>평가 모드 진단 도구화(근거·틀린 이유·집계·회차 비교)</td></tr>
<tr><td>00:22</td><td>—</td><td>평가 동시 분석, 진행 단계 표시, 화면 꺼짐 방지</td></tr>
<tr><td>00:34</td><td>—</td><td>시간 초과 시 이어서 분석, 영상 1회 업로드</td></tr>
<tr><td>00:57</td><td>v1.7.1</td><td>1회차 반영: 문장 조립, 분량 규칙</td></tr>
<tr><td>10:47</td><td>v1.8</td><td>앱을 닫아도 서버가 분석</td></tr>
<tr><td>11:47</td><td>v1.8.1</td><td>서버 오류 시 즉시 전환, 점검 화면</td></tr>
<tr><td>13:00</td><td>—</td><td>개발 일지 카드 생성 도구</td></tr>
<tr><td>13:20</td><td>v1.8.2</td><td>2회차 반영: 영상 가이드, 번역·조리 방법</td></tr>
<tr><td>13:56</td><td>v1.9</td><td>분석 완료 알림</td></tr>
<tr><td>14:17</td><td>v1.9.1</td><td>백그라운드 완료 보장, 1분 안전망</td></tr>
<tr><td>14:36</td><td>v1.9.2</td><td>공유 시 로그인·알림 누락 수정</td></tr>
</table>
<p class="note">다음 과제 · "원본대로 / AI 자세히" 레시피 보기 전환, 3단계(갤러리 영상 음성 분석, 코드 파일 분리)</p>
'''))
DAYS.append((5, d5))


# ───────────── PIN ─────────────
dp = []
dp.append(('pincover', f'''
<div class="kick2">요리 릴스 레시피 가이드 앱</div>
<h1 class="pin-h">릴쿡<span class="bars big"><i></i><i></i><i></i></span></h1>
<p class="pin-t">저장만 해 둔 요리 릴스,<br>이제 따라 만들어 보세요.</p>
<p class="lead pin-l">인스타그램에서 요리 릴스를 공유하면 AI가 재료·계량·조리 단계를 정리한 <b>초보자용 레시피</b>로 바꿔 드립니다.</p>
<div class="pin-ph">{phone(T+'th_bright.jpg','')}{phone(T+'u_multi.jpg','','', 'margin-top:-40px')}</div>
<div class="chips pin-c"><span>개발 중</span><span>DEMO v1.6</span><span>안드로이드 웹앱</span></div>
'''))
dp.append(('', f'''
<div class="tag">이런 분께 필요해요</div>
<h2>릴스로 요리하다<br>막혔던 적 있나요?</h2>
<div class="checks">
 <div><i></i>저장 탭에 요리 릴스는 쌓여 있는데 한 번도 만들어 본 적이 없다</div>
 <div><i></i>레시피를 보려고 영상을 몇 번이나 멈추고 되감았다</div>
 <div><i></i>화면 속 재료가 내가 가진 것과 같은 건지 헷갈린다</div>
 <div><i></i>"적당히", "조금"만 보고는 양을 가늠할 수 없다</div>
</div>
<div class="quote" style="margin-top:auto">군 복무 중 저장해 둔 요리 릴스를<br>전역 후 직접 따라 하다 시작한 앱입니다</div>
'''))
dp.append(('', f'''
<div class="tag">사용 방법</div>
<h2>공유 버튼 한 번이면<br>레시피가 완성돼요</h2>
<div class="steps3">
 <div><span>1</span><b>릴스 공유</b>인스타그램 공유 메뉴에서 릴쿡 선택</div>
 <div><span>2</span><b>AI 분석</b>캡션·댓글·영상 속 자막과 음성까지 읽기</div>
 <div><span>3</span><b>레시피 완성</b>재료·계량·단계별 장면으로 정리</div>
</div>
{phones([(T+'d_home.jpg',''),(T+'u_scan.jpg',''),(T+'d_ing.jpg','')])}
'''))
dp.append(('', f'''
<div class="tag">주요 기능</div>
<h2>초보자를 위한<br>레시피 가이드</h2>
<div class="feat">
 <div><b>g·ml 계량 변환</b>영상 속 숟갈·컵 단위를 g·ml로, 인분에 맞춰 자동 계산</div>
 <div><b>단계별 장면 재생</b>조리 단계마다 해당 장면만 반복해서 확인</div>
 <div><b>전체 화면 영상 가이드</b>영상이 흐르면 지금 할 단계가 자동으로 표시</div>
 <div><b>영상만 있는 릴스도 분석</b>캡션이 없어도 영상 자막과 음성으로 레시피 추출</div>
 <div><b>레시피 여러 개 인식</b>한 릴스에 요리가 여러 개면 나눠서 정리</div>
 <div><b>저장·요리 인증</b>내 레시피 보관, 완성한 요리를 피드에 공유</div>
</div>
<p class="note">레시피는 AI가 정리한 내용으로, 근거(캡션·댓글·화면)를 함께 표시합니다</p>
'''))
dp.append(('', f'''
<div class="tag">개발 현황</div>
<h2>혼자서 AI와 함께<br>만들고 있어요</h2>
<div class="stat2"><div><b>v1.6</b>현재 버전</div><div><b>5일</b>첫 개발 기간</div><div><b>29건</b>GitHub 커밋</div></div>
<table class="tb tb3" style="margin-top:30px">
<tr><td>기술</td><td>PWA · Vercel 서버리스 · Google Gemini · Apify · Supabase(서울)</td></tr>
<tr><td>다음 목표</td><td>분석 정확도 평가 모드, 레시피 직접 수정, "결과가 이상해요" 재분석</td></tr>
<tr><td>개발 일지</td><td>날짜별 개발 과정은 이 계정의 게시물로 기록하고 있어요</td></tr>
</table>
<div class="next"><b>체험하기</b>reelcook.vercel.app · 안드로이드 크롬에서 열고 홈 화면에 추가<br><span style="font-size:22px;color:var(--sub)">개발 중인 데모 버전으로, 하루 분석 횟수가 제한될 수 있어요</span></div>
'''))
DAYS.insert(0, ('pin', dp))

# ───────────── render ─────────────
(BASE / 'out').mkdir(exist_ok=True)
out = ['<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>', CSS, '</style></head><body>']
ids = []
for day, cards in DAYS:
    n = len(cards)
    for i, (cls, body) in enumerate(cards, 1):
        cid = f'pin_{i:02d}' if day=='pin' else f'd{day}_{i:02d}'
        ids.append(cid)
        out.append(f'<section class="card {cls}" id="{cid}">{head(day, i, n)}{body}</section>')
out.append('</body></html>')
open(BASE / 'out' / 'cards.html', 'w').write('\n'.join(out))
open(BASE / 'out' / 'ids.txt', 'w').write('\n'.join(ids))
print(len(ids))
