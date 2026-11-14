# 릴쿡 자동 테스트

진짜 인스타·Gemini·Supabase 대신 **가짜 서버**(`mock-server.mjs`)를 띄우고, 브라우저(Playwright)로 앱을 실제처럼 눌러 보는 테스트예요.
API 키 없이 돌아가고, 무료 AI 사용량도 쓰지 않아요.

## 실행
```bash
pip install playwright        # 처음 한 번
playwright install chromium   # 크롬이 없는 컴퓨터에서만 (Claude Code 클라우드 환경은 크롬이 이미 있어서 생략)
bash tests/run_all.sh
```

## 테스트 목록
| 파일 | 확인하는 것 |
|---|---|
| e2e_full | 공유 → 분석 → 레시피 → 저장 → 로그인·프로필 → 피드(사진 검토·모자이크·나쁜 글 차단) |
| consent_theme | 시작 애니메이션, 약관 동의 화면, 밝게·다크 테마 |
| share_before_consent | 동의 전에 공유하면 동의 후 이어서 분석 |
| multi_quota_ui | 모델 붐빔 → 다른 모델로 전환, 레시피 여러 개, 요리 아님, 하루 무료 한도 안내, AI 사용량 화면 |
| video_guide | 분석 중 영상 미리 받기, 완성 장면 표지, 전체 화면 영상 가이드, 표지 바꾸기 |
| guide_order | 영상 가이드 단계가 순서대로만 넘어가는지, 오프닝 표시 |
| back_resume | 안드로이드 뒤로가기 단계별 동작, 다시 켰을 때 보던 화면 이어서 열기 |
| video_only | 캡션 없는 릴스 2단계 분석(장면 기록 → 레시피), 요리 아님 판정과 원인 코드 |
| daily_limit | 하루 10회 제한, 테스터 예외, 남은 횟수 안내 |
| stage2 | "결과가 이상해요"(이유 기록·다시 분석·저장본 바꾸기), 저장한 레시피 직접 수정, 평가 모드(일괄 분석·✓/✗·요약 복사·다시 켜도 유지) |

## 가짜 서버 조종
`http://localhost:8788/__set?script=503,ok` 처럼 Gemini가 다음에 돌려줄 답을 정할 수 있어요
(`503` 붐빔, `429m` 분당 한도, `429d` 하루 한도, `ok`, `multi`, `notfood`, `empty`, `scanlog`, `scannot`, `pasta`, `jumble`, `cover`).
`fill=10` 오늘 쓴 횟수, `email=` 로그인 이메일, `mode=silent` 캡션 없는 릴스.
