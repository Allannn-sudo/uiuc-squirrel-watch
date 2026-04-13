# 🐿️ UIUC Squirrel Watch

> 校园松鼠活动预测小网站 — UIUC campus squirrel activity predictor

A fun weather-aware web app that tells you how likely you are to spot squirrels around UIUC campus right now, based on real-time weather, sunrise/sunset data, and historical iNaturalist sightings.

**Live demo:** https://www.perplexity.ai/computer/a/uiuc-squirrel-watch-cxyQnEWDQBytRVvLRb.Bcg

![UIUC Squirrel Watch Screenshot](https://i.imgur.com/placeholder.png)

---

## Features

- **Real-time probability gauge** — composite score from temperature, wind, time-of-day, precipitation, and location
- **5 campus locations** — Main Quad, Bardeen Quad, Illini Union, Siebel Center, Lincoln Hall
- **Time slot filter** — 6 slots from dawn to night, auto-initialized to current time
- **Manual weather override** — sliders to simulate "what if" conditions
- **Location comparison** — side-by-side probability bars for all 5 spots
- **Hourly activity chart** — 24-bar temperature trend with day/night/peak color coding
- **iNaturalist data** — research-grade *Sciurus carolinensis* sightings within 300m of each location (past year)
- **Dark mode** — system preference + manual toggle

## Data Sources

| Source | What it provides | API key needed |
|--------|-----------------|----------------|
| [Open-Meteo](https://open-meteo.com) | Temperature, wind speed, weather code, hourly forecast | ❌ Free |
| [SunriseSunset.io](https://sunrisesunset.io) | Sunrise, sunset, golden hour times | ❌ Free |
| [iNaturalist](https://api.inaturalist.org) | Historical squirrel observation counts near each location | ❌ Free |

## Probability Algorithm

The score (0–97%) is computed from six weighted factors:

```
base = 50
+ temperature comfort   (8–22°C optimal: +18, too cold: -20, too hot: -12)
+ wind speed            (< 8 mph: +12, > 20 mph: -15)
+ time of day           (peak slots: +15, night: -25)
+ golden hour bonus     (within 1.5h of sunrise/sunset: +10)
+ precipitation risk    (> 60%: -18, 30–60%: -8)
+ location modifier     (Quad canopy: +8, Illini Union food: +6, Siebel dense: -4)
+ iNat historical data  (> 20 sightings: +8, > 5: +4)
```

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS v3 + shadcn/ui
- **State:** TanStack Query v5
- **Routing:** Wouter (hash-based for static deploy)
- **Backend:** Express (serves static files only in production)
- **Build:** esbuild via tsx

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server (http://localhost:5000)
npm run dev

# Build for production
npm run build
```

No environment variables or API keys required — all three data sources are free and keyless.

## Deploy

The built output is a static site in `dist/public/`. Deploy to any static host (Netlify, Vercel, GitHub Pages, S3):

```bash
npm run build
# deploy dist/public/
```

## Campus Locations

| Location | Coordinates | Notes |
|----------|-------------|-------|
| Main Quad | 40.1072, -88.2272 | Oak & elm canopy, highest squirrel density |
| Bardeen Quad | 40.1146, -88.2284 | Near ECEB, calmer population |
| Illini Union | 40.1095, -88.2271 | Food scraps = reliable sightings |
| Siebel Center | 40.1138, -88.2249 | Dense building area, lower activity |
| Lincoln Hall | 40.1069, -88.2295 | Shaded lawn, consistent sightings |

---

Made for fun at UIUC 🌳
