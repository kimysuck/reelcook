# 테스트 공통: 현재 약관 버전(동의 화면을 건너뛰기 위해)
import re, os
_idx=open(os.path.join(os.path.dirname(__file__),'..','index.html'),encoding='utf-8').read()
TV=re.search(r"const TERMS_VERSION='([^']+)'", _idx).group(1)

# Claude Code 클라우드 환경에는 크롬이 깔려 있고 CHROME_PATH가 설정돼 있다 → 그 크롬으로 테스트 (Playwright 브라우저 다운로드 불필요)
def L():
    p=os.environ.get('CHROME_PATH') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
    return {'executable_path': p} if p else {}
