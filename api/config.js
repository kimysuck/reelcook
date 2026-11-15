// 앱에 공개해도 되는 설정만 전달 (Supabase 주소 + publishable 키 + 알림 공개 열쇠)
import { vapidPublic } from '../lib/push.js';
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ supabase: url && key ? { url, key } : null, push: vapidPublic() });
}
