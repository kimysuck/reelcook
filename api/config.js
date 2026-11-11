// 앱에 공개해도 되는 설정만 전달 (Supabase 주소 + publishable 키)
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ supabase: url && key ? { url, key } : null });
}
