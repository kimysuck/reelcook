-- 2026-11-15 Supabase 점검 경고 반영 (여러 번 실행해도 안전)
-- 1) 회원가입 함수를 외부(/rest/v1/rpc)에서 직접 호출하지 못하게. 회원가입 시 자동 실행(트리거)은 그대로 동작한다.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
-- 2) 피드 조회 속도용 인덱스
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists posts_user_id_idx on public.posts (user_id);
