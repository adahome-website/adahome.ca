#!/usr/bin/env bash
# Rebuilds the live site in docs/ from source/. Run from the repository root:
#   bash build/release.sh
# Before running: copy the updated English .dc.html files into source/, and save any
# new images they reference (/_blob/<id>) into source/images/<id>.jpg or .png.
set -euo pipefail
cd "$(dirname "$0")/.."

# Web3Forms access key. It is public by design (it ships in every page's HTML).
export FORM_KEY="${FORM_KEY:-50a8d043-6c60-478b-9ce7-25ecadeb6a6b}"

rm -rf docs-new
node build/build.js source source/images docs-new
python3 build/extras.py docs-new

# Images: resize to 1600px max and recompress; fall back to plain copies if Pillow is missing.
mkdir -p docs-new/assets/img
python3 - <<'PY'
import os, shutil
src, out = 'source/images', 'docs-new/assets/img'
try:
    from PIL import Image
except ImportError:
    Image = None
for f in sorted(os.listdir(src)):
    a, b = os.path.join(src, f), os.path.join(out, f)
    done = os.path.join('docs/assets/img', f)
    if os.path.exists(done):  # already optimized in an earlier release
        shutil.copy2(done, b); continue
    if Image is None:
        shutil.copy2(a, b); continue
    im = Image.open(a)
    if max(im.size) > 1600:
        im.thumbnail((1600, 1600))
    if f.endswith('.jpg'):
        im.convert('RGB').save(b, 'JPEG', quality=82, optimize=True, progressive=True)
    else:
        im.save(b, optimize=True)
print('images:', len(os.listdir(out)))
PY

# Icons are made once and carried over.
cp docs/favicon.png docs/apple-touch-icon.png docs-new/

# Sanity checks before swapping.
for p in index.html about/index.html listings/index.html market-stats/index.html calculators/index.html; do
  test -s "docs-new/$p" || { echo "missing $p"; exit 1; }
  grep -q 'id="dc-root"' "docs-new/$p" || { echo "bad $p"; exit 1; }
done
grep -q "$FORM_KEY" docs-new/index.html || { echo "form key missing"; exit 1; }

rm -rf docs && mv docs-new docs
echo "docs/ rebuilt. Review with: git status && git diff --stat"
