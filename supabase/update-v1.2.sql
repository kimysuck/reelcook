-- 릴쿡 v1.2: 약관 동의 기록 (한 번만 실행)
-- 본인만 볼 수 있고, 쓰기는 서버(비밀 키)만 한다. 탈퇴하면 함께 지워진다.
create table if not exists public.consents (
  user_id uuid primary key references public.profiles on delete cascade,
  terms_version text not null,
  agreed_at timestamptz not null default now()
);
alter table public.consents enable row level security;
drop policy if exists "내 동의 기록 보기" on public.consents;
create policy "내 동의 기록 보기" on public.consents for select to authenticated using (user_id = auth.uid());

-- 이미 올라간 레시피 공유 글에서 원작자 캡션·댓글·장면 사진 빼기 (원본 링크만 남김)
update public.posts
set recipe = (recipe - 'cover') || jsonb_build_object('source',
  case when recipe->'source'->>'link' is not null then jsonb_build_object('link', recipe->'source'->>'link') else '{}'::jsonb end)
where recipe is not null;
