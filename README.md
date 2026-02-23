```markdown
# Sabangan Tourism Site (Next.js)

This repository contains the source code for the official Sabangan tourism microsite and a small interactive web app built for the GAGAYAM Festival trail run. The project was created to showcase the event, provide an attractive landing page for participants and visitors, and offer an interactive trail map that loads KML route data for visualization. The codebase is deliberately small and pragmatic — it combines a static promotional page (kept under `public/index.html`) with a modern Next.js (App Router) React application that mounts a Leaflet map for client-side, interactive mapping.

The target audience for this project includes event organizers who need a lightweight registration and route-visualization site, developers who want a simple example of integrating KML with Leaflet in a Next.js app, and content editors who will update assets and route data stored in `public/assets`.

## Run locally
1. Install dependencies:

```bash
pnpm install
```

2. Start the development server:

```bash
pnpm dev
```

3. Open `http://localhost:3000` in your browser.

## Build for production
1. Build the production assets:

```bash
pnpm build
```

2. Start the production server:

```bash
pnpm start
```

Notes:
- If you see hydration or map-mounting warnings in development, the project relies on client-only mounting for Leaflet — see `MapNoSSR.js` and `GagayamTrailLeafletMount.js` for the pattern used to avoid server-side rendering issues.

## What is included
- **Framework**: [Next.js](https://nextjs.org/) (App Router) — provides routing, server rendering and static rendering where useful.
- **Programming Language**: JavaScript (ES6+) with React/JSX.
- **Package Manager**: `pnpm` for fast installs and deterministic node_modules layout.

### Dependencies (high level)
- `next`, `react`, `react-dom` — core React + Next runtime.
- `leaflet` — client-side map rendering library used to display the trail.
- `leaflet-omnivore` — helper to load KML/GPX/KMZ files into Leaflet layers.

Exact package names and versions are available in `package.json` — check that file for pinned versions and any additional utilities (CSS tooling, image libraries, etc.).

### Key Features & Behavior
- Interactive Leaflet map at `/` that visualizes the KML trail (`public/Gagayam Trail Run.kml`).
- Client-only map mount pattern to avoid SSR issues: map components live in `components/` and are wrapped so they only render in the browser.
- A static legacy landing page remains at `public/index.html` for backward compatibility or offline hosting.
- Global styling in `app/globals.css` and a legacy stylesheet at `public/css/styles.css`.
- Assets (images, videos, data) are organized under `public/assets` and `app/assets` for easy editing and deployment.

### Architecture / File highlights
- `app/` — Next.js App Router entry points and global styles. Routes and page-level code live here.
- `components/Map.js` — primary map UI component (client-side interactive map).
- `components/MapNoSSR.js` — wrapper to disable SSR for Leaflet mounts.
- `components/GagayamTrailLeafletMount.js` — KML loading + map initialization logic.
- `public/Gagayam Trail Run.kml` — canonical KML source used by the map.
- `public/index.html` — original static tourism page preserved for reference or static hosting.

### Development notes
- The mapping code intentionally avoids server-side rendering because Leaflet requires the DOM. Use the `MapNoSSR` pattern if you add new map-related components.
- When updating route data, replace the KML file in `public/` and the map will load the updated geometry on the next page refresh.
- For styling, the project uses plain CSS files; if `tailwindcss` or `postcss` appear in `package.json`, those are optional build-time tools — follow the package.json scripts for details.

## Contributing / Extending
- To add a new trail or route: add a KML file to `public/assets/data/`, then update the map mount to point to that file or add a UI selector for multiple tracks.
- To add registration forms or backend features: consider adding an API route under `app/api` (Next.js) or integrating with a serverless function provider.

## License & Credits
- See `LICENSE` for license details.

You can run the project locally with `pnpm install` followed by `pnpm dev` and access it at http://localhost:3000.

```