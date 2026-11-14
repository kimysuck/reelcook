# 테스트 공통: 현재 약관 버전(동의 화면을 건너뛰기 위해)
import re, os
_idx=open(os.path.join(os.path.dirname(__file__),'..','index.html'),encoding='utf-8').read()
TV=re.search(r"const TERMS_VERSION='([^']+)'", _idx).group(1)
