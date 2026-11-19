# SPARKTACUS · Todd Marino

Consulting portfolio: https://www.sparktacus.io/

## Pages

- `/`: consulting homepage and showcase navigation.
- `/storage-consulting/`: Storage & Cloud Cost Optimization service showcase.
- `/storage-consulting/calculator/`: interactive storage and database cost lab,
  including English, German, and Arabic translations.

Static HTML, CSS, and JavaScript. No build step, account, analytics, or backend is
required. GitHub Pages publishes the root of `main`. `CNAME` preserves the custom
domain; `.nojekyll` serves these files directly.

## Preview and checks

From this repository:

```sh
python3 -m http.server 8001
node --test tests/calculator.test.cjs
python3 tests/check_site.py
```

Open http://localhost:8001/. Root-relative portfolio links require serving this
repository as the server root.

## Editing and adding showcases

Edit `index.html` for the homepage, `storage-consulting/index.html` for the service
page, and `assets/site.css` for shared portfolio styling. Add another showcase as
a folder with `index.html`; add its navigation link to each portfolio page and a
showcase entry on the homepage. Add a link to the project's source repository.

The calculator is a self-contained copy of the local `orders-storage-demo/docs/`
app, with portfolio return navigation added. Updates to that original demo need
to be copied here, preserving the portfolio links. Calculations are in `lab.js`
and `pricing.js`; translation JSON files live in `locales/`. i18next 25.6.3 and its
MIT license are bundled in `vendor/`. Language selection follows browser
preferences, with English fallback.

## Estimate scope

Pricing is a saved USD snapshot checked November 19, 2026, linked to official
provider sources in the calculator. Object-storage volume is annual CSV input;
retention is 1–14 years, default 7, and costs assume a full retention window.
Source database inputs are separate. RDS uses an editable Single-AZ PostgreSQL
example; Atlas uses an editable starting quote, not automatic capacity pricing.
No free tiers, credits, or taxes are deducted. Unentered request, retrieval,
transfer, minimum-duration, backup, replica, and migration charges are excluded.
The sample format comparison is based on synthetic orders, not client outcomes.
