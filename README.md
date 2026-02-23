# Gagayam Festival Tourism Site

<p align="center">
  <img src="public/assets/images/background.jpg" alt="Gagayam Festival visual banner" width="100%" />
</p>

<p align="center">
  Official Sabangan Tourism Office website for the Gagayam Trail Run experience.
</p>

## Introduction

<p align="center">
  <img src="public/assets/images/intro-img.jpg" alt="Introduction preview of the Gagayam Festival website" width="900" />
</p>

This repository contains the official Sabangan tourism microsite and an interactive map app for the Gagayam Festival trail run. It combines a static promotional page (`public/index.html`) with a Next.js application that renders a Leaflet map and loads KML trail data for route visualization.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Run the development server:

```bash
pnpm dev
```

3. Open `http://localhost:3000`.

## Production

1. Build:

```bash
pnpm build
```

2. Start:

```bash
pnpm start
```

## Project Snapshot

| Area | Details |
| --- | --- |
| Framework | [Next.js](https://nextjs.org/) + React |
| Mapping | `leaflet` + `leaflet-omnivore` |
| Route Source | `public/Gagayam Trail Run.kml` |
| Static Landing | `public/index.html` |
| Main Map Components | `components/Map.js`, `components/MapNoSSR.js`, `components/GagayamTrailLeafletMount.js` |

## Features

- Interactive trail map that visualizes KML route data.
- Client-only Leaflet rendering to avoid SSR and hydration issues.
- Organized assets under `public/assets` for easy content updates.
- Legacy static landing page retained for compatibility.

## Development Notes

- Leaflet requires the browser DOM. Use the same no-SSR pattern when adding map components.
- To update the trail, replace the KML file in `public/` and reload the app.

## License

See `LICENSE`.
