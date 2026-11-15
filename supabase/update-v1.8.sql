-- 릴쿡 v1.8: 앱을 꺼도 서버가 분석을 이어서 하기 위한 "분석 작업" 표 (한 번만 실행)
-- 서버(비밀 키)만 읽고 쓴다. 정책이 없으니 앱(로그인 사용자)은 직접 접근할 수 없다.
-- 결과를 앱이 받아 가면 바로 지우고, 남은 것도 3일 뒤 서버가 지운다.

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner text not null,          -- 'd:기기 무작위 번호의 해시' (이 폰에서 맡긴 작업만 이 폰이 본다)
  who text,                     -- 하루 횟수 제한용 ('u:계정ID' 또는 'ip:해시')
  tester boolean not null default false,
  prio int not null default 0,  -- 0 보통 분석, 1 평가 모드 (보통 분석을 먼저)
  link text,
  body jsonb,                   -- 분석 요청(링크, 다시 분석 여부)
  status text not null default 'queued',   -- queued | running | done | failed
  stage text,                   -- 지금 단계(릴스 정보, 영상 받기, AI 분석 …)
  hop int not null default 0,   -- 이어서 분석한 횟수
  state jsonb,                  -- 이어서 분석할 때 넘길 상태 (끝나면 지움)
  result jsonb                  -- 분석 결과 (앱이 받아 가면 행째 지움)
);
create index if not exists analysis_jobs_owner_idx on public.analysis_jobs (owner, created_at desc);
create index if not exists analysis_jobs_status_idx on public.analysis_jobs (status, prio, created_at);
alter table public.analysis_jobs enable row level security;
