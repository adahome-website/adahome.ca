# adahome.ca

Website of Ada Celik, REALTOR®, Century 21 Masters, Calgary.

- `docs/` is the live site, served by GitHub Pages at https://adahome.ca.
- `source/` holds the page designs (`.dc.html`) the site is built from, and `source/images/` the original images.
- `build/` holds the build scripts.

## Update the live site

1. Copy the updated `.dc.html` files from the design canvas into `source/`: English, French (`-fr`) and Turkish (`-tr`), plus SiteHeader and SiteFooter. French pages build to `/fr/…` and Turkish to `/tr/…`.
2. Save any new images they reference (`/_blob/<id>`) into `source/images/<id>.jpg` or `.png`.
3. Run `bash build/release.sh` from the repository root. It rebuilds `docs/` (pages, sitemap, robots.txt, llms.txt, 404, images) and stops if anything looks wrong.
4. Review `git diff --stat`, commit and push to `main`. GitHub Pages publishes within a minute or two.

Forms send to Ada's inbox through Web3Forms. Visits are counted with Cloudflare Web Analytics (no cookies); its token is set in `build/release.sh`.
