# PR Review Rules — Dynamic Pricing Dashboard (Frontend)

Synthesized from **1,284 real code reviews** across pull requests in `deliveryhero/logistics-dynamic-pricing-dashboard`.

---

## 1. Monetary Precision & Decimal Display (`DASH-001`)
- **No Float Casting:** Never typecast backend `big_decimal` strings to raw JavaScript `Number` or `Float` for price or fee calculations.
- **Display Formatting:** Use currency formatters and string-based decimal utilities. JavaScript IEEE-754 floating-point numbers lose precision on cent values.

## 2. Form Cloning & ID Stripping (`DASH-002`)
- **Explicit Undefined:** In clone/duplicate workflows (e.g. Campaign, Price Scheme, Automatic Assignment), explicitly set IDs (`id: undefined`, `target_group_id: undefined`) rather than conditionally omitting them with object spreads `{ ...(condition && { id }) }`. Conditionally spreading causes object shape instability in `react-hook-form`.
- **Prevent Action Leakage:** Ensure unlink and delete buttons inside sub-modals (e.g. VGF presets) are disabled during clone flows so users cannot inadvertently mutate source configurations.

## 3. React Hooks & Re-render Prevention (`DASH-003`)
- **Primitive Dependencies:** Never pass complex object literals or unmemoized array references into `useEffect` or `useCallback` dependency arrays. Always pass primitive IDs (e.g., `vendor.id`, `countryCode`).
- **Query Disabling on Entity Change:** Disable dependent queries (`enabled: Boolean(entityId)`) when the global entity ID (GEID) changes to prevent race conditions during rapid dropdown switching.

## 4. Feature Flag Fallbacks (`DASH-004`)
- **Default Fallback:** Any component reading feature flags via `useFlag` must define an explicit fallback state in case the FwF network request fails.
- **Interface Pruning:** When removing stale or globally rolled-out feature flags, clean up the TypeScript `FeatureFlag` interface and mock utilities simultaneously.

## 5. Timezone & Locale Isolation (`DASH-005`)
- **Fixed IANA Zones:** Use explicit Luxon IANA timezone definitions or moment-timezone bundled data rather than relying on the host environment's native `Intl` API.
- **Deterministic Test Locales:** In Jest / React Testing Library tests, set explicit test locales (`en-US` or `en-GB`) to prevent test suite failures in CI environments with different default locale configurations.

## 6. Search Filter Memoization (`DASH-006`)
- **Lowercase Outside Loops:** When filtering tables, lists, or combobox options, compute `search.toLowerCase().trim()` once outside the iteration loop. Never re-evaluate lowercase conversions inside `.filter()` callbacks.

## 7. Numerical ID Nullish Checking (`DASH-007`)
- **No Double Negation on IDs:** Never use `!id` or `!!id` when checking IDs, counts, or tier index parameters. Always use explicit nullish checks (`id != null` or `id !== undefined`), because `0` is a valid identifier and falsy evaluation introduces subtle bugs.

## 8. Combobox & Asynchronous Option Fallbacks (`DASH-008`)
- **Default Empty Array:** Combobox, Autocomplete, and MultiSelect components must provide a fallback empty array (`options = []`) to prevent runtime crashes when asynchronous queries return `undefined` during initial load.

## 9. Deterministic Test Waiting (`DASH-009`)
- **No Arbitrary Timeouts:** Never use arbitrary `setTimeout(..., 1000)` delays in test suites. Use deterministic React Testing Library utilities (`await waitFor(...)`) or Jest fake timers (`jest.useFakeTimers()`) to prevent flakiness in CI.

## 10. Form Validation Message Deduplication (`DASH-010`)
- **Combined Conditions:** When validating form fields with multiple boundary conditions, combine related checks or use early exit guards so the UI does not trigger duplicate error toast alerts.

## 11. Package Hygiene & Dependency Cleanliness (`DASH-011`)
- **Immediate Pruning:** Remove unused packages from `package.json` immediately when refactoring or retiring legacy utilities to keep bundle sizes lean.
