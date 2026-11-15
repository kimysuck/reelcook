-- 릴쿡 v1.9: 안전망 — 1분마다 "멈춘 분석 작업"을 다시 시작시킨다 (한 번만 실행)
-- 앱을 꺼 둔 상태에서 서버의 다음 단계 호출이 끊겨도, 1분 안에 이어서 분석하고 알림을 보낸다.
-- Supabase가 릴쿡 서버 주소를 1분마다 한 번 부를 뿐, 개인정보는 오가지 않는다.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'reelcook-sweep';
select cron.schedule('reelcook-sweep', '* * * * *',
  $$ select net.http_post(url := 'https://reelcook.vercel.app/api/jobs?sweep=1', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb) $$);
