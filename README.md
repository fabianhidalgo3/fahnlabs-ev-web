# ev-web · Yard dashboard

Part of **EV yard power control** by FAHNLABS: real-time power allocation for an electric-vehicle charging yard.
Overview, architecture and deployment: [fahnlabs-ev-deploy](https://github.com/fabianhidalgo3/fahnlabs-ev-deploy).

Operations dashboard with the "yard switchboard" design: the busbar shows the yard limit as a hazard band and each
charger is a circuit. It only talks to [ev-bff](https://github.com/fabianhidalgo3/fahnlabs-ev-bff).

## Stack

Angular 22 (standalone components, signals, zoneless) · runtime English / Spanish · light / dark theme · mobile
layout from 375 px · Archivo typeface.

## Run

```bash
npm install
npm start                 # http://localhost:4200, proxies /api and /ws to the BFF on :9000
npm run build             # dist/front/browser, served by the BFF
npm test                  # unit tests (Vitest)
```

## Pages

| Page | Content |
|---|---|
| Operations | Busbar with the yard limit, live power per charger, engine settings |
| Yard | Chargers as circuits, connectors and running sessions |
| Calendar | Charging plans with departure time, target SoC and power limit |
| Sessions | Session history and power samples |
| Vehicles, Chargers | Master data (VIN, RFID, EVCCID, priority, maximum power) |
| Engine | OCPP commands, OCPP log, MeterValues |
| Energy | Controlled demand versus immediate charging, avoided peak, savings, CO₂ |

The AI assistant sits in the top bar.

## Code

| Path | Content |
|---|---|
| `src/app/app.ts`, `app.routes.ts` | Shell and routes |
| `src/app/pages/` | Pages |
| `src/app/i18n/en.ts`, `es.ts` | UI text (same keys in both languages) |
| `src/styles.css`, `src/layout.css` | Colour tokens and layout |

All UI text goes through the i18n dictionaries and all colours through CSS tokens.

## Author

© 2026 Fabián Hidalgo · FAHNLABS. All rights reserved.
