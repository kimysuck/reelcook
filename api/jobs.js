// 분석 작업: 앱을 꺼도 서버가 분석을 끝까지 한다
//   POST /api/jobs                 → 작업 맡기기 {link, noCache, report, eval} (헤더 x-device: 기기 번호)
//   GET  /api/jobs?ids=a,b         → 내 작업 상태·결과 (멈춘 작업이 있으면 다시 시작시킴)
//   DELETE /api/jobs?ids=a,b       → 결과를 받았거나 취소한 작업 지우기
//   POST /api/jobs?step=<id>       → (서버끼리) 작업 한 단계 실행. x-job-key 필요
import { run, recordFailure } from './analyze.js';
import { verifyUser } from '../lib/auth.js';
import { isTester, whoOf } from '../lib/quota.js';
import { shortcodeOf } from '../lib/instagram.js';
import { jobsReady, ownerOf, jobKey, createJob, getJob, listJobs, patchJob, deleteJobs, countActive, countOpen, claimJob, kick, kickNext, STALE_MS, PAR, cleanupJobs, diagnose } from '../lib/jobs.js';

export const config = { maxDuration: 300 };
const MAX_OPEN = 25;   // 한 기기에서 동시에 맡길 수 있는 작업 수(평가 모드 20개 + 여유)

async function step(id) {
  const job = await getJob(id);
  if (!job || job.status === 'done' || job.status === 'failed') return 'skip';
  if (job.status === 'queued' && await countActive(job.owner) >= PAR) return 'wait';   // 빈자리가 나면 kickNext가 다시 부른다
  const mine = await claimJob(id); if (!mine) return 'taken';
  const t0 = Date.now(); let last = null, chain = Promise.resolve();
  const emit = ev => { if (ev && ev.stage && ev.stage !== last && ev.stage !== 'start') { last = ev.stage; chain = chain.then(() => patchJob(id, { stage: ev.stage })); } };
  const body = { ...(job.body || {}), stream: false };
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
  await patchJob(id, { status: out.status === 200 ? 'done' : 'failed', stage: 'done', state: null, result: { status: out.status, ...out.json } });
  await kickNext(job.owner);
  return 'done';
}

export default async function handler(req, res) {
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
    const r = await step(String(q.step)).catch(e => { console.error(e); return 'error'; });
    return res.status(200).json({ r });
  }

  const owner = ownerOf(req.headers['x-device']);
  if (!owner) return res.status(400).json({ error: 'device' });
  const ids = String(q.ids || '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);

  if (req.method === 'POST') {
    const b = req.body || {};
    const link = String(b.link || '').slice(0, 500);
    if (!shortcodeOf(link)) return res.status(400).json({ error: 'link' });
    if (await countOpen(owner) >= MAX_OPEN) return res.status(429).json({ error: 'too_many_jobs' });
    const user = req.headers.authorization ? await verifyUser(req).catch(() => null) : null;
    const body = { link, caption: String(b.caption || '').slice(0, 8000), noCache: !!b.noCache, fromVideo: false, ...(b.report ? { report: String(b.report).slice(0, 20) } : {}) };
    const job = await createJob({ owner, who: whoOf(req, user), tester: isTester(user), prio: b.eval ? 1 : 0, link, body, status: 'queued', stage: 'queued' });
    if (!job) return res.status(503).json({ error: 'no_jobs' });
    if (Math.random() < 0.05) cleanupJobs();
    await kickNext(owner);
    return res.status(200).json({ id: job.id });
  }

  if (req.method === 'DELETE') { await deleteJobs(owner, ids); return res.status(200).json({ ok: true }); }

  // GET: 상태 확인. 멈춰 보이는 작업(서버가 꺼졌거나 다음 단계 호출이 끊김)은 다시 시작시킨다
  const rows = await listJobs(owner, ids);
  const now = Date.now();
  const stuck = rows.filter(j => (j.status === 'queued' && now - Date.parse(j.updated_at) > 20_000) || (j.status === 'running' && now - Date.parse(j.updated_at) > STALE_MS));
  if (stuck.length) await kickNext(owner);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ jobs: rows.map(j => ({ id: j.id, link: j.link, status: j.status, stage: j.stage, hop: j.hop, at: j.created_at, result: j.status === 'done' || j.status === 'failed' ? j.result : null })),
    missing: ids.filter(id => !rows.some(j => j.id === id)) });
}
