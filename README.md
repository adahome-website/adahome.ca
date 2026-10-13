# adahome.ca

Website of Ada Celik, REALTOR®, Century 21 Masters, Calgary.

- `docs/` is the live site, served by GitHub Pages at https://adahome.ca.
- `source/` holds the page designs (`.dc.html`) the site is built from, and `source/images/` the original images.
- `build/` holds the build scripts.

## Rebuild

```
node build/build.js source source/images docs-new   # with FORM_KEY=<Web3Forms key> in the environment
python3 build/extras.py docs-new                    # sitemap, robots.txt, llms.txt, 404, CNAME
```

Then optimize images into `docs-new/assets/img/`, check the result, and replace `docs/`.

Forms send to Ada's inbox through Web3Forms. Visits are counted with Cloudflare Web Analytics (no cookies).
