# 릴쿡 🍳 — 인스타 요리 릴스를 초보용 정밀 레시피로

안드로이드 크롬에 설치하는 PWA입니다. 인스타그램에서 **공유 → 릴쿡**을 누르면 레시피를 g·ml 단위로 정리해 줍니다.

## 구조
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 전체 (가져오기, 레시피, 쿠킹 모드, 내 레시피) |
| `manifest.webmanifest` | 앱 이름·아이콘·**공유 대상(share_target)** 등록 |
| `sw.js` | 서비스 워커: 공유받은 링크·사진·영상 수신, 오프라인 캐시 |
| `api/analyze.js` | Vercel 서버 함수: 앱 → Gemini 중계 (API 키 보호) |

## Vercel 환경변수
| 이름 | 필수 | 값 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google AI Studio에서 발급한 키 (`AIza…`) |
| `APP_PASSCODE` | 권장 | 아무 비밀번호. 앱 ⚙️ 설정에 같은 값 입력 |
| `GEMINI_MODEL` | 선택 | 기본 `gemini-3.8-flash` (실패 시 3.5-flash로 자동 전환) |
| `APIFY_TOKEN` | 자동 분석에 필요 | Apify API 토큰. 인스타가 Vercel 서버 IP를 막기 때문에 대행 서비스로 릴스 캡션·영상을 가져옴 |

환경변수를 바꾼 뒤에는 **Redeploy** 해야 반영됩니다.

## 진단
`/api/ig-test?pass=<APP_PASSCODE>&url=<릴스링크>` → 캡션·영상을 가져왔는지와 실패 원인(notes)을 보여줍니다.

## 단계
- [x] 1단계: PWA + 공유받기 + Gemini 분석 (영상은 장면 6장 추출)
- [ ] 2단계: 영상 전체(소리 포함) 분석
- [ ] 3단계: 구글 로그인 · 계정 저장 · 자랑 피드 (Supabase)
- [ ] 4단계: 다듬기 · 베타 배포
