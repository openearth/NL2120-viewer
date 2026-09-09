# Config-driven Map Viewer

A **Vue 3** map application shell: interactive **Mapbox GL** map + optional **step-by-step sidebar**, driven almost entirely by **JSON configuration**.

The same shared codebase powers different products (for example [LARE Viewer](https://github.com/openearth/lare-viewer) and [NL2120 Viewer](https://github.com/openearth/NL2120-viewer)). What changes between deployments is mainly:

- `src/config/workflow.json` — UI steps, components, processes, dialogs
- `src/config/base-layers-config.json` — layer sources and styling
- `public/` assets (logo, favicon)
- `.env` / Mapbox & service URLs
- `src/lib/constant.js` — default map center and zoom

**Design idea:** enable or disable features by editing config (and optionally dropping in a new Vue component), not by rewriting the app shell.

---

## Features

- Interactive Mapbox GL map (WMS / WMTS raster and vector tiles)
- Config-driven wizard steps with Confirm / Continue flows
- Optional OGC API Processes (JSON execute) with dynamic layer add/remove
- Layer toggles, legends (WMS image or category swatches), feature info, related geometry, attribute filters
- Optional markdown info dialog
- Vuetify 3 UI, Pinia state, Vite tooling

| Piece | Role |
|--------|------|
| `workflow.json` | Steps, components, confirmations, processes, info dialog, legend layout |
| `base-layers-config.json` | Layer URLs, paint, legends, category styles |
| Pinia `app` / `map` | Selections, process results, visibility, filters, clicked feature |
| `src/lib/ogc-process/` | Resolve inputs → execute → output actions |
| `src/components/` | Pluggable UI blocks loaded by **filename** |

---

## Prerequisites

- **Node.js** 20+ recommended (see `package.json` `engines` if present) and **npm**
- A **Mapbox access token** ([Mapbox account](https://account.mapbox.com/))
- **GeoServer** (or compatible WMS/WMTS/WFS) for map layers you configure
- An **OGC API Processes** server only if your workflow runs processes (e.g. [LARE](https://github.com/DesirMED/LARE) / pygeoapi)

---

## Quick start

```bash
git clone <this-repository-url>
cd <repository-folder>
npm install
```

### Environment

Create a `.env` in the project root. Vite only exposes variables prefixed with `VITE_`.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_MAPBOX_TOKEN` | **Yes** | Mapbox public token |
| `VITE_OGC_API_URL` | If you use processes | OGC API base URL (no trailing slash), e.g. `http://localhost:5000` |
| `VITE_WPS_BASE_URL` | Fallback | Used only if `VITE_OGC_API_URL` is unset |
| `VITE_GEOSERVER_PUBLIC_BASE_URL` | Optional | Browser-reachable GeoServer base when JSON URLs use Docker/internal hosts |

```env
VITE_MAPBOX_TOKEN=pk.ey...
VITE_OGC_API_URL=http://localhost:5000
# VITE_GEOSERVER_PUBLIC_BASE_URL=http://localhost:8080/geoserver
```

```bash
npm run dev      # usually http://localhost:3000
npm run build    # output in dist/
npm run preview
npm run lint
```

---

## How the app works

1. **`App.vue`** loads `workflow.json`. Optional `initialSetup.process` with `trigger: "onStart"` runs once. First step opens automatically if `steps` is non-empty. Global overlays (`FeatureInfoPanel`, `LayerLegend`, `InfoDialog`) mount always but **only activate when config enables them**.
2. **`NavigationDrawer.vue`** lists each step and mounts one **`SubMenu`** per step.
3. **`SubMenu.vue`** loads components by name via `import.meta.glob('@/components/*.vue')`, handles Confirm, and runs processes according to `process.trigger`.
4. **`views/Home.vue` → `MapComponent.vue`** hosts the map; the **map store** builds layers from `base-layers-config.json` and tracks selection / filters / dynamic layers.

### Project layout

```
src/
├── config/
│   ├── workflow.json              # Product UI + processes
│   ├── base-layers-config.json    # Layer service definitions
│   └── info-dialog.md             # Optional; used if infoDialog.contentFile points here
├── components/                    # Wizard + map UI (name = workflow component id)
├── stores/
│   ├── app.js                     # Steps, selections, processResults, info dialog
│   └── map.js                     # Layers, visibility, filters, region, hover
├── lib/
│   ├── ogc-process/               # Execute + resolve inputs + output actions
│   ├── constant.js                # MAP_CENTER, MAP_ZOOM, basemap styles
│   └── …                          # Layer builders, legend, category-style, helpers
├── views/Home.vue
└── App.vue
```

---

## Starting a new product from this codebase

1. Copy / fork the repo.
2. Replace logo under `public/` and set `workflow.json` → `logo` (and optional `logoWidth`, `logoAlt`).
3. Set `MAP_CENTER` / `MAP_ZOOM` in `src/lib/constant.js`.
4. Fill `base-layers-config.json` with your layers.
5. Rewrite `workflow.json` steps (or start empty — see below).
6. Set `.env` for Mapbox (and OGC/GeoServer as needed).
7. Only add a new `.vue` under `components/` when an existing block cannot do the job; then reference it by filename in `workflow.json`.

**Minimal valid workflow** (shell only — no steps):

```json
{
  "logo": "/your-logo.png",
  "initialSetup": {},
  "steps": []
}
```

With `steps: []`, the drawer has no wizard items and nothing auto-opens. Useful to verify the map shell before wiring UX.

---

## Configuring `workflow.json`

### Top-level fields

| Field | Purpose |
|--------|---------|
| `logo` | Path under `public/` |
| `logoWidth` | Optional CSS width (e.g. `"140px"`). Default `"80px"` |
| `logoAlt` | Optional image alt text |
| `initialSetup` | Restart button and/or bootstrap `process` |
| `legendStack` | `"vertical"` (default) or `"horizontal"` for the floating legend |
| `infoDialog` | Optional markdown dialog (see below) |
| `steps` | Ordered wizard steps |

### `initialSetup`

```json
"initialSetup": {
  "restartButton": true,
  "process": {
    "identifier": "my-start",
    "trigger": "onStart",
    "inputs": [],
    "storeResultAs": "initialSetup"
  }
}
```

- **`restartButton`**: shows Restart in the drawer after the first step is completed; resets app + map state and re-runs `onStart` if present.

### `infoDialog`

Only active when `enabled: true`. Markdown file must live under `src/config/` (loaded via Vite glob).

| Field | Meaning |
|--------|---------|
| `enabled` | Master switch |
| `showOnStart` | Open once on load (unless “remembered”) |
| `showButton` | Info icon in the drawer footer |
| `remember` | `"local"` \| `"session"` \| `"always"` (always = never persist “seen”) |
| `storageKey` | Optional; default `viewer:info-dialog-seen` |
| `contentFile` | e.g. `"info-dialog.md"` |
| `title`, `closeLabel`, `width`, `height` | Dialog chrome |

### Each step

| Field | Meaning |
|--------|---------|
| `id` | Stable id (`requiredSteps`, store keys) |
| `title` | Drawer label |
| `drawerTitle` | Submenu heading |
| `icon` | Optional MDI icon name |
| `explanation` | Help text above footer |
| `requiredSteps` | Step ids that must be completed first |
| `disabledOnContinue` | After complete, step stays locked unless reopened while active |
| `requiresConfirmation` | Footer **Confirm** required to advance |
| `confirmationSource` | `"component"` \| `"mapClick"` \| `"process"` |
| `requiredSelections` | Selection keys that must be set before Confirm enables |
| `confirmFlashWhenEnabled` / `explanationFlashWhenAvailable` | Attention flashes |
| `completionEvent` | `"auto"` → complete when submenu opens |
| `components` | `[{ "component": "Name", "componentProps": { … } }]` |
| `process` | Optional OGC process block |

### `confirmationSource`

| Value | Ready when… |
|--------|-------------|
| `component` | Child signals ready / selections satisfied |
| `mapClick` | A map feature is selected (`mapStore.activeRegion`) |
| `process` | Process ran successfully (for `trigger: "component"`, Confirm waits for a result) |

### Process block

```json
"process": {
  "identifier": "my-process",
  "trigger": "component",
  "inputs": [
    { "id": "session_id", "source": "store:app.processResults.initialSetup.session_id" },
    { "id": "uom_size", "source": "payload:value" },
    { "id": "id", "source": "store:map.activeRegionId" }
  ],
  "storeResultAs": "uom",
  "outputActions": [
    { "action": "removeLayer", "fromResultKey": "uom", "path": "response" },
    { "action": "addLayer", "path": "response" }
  ]
}
```

**`trigger`**

| Trigger | When it runs |
|--------|----------------|
| `onStart` | App mount / Restart (`App.vue`) |
| `component` | Child emits `run-process` (`NumberInput`, `ProcessRunButton`, …) |
| `stepOpen` | Submenu opens |
| `mapClick` | Region selected while step is open |
| `stepComplete` | Step completes (payload from children) |

**Input `source` prefixes** (`resolve-input.js`):

| Prefix | Resolves from |
|--------|----------------|
| `store:app.…` / `store:map.…` | Pinia stores |
| `payload:…` | Event payload (e.g. calculator value) |
| `processResult:…` | `app.processResults` |
| `static:…` | Literal after the first `:` |

Selection objects shaped like `{ id, … }` are sent to the server as the scalar **`id`**.

**`outputActions`**

| `action` | Effect |
|----------|--------|
| `storeValue` | Save a path from the response into `processResults` (`storeAs`) |
| `addLayer` | Add dynamic WMS layers from response entries with `layer` + `url` |
| `removeLayer` | Remove layers from a **previous** result (`fromResultKey`); uses a snapshot when `storeResultAs` overwrites the same key |

Request path: `{baseUrl}/processes/{identifier}/execution?f=json`.

---

## Components you can put in a step

Reference by **file name without `.vue`**. Unknown names are skipped.

| Component | Typical use |
|-----------|-------------|
| `SelectionList` | Dropdown → `app.selections[selectionKey]`. Options may carry extra fields for processes/layers. Supports `condition` / `conditionSource`, `disabledUntilCondition`, `confirmSelection`, `flashWhenEnabled` |
| `LayerList` | Layer switches. Per layer: `id`, `name`, `active`, `clickable`, `condition`, `propertiesBox`, `flashWhenEnabled`, plus optional `attributeFilter`, `featureInfo`, `relatedGeometry` (see below) |
| `NumberInput` | Number field; optional Calculate → `run-process`. `defaultValueSource` uses the same `store:` / `processResult:` syntax as processes |
| `ProcessRunButton` | Explicit run button; `requiredSelections`, `flashWhenEnabled`; emits `run-process` |
| `ActiveFeatureProperties` | Usually via LayerList `propertiesBox` — compact selected-feature card |

**Shell / map pieces** (not listed in `components[]`; always available as needed):

| Piece | Role |
|--------|------|
| `MapComponent` / `MapLayer` / `MapZoomControl` | Map host, per-layer interaction, fit-bounds |
| `RelatedGeometry` | Driven by LayerList `relatedGeometry` config |
| `FeatureInfoPanel` | Driven by LayerList `featureInfo` |
| `LayerLegend` | Floating legend for visible layers |
| `InfoDialog` | Driven by top-level `infoDialog` |
| `FlashHighlight` | Used internally for attention pulses |

### LayerList extras (on a layer object)

**`attributeFilter`** — mounts `LayerAttributeFilter` when the layer is visible:

| Prop | Notes |
|------|--------|
| `attributeKey` | Required primary attribute |
| `secondaryAttributeKey` | Optional → hierarchical groups |
| `delimiter` | Default `";"` for multi-value attributes |
| `dimOnDeselect` | `false` (hide via filter) \| `"primary"` \| `"all"` (dim paint) |
| `showCategoryColors`, `wfsUrl`, `defaultCollapse`, `emptySecondaryLabel`, `title` | UX / data loading |

**`featureInfo`** — right-hand panel fields for the selected feature:

```json
"featureInfo": {
  "title": "Details",
  "emptyValue": "—",
  "fields": [{ "attribute": "naam", "title": "Name" }]
}
```

**`relatedGeometry`** — show/filter companion fill/outline layers on select/hover:

| Field | Notes |
|--------|--------|
| `layerId` / `outlineLayerId` | Ids from `base-layers-config` |
| `sourceAttribute` / `targetAttribute` | Join keys (default `fid`) |
| `fitBounds` | Zoom to related geometry (suppresses default point zoom when true) |
| `showOnHover` / `showOnHoverWithSelection` | Hover behaviour |

---

## Map layers (`base-layers-config.json`)

Array of layer service definitions. Workflow LayerList entries should use the same **`id`**.

### Common fields

| Field | Purpose |
|--------|---------|
| `id`, `name`, `layer` | App id, label, GeoServer layer name |
| `url` | WMS or WMTS endpoint |
| `format` | e.g. `image/png` or `application/vnd.mapbox-vector-tile` |
| `paint` / `layout` | Mapbox style properties |
| `vectorType` | `fill` \| `line` \| `circle` (vector tiles) |
| `promoteId` | Feature id property (needed for click / feature-state) |
| `bbox`, `minZoom`, `maxZoom` | Optional tile bounds / zoom |
| `mapServiceVersion` | WMS version if needed |

**Two entries with the same `id`** (one raster, one MVT) → app builds a visible raster (`id_raster`) plus a clickable vector layer.

### Legend-related fields

| Field | Purpose |
|--------|---------|
| `showInLegend` | `false` hides from floating legend |
| `legendMode` | `"categories"` → swatch legend from `categoryStyle` / WFS |
| `legendLayout` | `"dense"` for wide GetLegendGraphic images |
| `legendCardMaxWidth`, `legendBodyMaxHeight`, `legendExpanded` | Card UX |
| `legendOptions` | Passed into GeoServer `legend_options` (fontSize, columns, dpi, …) |
| `categoryStyle` | Colors, radius, stroke, dimmed styles for circle categories |

If the browser cannot reach hostnames in JSON (Docker), set **`VITE_GEOSERVER_PUBLIC_BASE_URL`**.

---

## Map defaults (`constant.js`)

| Export | Role |
|--------|------|
| `MAP_CENTER` | `[longitude, latitude]` |
| `MAP_ZOOM` | Initial zoom |
| `MAP_BASELAYERS` / `MAP_BASELAYER_DEFAULT` | Mapbox style list |

Change these per deployment (not via `workflow.json` today).

---

## Common sources of confusion

1. **Two configs, one id** — `base-layers-config` = *how to draw*; `workflow` LayerList = *when visible / clickable / filters / info*. Same `id` links them.
2. **Clickable only for the active step** — `clickable: true` is registered per step. Clicks work when that step’s submenu is open.
3. **Component name = filename** — `"SelectionList"` loads `SelectionList.vue`. Typos fail silently (component missing).
4. **Confirm stays disabled** — Check `requiredSelections`, `confirmationSource`, map click, or whether a `component`-triggered process returned a result.
5. **`removeLayer` + same `storeResultAs` key** — Previous result is snapshotted before overwrite so old dynamic layers can be removed. Prefer explicit `fromResultKey` over relying on “clear everything”.
6. **Global panels vs step components** — `FeatureInfoPanel` / `InfoDialog` / `RelatedGeometry` are not added to `components[]`; they react to config on layers / top-level workflow.
7. **Selection objects vs process scalars** — UI may store `{ id, name, … }`; process inputs coerce to `id`.
8. **Env at build time** — `VITE_*` values are baked in at `npm run build`; changing the server env later without rebuilding does nothing.

---

## Deployment

- Set `VITE_*` in the environment used for **build**.
- Ensure GeoServer / tile URLs are reachable from end-user browsers (or use `VITE_GEOSERVER_PUBLIC_BASE_URL`).
- Host `dist/` as an SPA (fallback to `index.html`).

---

## Troubleshooting

| Issue | Check |
|--------|--------|
| Blank map | `VITE_MAPBOX_TOKEN`; browser console |
| Processes fail | `VITE_OGC_API_URL`; process id; CORS; network tab |
| Layers missing | Browser-reachable GeoServer URL; layer name; `id` match between configs |
| Legend empty | `showInLegend`; WMS GetLegendGraphic; or `legendMode: "categories"` + WFS |
| Filter / dim not working | `attributeFilter` + vector layer; `promoteId`; `categoryStyle` where needed |
| Feature info never opens | Layer has `featureInfo` and is clickable for the active step |
| Info dialog never shows | `infoDialog.enabled`; `showOnStart` / button; `remember` + `storageKey` |

---

## Contributing

Issues and pull requests are welcome. Run **`npm run lint`** (or at least eslint on `src/`) before submitting.

When adding a shared feature, prefer **opt-in config** so existing products keep working without JSON changes.

---

## Acknowledgments

- [Vue.js](https://vuejs.org/), [Vite](https://vitejs.dev/), [Vuetify](https://vuetifyjs.com/), [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
- [Studio Meta](https://github.com/studiometa) — [`@studiometa/vue-mapbox-gl`](https://github.com/studiometa/vue-mapbox-gl)
- Sibling deployments share this viewer core: [lare-viewer](https://github.com/openearth/lare-viewer), [NL2120-viewer](https://github.com/openearth/NL2120-viewer)
- [LARE](https://github.com/DesirMED/LARE) — example OGC API Processes backend
