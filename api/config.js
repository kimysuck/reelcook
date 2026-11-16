// 앱에 공개해도 되는 설정만 전달 (Supabase 주소 + publishable 키 + 알림 공개 열쇠)
import { vapidPublic } from '../lib/push.js';
import { avgSec } from '../lib/stats.js';
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  const avg = await avgSec().catch(() => null);   // 최근 7일 실제 분석 시간 평균 → "보통 약 N분" (F-U4)
  res.status(200).json({ supabase: url && key ? { url, key } : null, push: vapidPublic(), avgSec: avg });
}
