# حضور لفيف — Lafeef Check-in (web, offline)

Event check-in for one phone: import the attendance Excel file, scan ticket QR codes, export the updated file.
Works on **iPhone and Android** in the browser, and **offline** once added to the home screen.
No server, no account, no data leaves the phone.

Live link (after GitHub Pages is turned on): **https://etechsy.github.io/qrcLA/**

---

## For the customer — دليل سريع

1. افتح الرابط في **Safari** على الآيفون (مرة واحدة مع اتصال بالإنترنت).
2. اضغط زر **المشاركة** ثم **إضافة إلى الشاشة الرئيسية**. افتح التطبيق دائماً من هذه الأيقونة؛ يعمل بعدها دون إنترنت.
3. **فعالية جديدة** ← **استيراد ملف Excel** واختر ملف ‎.xlsx‎ من تطبيق «الملفات».
4. **بدء المسح** واسمح باستخدام الكاميرا. أخضر = تم الحضور، كهرماني = التذكرة مستخدمة مسبقاً (يظهر الوقت الأصلي)، أحمر = التذكرة غير موجودة.
5. بعد الفعالية: **تصدير ملف Excel محدّث** ← **حفظ / مشاركة الملف** واحفظه في «الملفات» أو أرسله.

> **مهم:** البيانات محفوظة على هذا الهاتف فقط ولا توجد نسخة أخرى. صدّر الملف بعد كل فعالية، ولا تحذف أيقونة
> التطبيق أو بيانات Safari قبل التصدير. لا تستخدم التصفّح الخاص.

1. Open the link in **Safari** on the iPhone (once, while online).
2. Tap **Share → Add to Home Screen**. Always open it from that icon; it then works offline.
3. **New event → Import Excel file**, pick the .xlsx from the Files app.
4. **Start scanning** and allow the camera. Green = checked in, amber = ticket already used (original time
   shown), red = ticket not found.
5. After the event: **Export updated Excel → Save / share the file**, save it to Files or send it.

> **Important:** the records exist on this phone only. Export after every event, and don't delete the icon or
> Safari's website data before exporting. Don't use Private Browsing.

---

## Publishing it on GitHub Pages (one time)

1. In this repository: **Add file → Upload files**, drag in **everything inside the `qrcLA-upload` folder**
   (`index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, `README.md`, and the folders `css`, `js`, `img`,
   `fonts`, `vendor`) so that `index.html` sits at the top level of the repository, then **Commit changes**.
   Use Chrome, Edge or Firefox on a computer: they keep the sub-folders when you drag them in. If `.nojekyll`
   is hidden on your computer, skip it — the site works without it.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.**
3. After a minute or two, refresh that page: it shows *Your site is live at …*. That is the link to send.

The repository must be **public** for Pages on a free account. The code contains no guest data or secrets.
**Never upload an attendance Excel file to this repository** — it would become public.

### Updating later

Upload the changed files the same way, always including the new `sw.js` (it holds the version number that
tells phones to fetch the update). Phones pick up the new version the next time the app is opened online.

---

## How it works

- `js/core.js` — ticket rules, workbook validation, import carry-over, export rows, Arabic search (no DOM).
- `js/xlsx.js` — .xlsx reader/writer; every cell is kept as text so ticket and phone numbers keep leading zeros.
- `js/db.js` — IndexedDB storage. Each check-in reads and writes in one transaction, so the same ticket can
  only be checked in once; later scans return the original time.
- `js/app.js`, `js/i18n.js`, `css/app.css` — screens, Arabic/English text, Lafeef colours and IBM Plex fonts.
- `sw.js` — keeps every file on the phone for offline use (regenerate with `scripts/make-web-sw.py`).

Same rules as the Android app in the main project; they are tested against the same fixtures.

## Licences

- IBM Plex Sans / IBM Plex Sans Arabic — SIL Open Font License 1.1 (`fonts/*OFL.txt`)
- [fflate](https://github.com/101arrowz/fflate) 0.8.3 — MIT (`vendor/fflate.LICENSE.txt`)
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 — Apache-2.0 (`vendor/jsQR.LICENSE.txt`)
