# PERF Baseline

Date: 2026-03-05
Scope: repo scan excluding `node_modules/` and `.git/`

## Top 40 files by size
```
    3,6 MB  kingshelp.db-wal
    3,2 MB  img\ai\gardening.jpg
    3,2 MB  img\ai\repairs.jpg
    3,0 MB  img\ai\other.jpg
    2,9 MB  img\ai\transport.jpg
    2,8 MB  img\ai\tutoring.jpg
    2,8 MB  img\ai\pets.jpg
    2,8 MB  img\ai\creative.jpg
    2,8 MB  img\ai\care.jpg
    2,7 MB  img\ai\packages.jpg
    2,7 MB  img\ai\errands.jpg
    2,7 MB  img\ai\tech.jpg
    2,6 MB  img\ai\cleaning.jpg
    2,4 MB  img\logoinicio.png
    2,2 MB  img\fondo3.png
    1,6 MB  img\ChatGPT Image 1 mar 2026, 23_09_14.png
    1,4 MB  kingshelp.db
  479,6 KB  img\KINGSHELP-LOGO.png
  479,6 KB  web\img\KINGSHELP-LOGO.png
  384,3 KB  mobile\assets\icon.png
  373,5 KB  assets\demo_poster.webp
  369,2 KB  web\img\LOGO_2.png
  369,2 KB  img\LOGO_2.png
  277,5 KB  mobile\package-lock.json
  229,7 KB  web\img\KINGSHELP.png
  229,7 KB  img\KINGSHELP.png
  214,1 KB  js\app.js
  169,0 KB  css\style.css
  159,9 KB  index.html
  146,0 KB  img\CORONAKH.png
  146,0 KB  web\img\CORONAKH.png
  140,3 KB  web\js\app.js
  127,9 KB  web\css\style.css
   80,4 KB  package-lock.json
   76,9 KB  mobile\assets\android-icon-foreground.png
   74,9 KB  css\hero.css
   71,8 KB  image.png
   38,4 KB  admin\index.html
   33,8 KB  css\demo.css
   33,8 KB  web\css\demo.css
```

## Size by top-level folder
```
   41,7 MB  img
    5,4 MB  [root]
    1,6 MB  web
  815,7 KB  mobile
  373,5 KB  assets
  343,1 KB  src
  277,7 KB  css
  268,7 KB  js
   38,4 KB  admin
   16,1 KB  legal
   12,7 KB  docs
     485 B  .claude
     146 B  .well-known
```

## Direct dependencies (npm ls --depth=0)
```
kingshelp-api@1.0.0 C:\Users\david\Desktop\Kingshelp
├── @sendgrid/mail@8.1.6
├── bcryptjs@2.4.3
├── better-sqlite3@9.6.0
├── cors@2.8.6
├── dotenv@16.6.1
├── express-rate-limit@8.2.1
├── express@4.22.1
├── helmet@8.1.0
├── jsonwebtoken@9.0.3
├── multer@2.1.0
├── nodemon@3.1.14
├── pg@8.19.0
├── pngjs@7.0.0
└── stripe@14.25.0
```

## How to start
- API (dev): `npm run dev`
- API (prod): `npm start`
- Web (static): `npx serve -p 5173 web`
