# 카드 HTML을 1080×1350 JPG로 저장한다. 사용: python3 devlog/build.py && python3 devlog/shot.py [접두어...]
# 예) python3 devlog/shot.py d6   → Day 6 카드만
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE = Path(__file__).resolve().parent
OUT = BASE / 'out'
ids = (OUT / 'ids.txt').read_text().split()
pre = sys.argv[1:]
if pre: ids = [i for i in ids if any(i.startswith(p) for p in pre)]
with sync_playwright() as p:
    kw = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
    b = p.chromium.launch(**kw, args=['--allow-file-access-from-files'])
    pg = b.new_page(viewport={'width': 1080, 'height': 1350})
    pg.goto((OUT / 'cards.html').as_uri()); pg.wait_for_timeout(800)
    for cid in ids:
        pg.locator('#' + cid).screenshot(path=str(OUT / f'{cid}.jpg'), type='jpeg', quality=92)
        print(OUT / f'{cid}.jpg')
    b.close()
