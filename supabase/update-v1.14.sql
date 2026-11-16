-- 릴쿡 v1.14: 배운 규칙 (한 번만 실행, 여러 번 실행해도 안전)
-- AI 채점·테스터 평가에서 틀린 것을 일반 규칙 한 문장으로 정리해 두고, 다음 분석부터 AI 지시문에 넣는다.
-- 사람 정보는 없다(규칙 문장, 공개 릴스 코드, 횟수만). 서버(비밀 키)만 읽고 쓴다.
create table if not exists public.analysis_lessons (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rule text not null check (char_length(rule) <= 200),  -- 일반 규칙 한 문장
  kind text,                                            -- ingredients · amounts · steps · method · other
  source text,                                          -- judge(AI 채점) · human(테스터 평가)
  first_code text, last_code text,                      -- 처음·마지막으로 이 실수가 나온 릴스 코드
  why text,                                             -- 학습 AI가 확인한 실수 내용
  model text,                                           -- 규칙을 만든 모델
  active boolean not null default true,                 -- 끄면 지시문에서 빠진다
  hits int not null default 1                           -- 같은 실수가 확인된 횟수
);
alter table public.analysis_lessons enable row level security;   -- 정책 없음 = 앱(로그인 이용자)은 못 읽고 서버만
