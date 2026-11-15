// 분석 작업: 앱을 꺼도 서버가 분석을 끝까지 한다
//   POST /api/jobs                 → 작업 맡기기 {link, noCache, report, eval} (헤더 x-device: 기기 번호)
//   GET  /api/jobs?ids=a,b         → 내 작업 상태·결과 (멈춘 작업이 있으면 다시 시작시킴)
//   DELETE /api/jobs?ids=a,b       → 결과를 받았거나 취소한 작업 지우기
//   POST /api/jobs?step=<id>       → (서버끼리) 작업 한 단계 실행. x-job-key 필요
import { run, recordFailure } from './analyze.js';
import { verifyUser } from '../lib/auth.js';
import { isTester, whoOf } from '../lib/quota.js';
import { shortcodeOf } from '../lib/instagram.js';
import { sendPush, cleanSub } from '../lib/push.js';
import { jobsReady, ownerOf, jobKey, createJob, getJob, listJobs, patchJob, deleteJobs, countActive, countOpen, claimJob, kick, kickNext, STALE_MS, PAR, cleanupJobs, diagnose, canBg, background, sweep } from '../lib/jobs.js';

export const config = { maxDuration: 300 };
const MAX_OPEN = 25;   // 한 기기에서 동시에 맡길 수 있는 작업 수(평가 모드 20개 + 여유)

// 끝나면 알림: 보통 분석은 하나씩, 평가 모드는 이 기기의 평가 작업이 모두 끝났을 때 한 번만
async function notify(job, out) {
  const sub = job.body && job.body.push; if (!sub) return;
  if (job.prio === 1) {
    if (await countOpen(job.owner, 1) > 0) return;
    return sendPush(sub, { title: '평가 분석이 모두 끝났어요', body: '눌러서 결과를 확인하고 ✓/✗를 골라 주세요', url: '/?eval=1', tag: 'eval' });
  }
  let title = ''; try { const t = out.json && out.json.text; const j = t ? JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) : null; title = (j && j.recipes && j.recipes[0] && j.recipes[0].title) || ''; } catch {}
  const ok = out.status === 200 && title;
  return sendPush(sub, ok ? { title: `${title.slice(0, 40)} 레시피가 준비됐어요`, body: '눌러서 바로 보기', url: '/?job=1', tag: 'job-' + job.id }
    : { title: '레시피를 정리하지 못했어요', body: '눌러서 이유를 확인해 주세요', url: '/?job=1', tag: 'job-' + job.id });
}

async function step(id) {
  const job = await getJob(id);
  if (!job || job.status === 'done' || job.status === 'failed') return 'skip';
  if (job.status === 'queued' && await countActive(job.owner) >= PAR) return 'wait';   // 빈자리가 나면 kickNext가 다시 부른다
  const mine = await claimJob(id); if (!mine) return 'taken';
  // 실제 분석 시간(차례 기다림·앱을 닫아 둔 시간 제외)을 재기 위해 처음 시작한 시각을 남긴다
  const started = (job.body && job.body.startedAt) || Date.now();
  if (!(job.body && job.body.startedAt)) await patchJob(id, { body: { ...(job.body || {}), startedAt: started } });
  const t0 = Date.now(); let last = null, chain = Promise.resolve();
  const emit = ev => { if (ev && ev.stage && ev.stage !== last && ev.stage !== 'start') { last = ev.stage; chain = chain.then(() => patchJob(id, { stage: ev.stage })); } };
  const { startedAt: _s, ...b0 } = job.body || {};
  const body = { ...b0, stream: false };
  if (job.state) { delete body.report; Object.assign(body, { resume: job.state, hop: job.hop, fetched: true, noCache: true }); }
  let out;
  try { out = await run(body, emit, t0, null, { who: job.who, tester: job.tester }); }
  catch (e) { console.error(e); out = { status: 500, json: { error: 'server' } }; }
  await chain;
  if (out.json && out.json.continue) {
    // 시간이 모자람 → 상태를 저장하고 다음 단계를 스스로 부른다
    await patchJob(id, { status: 'queued', state: out.json.resume, hop: out.json.hop, stage: 'continue' });
    await kick(id);
    return 'continue';
  }
  await recordFailure(body, out, t0);
  const sec = Math.round((Date.now() - started) / 1000), wait = Math.max(0, Math.round((started - Date.parse(job.created_at)) / 1000));
  await patchJob(id, { status: out.status === 200 ? 'done' : 'failed', stage: 'done', state: null, result: { status: out.status, ...out.json, sec, wait } });
  await notify(job, out).catch(() => {});
  await kickNext(job.owner);
  return 'done';
}

export default async function handler(req, res) {
  const q0 = req.query || {};
  // 안전망: 누구나 불러도 되는 일(멈춘 작업만 다시 시작)이라 비밀번호 없이. Supabase 예약 작업(pg_cron)이 1분마다 부른다.
  if (q0.sweep) { if (!jobsReady()) return res.status(501).json({ error: 'no_jobs' }); const n = await sweep(); return res.status(200).json({ owners: n }); }
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  if (!jobsReady()) return res.status(501).json({ error: 'no_jobs' });   // 앱은 예전 방식(직접 분석)으로 한다
  const q = req.query || {};

  // 점검(설정 > AI 사용량): 작업 표·자기 호출이 되는지
  if (q.diag) return res.status(200).json(await diagnose());
  if (q.ping) return res.status(req.headers['x-job-key'] === jobKey() ? 200 : 403).json({ ok: req.headers['x-job-key'] === jobKey() });

  // 서버끼리: 한 단계 실행 (끝까지 실행한 뒤 응답 — 응답 뒤에는 서버가 멈출 수 있어서)
  if (q.step) {
    if (req.headers['x-job-key'] !== jobKey()) return res.status(403).json({ error: 'key' });
    const p = step(String(q.step)).catch(e => { console.error(e); return 'error'; });
    if (canBg()) { background(p); return res.status(202).json({ r: 'started' }); }   // 바로 답하고 분석은 끝까지 계속
    return res.status(200).json({ r: await p });   // waitUntil이 없는 환경: 끝까지 실행한 뒤 응답
  }

  const owner = ownerOf(req.headers['x-device']);
  if (!owner) return res.status(400).json({ error: 'device' });
  const ids = String(q.ids || '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);

  if (req.method === 'POST' && !q.testpush) {
    const b = req.body || {};
    const link = String(b.link || '').slice(0, 500);
    if (!shortcodeOf(link)) return res.status(400).json({ error: 'link' });
    if (await countOpen(owner) >= MAX_OPEN) return res.status(429).json({ error: 'too_many_jobs' });
    const user = req.headers.authorization ? await verifyUser(req).catch(() => null) : null;
    const push = cleanSub(b.push);   // 끝나면 알림 받을 주소(알림을 켠 경우만)
    const body = { link, caption: String(b.caption || '').slice(0, 8000), noCache: !!b.noCache, fromVideo: false, ...(b.report ? { report: String(b.report).slice(0, 20) } : {}), ...(push ? { push } : {}) };
    const job = await createJob({ owner, who: whoOf(req, user), tester: isTester(user), prio: b.eval ? 1 : 0, link, body, status: 'queued', stage: 'queued' });
    if (!job) return res.status(503).json({ error: 'no_jobs' });
    if (Math.random() < 0.05) cleanupJobs();
    await kickNext(owner);
    return res.status(200).json({ id: job.id });
  }

  if (req.method === 'DELETE') { await deleteJobs(owner, ids); return res.status(200).json({ ok: true }); }

  // 알림 시험: 지금 이 폰으로 알림을 하나 보낸다 (설정 > 알림 시험)
  if (req.method === 'POST' && q.testpush) {
    const status = await sendPush((req.body || {}).push, { title: '릴쿡 알림 시험', body: '이 알림이 보이면 분석 완료 알림도 와요', url: '/', tag: 'test', test: true });
    return res.status(200).json({ status });
  }

  // 이미 맡긴 작업에 알림 켜기/끄기 (분석 중에 "끝나면 알림 받기"를 누른 경우)
  if (req.method === 'PATCH') {
    const push = cleanSub((req.body || {}).push);
    for (const j of await listJobs(owner, ids)) {
      if (j.status === 'done' || j.status === 'failed') continue;
      const full = await getJob(j.id); if (!full) continue;
      const { push: _p, ...rest } = full.body || {};
      await patchJob(j.id, { body: push ? { ...rest, push } : rest });
    }
    return res.status(200).json({ ok: true });
  }

  // GET: 상태 확인. 멈춰 보이는 작업(서버가 꺼졌거나 다음 단계 호출이 끊김)은 다시 시작시킨다
  const rows = await listJobs(owner, ids);
  const now = Date.now();
  const stuck = rows.filter(j => (j.status === 'queued' && now - Date.parse(j.updated_at) > 20_000) || (j.status === 'running' && now - Date.parse(j.updated_at) > STALE_MS));
  if (stuck.length) await kickNext(owner);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ jobs: rows.map(j => ({ id: j.id, link: j.link, status: j.status, stage: j.stage, hop: j.hop, at: j.created_at, result: j.status === 'done' || j.status === 'failed' ? j.result : null })),
    missing: ids.filter(id => !rows.some(j => j.id === id)) });
}
