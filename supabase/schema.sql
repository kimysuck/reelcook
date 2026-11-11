-- 릴쿡 DB 설정
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run (한 번만)

-- ① 프로필: 구글 로그인하면 이름·사진이 자동으로 들어감
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "프로필 누구나 보기" on public.profiles;
create policy "프로필 누구나 보기" on public.profiles for select using (true);
drop policy if exists "내 프로필 수정" on public.profiles;
create policy "내 프로필 수정" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '요리하는 사람'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ② 내 레시피 (본인만 보고 수정)
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  reel_code text,
  recipe jsonb not null,
  created_at timestamptz default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);
alter table public.recipes enable row level security;
drop policy if exists "내 레시피" on public.recipes;
create policy "내 레시피" on public.recipes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ③ 분석 결과 캐시 (서버만 읽고 씀 — 정책 없음 = 앱에서는 접근 불가)
create table if not exists public.reel_cache (
  code text primary key,
  recipe jsonb not null,
  source jsonb,
  video_url text,
  model text,
  hits int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.reel_cache enable row level security;

-- ④ 자랑 피드 (로그인한 사람은 모두 보기, 글은 본인만 쓰고 지움)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text check (char_length(body) <= 500),
  taste smallint default 0 check (taste between 0 and 5),
  photo_path text,
  recipe jsonb,
  created_at timestamptz default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
alter table public.posts enable row level security;
drop policy if exists "피드 보기" on public.posts;
create policy "피드 보기" on public.posts for select to authenticated using (true);
drop policy if exists "내 글 쓰기" on public.posts;
create policy "내 글 쓰기" on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "내 글 지우기" on public.posts;
create policy "내 글 지우기" on public.posts for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.likes (
  post_id uuid references public.posts on delete cascade,
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.likes enable row level security;
drop policy if exists "하트 보기" on public.likes;
create policy "하트 보기" on public.likes for select to authenticated using (true);
drop policy if exists "내 하트 누르기" on public.likes;
create policy "내 하트 누르기" on public.likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "내 하트 취소" on public.likes;
create policy "내 하트 취소" on public.likes for delete to authenticated using (auth.uid() = user_id);

-- ⑤ 사진 저장소: 누구나 볼 수 있고, 본인 폴더에만 올리고 지움
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "사진 올리기" on storage.objects;
create policy "사진 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "사진 지우기" on storage.objects;
create policy "사진 지우기" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
