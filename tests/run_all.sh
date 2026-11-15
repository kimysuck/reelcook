#!/usr/bin/env bash
# 릴쿡 자동 테스트 전부 실행: 가짜 서버(인스타·Gemini·Supabase 흉내)를 테스트마다 새로 띄운다
cd "$(dirname "$0")"
[ -d ../node_modules/@vercel/functions ] || (cd .. && npm install --silent --no-audit --no-fund)   # 서버 코드가 쓰는 패키지
PASS=0; FAIL=0
for t in e2e_full consent_theme share_before_consent multi_quota_ui video_guide guide_order back_resume video_only daily_limit stage2 long_video step_text background push share_race; do
  pkill -f mock-server.mjs 2>/dev/null; (command -v fuser >/dev/null && fuser -k 8788/tcp >/dev/null 2>&1); sleep 0.4
  node mock-server.mjs > /tmp/mock.log 2>&1 & sleep 1.2
  out=$(timeout 300 python3 $t.py 2>&1)
  if echo "$out" | grep -qE "errors:? \[\]" && ! echo "$out" | grep -q "Traceback"; then echo "✅ $t"; PASS=$((PASS+1)); else echo "❌ $t"; echo "$out" | tail -5; FAIL=$((FAIL+1)); fi
done
pkill -f mock-server.mjs 2>/dev/null
echo "통과 $PASS / 실패 $FAIL"
[ $FAIL -eq 0 ]
