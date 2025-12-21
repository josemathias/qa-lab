# Repository Guidelines

## Project Structure & Module Organization
- Multi-layer layout mirrors the testing strategy: `L0-unit-tests/` (Jest-style unit cases), `L1-integration-tests/` (Cypress e2e), `L2-api-mobile-tests/` (Appium + REST flows), `L3-performance-security/` (k6 load), and `L4-exploratory-testing/` (charters/notes).
- Top-level `cypress/` holds shared fixtures/support for L1. CI definitions live in `.github/workflows/ci.yml`; align new jobs with the existing matrix.
- Keep data files and sample payloads under each layer’s folder to avoid cross-layer coupling.

## Build, Test, and Development Commands
- L0 (unit): `cd L0-unit-tests && npm install && npm test` (or `npx jest` when configured). Use `*.test.js` filenames.
- L1 (Cypress): `cd L1-integration-tests && npm install && npm test` for headed runs; `npx cypress run --record --key $CYPRESS_RECORD_KEY` to match CI recording.
- L2: REST flows under `L2-api-mobile-tests/rest-assured/`; Appium sample at `cd L2-api-mobile-tests/appium && node basic-appium-test.js`.
- L3 (k6): `cd L3-performance-security/k6 && k6 run sample-load-test.js`.
- CI bootstraps dependencies inline (see `ci.yml`); keep new scripts deterministic and non-interactive.

## Coding Style & Naming Conventions
- JS tests use CommonJS imports in Cypress configs and standard Jest/Cypress globals. Favor data attributes (e.g., `data-cy`) for selectors.
- Keep specs declarative: one feature per spec file (`*.cy.js` for Cypress, `*.test.js` for unit). Share helpers via `cypress/support` or per-layer utils.
- For mobile/API scripts, keep credentials and endpoints in environment variables; never hardcode secrets.

## Testing Guidelines
- L0: pure functions, adapters, and schema mappers. Fast, isolated, no network. Mock I/O aggressively.
- L1: full UI/API journeys; seed data via backend fixtures or mocks; reset state between specs. Prefer running against a local backend-first.
- L2: device/browser automation; ensure drivers and emulators are configured locally before PRs. Keep retries and waits explicit.
- L3: load/security smoke; parameterize VUs/duration to stay safe by default.

## Commit & Pull Request Guidelines
- Match the short, imperative commit style seen in history. Group commits by layer (e.g., `add l1 cypress spec for journeys`).
- PRs should state targeted layers, environments, required env vars (`CYPRESS_RECORD_KEY`, Appium endpoints), and screenshots/videos for L1 when relevant.
- Note CI impacts (runtime, new secrets) and include run commands for reviewers to reproduce locally.

## Security & Configuration Tips
- Secrets stay in env vars or CI secrets. Do not commit recordings containing sensitive data.
- If adding new tooling (e.g., Playwright, additional k6 scripts), isolate them in a new layer folder and document install steps inline.
