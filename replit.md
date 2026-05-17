# BOQ Consumption Analytics

A full-stack Bill of Quantities (BOQ) consumption analytics platform. It parses Arabic Oracle Reports HTML exports, runs statistical analysis (consumption factors, percentiles, outlier detection), serves results via a REST API, and displays everything in a Bloomberg-styled React dashboard with CSV/Excel export.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/boq-dashboard run dev` — build and preview the dashboard (port 23658)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 on port 8080
- Dashboard: React 19 + Vite 7 + Tailwind CSS 4 on port 23658
- ETL: Python 3.11 with pandas, numpy, openpyxl, matplotlib
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle for API server)

## Where things live

- `scripts/src/analyze_boq.py` — Python ETL: parses HTML files, computes statistics, exports outputs
- `attached_assets/` — source HTML files (4 Oracle Reports exports in Arabic)
- `outputs/boq_analysis/` — generated outputs: CSV, Excel, JSON, chart PNGs
- `artifacts/api-server/src/routes/boq.ts` — BOQ API routes
- `artifacts/boq-dashboard/src/pages/Dashboard.tsx` — main dashboard React component
- `artifacts/boq-dashboard/src/index.css` — Bloomberg dark navy theme
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)

## Architecture decisions

- **Python ETL over Node**: Statistical analysis (percentiles, outlier detection, CF distribution) is cleaner in Python with pandas/numpy; the API server spawns Python as a subprocess
- **Build-then-preview for dashboard**: The `dev` script uses `vite build && vite preview` instead of `vite dev` because the Replit workflow runner health-check causes `vite dev` to exit silently; preview mode is stable
- **ROOT_DIR uses 3 levels up from `dist/`**: The API server is compiled to `dist/index.cjs`, so `import.meta.dirname` resolves to `dist/`; the script path and output path must go up `../../..` (not `../../../..`) to reach the workspace root
- **Format A + Format B HTML parsers**: File 1 uses absolute-positioned `<span>` elements; files 2-4 use standard HTML tables with 62-cell headers and 13-cell data rows (spacer at index 0, real data at odd indices)
- **Static outputs cached on disk**: Analysis results are written to `outputs/boq_analysis/` and served directly; the dashboard re-runs analysis on demand via "Run Analysis" button

## Product

- Parse 4 Arabic Oracle Reports HTML files (manhole BOQ data, 747 records)
- Compute consumption factor statistics: median, mean, P75/P80/P90, std deviation, outlier detection
- Display KPI cards: total records, items analyzed, consumption rate, over-allocation %
- Three dashboard tabs: Overview (efficiency distribution + insights), Analysis Table (sortable), Charts (matplotlib PNGs)
- Export: Analysis Results CSV, Master Dataset CSV, Full Excel Workbook (6 sheets)
- Trigger re-analysis via "Run Analysis" button in the dashboard header

## User preferences

- Bloomberg dark navy theme (#0d1117 background, amber #f59e0b accent)
- Arabic descriptions displayed as-is (RTL text, no translation)
- Export buttons always visible once results exist

## Gotchas

- **Always rebuild dashboard after code changes**: The `dev` script builds a static bundle; source changes require a workflow restart to take effect
- **Python script path**: The API looks for `scripts/src/analyze_boq.py` relative to the workspace root (`/home/runner/workspace`)
- **HTML file format detection**: Format A (file 1) uses `right:760pt` spans for element IDs and `right:890pt` for descriptions; Format B (files 2-4) uses 62-column table headers
- **Sub-row column mapping for Format B**: 13-cell rows have spacer at index 0; real data at odd indices (1, 3, 5, 7...)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Dashboard API URL: `import.meta.env.BASE_URL` prefix (auto-handled by the `API` constant in Dashboard.tsx)
