# PR Review Rules — Dynamic Pricing API & Fallback Service

These guidelines are synthesized directly from 112 code reviews across 91 pull requests in `deliveryhero/logistics-dynamic-pricing-api`.

## 1. Feature Flag Evaluation (FwF / FWL)
- **Early Evaluation:** Evaluate feature flags at the very start of service methods to return early and avoid unnecessary database or cache operations.
- **Test Naming:** Always declare the flag state in test names (e.g. `whenBenefitCappingIsOff_returnsUncappedPrice()`).
- **Do Not Check in High-Frequency Loops:** Cache flag states per request/execution; never make repeated network requests to Features-with-Friends across vendor loops.

## 2. Fallback Service Parity
- **Explicit Parity:** Whenever modifying price schemes, overrides, or fee components in the primary API, explicitly state and implement the fallback path in `logistics-dynamic-pricing-api` fallback services.
- **Zero Surcharge Fallbacks:** Unless explicitly supported, fallback services must default to standard base delivery fee without complex discounts.

## 3. Observability & Prometheus Cardinality
- **Tag Bounding:** Never include dynamic IDs (e.g. `order_id`, `customer_id`, `vendor_id`, or dynamic configuration strings) as Prometheus tags or metric names. High tag cardinality causes scraper timeouts and Prometheus crashes.
- **Alert Parity:** Whenever introducing a new key business metric or error gauge, confirm whether an alert is already configured in `dps-alerts` or alertmanager.

## 4. Concurrency, Coroutines & Caching
- **Parallelism Kill-Switch:** Parallelized vendor pricing calculations using Kotlin coroutines must have a configuration toggle to fall back to sequential execution under thread pool saturation.
- **Valkey Timeouts & Retries:** External cache calls to Valkey must be bounded by strict connection timeouts (<=10ms) so caching latency never blocks checkout traffic.

## 5. DTO & Protobuf Mappers
- **Mapper Purity:** Mappers (`ProtoToDtos`, etc.) must remain pure data transformations. Do not embed business validation rules or conditional discard branches inside mapper classes; place validation on the caller/service side.
- **External IDs:** Model subscription and external entity IDs as `String`, not internal database auto-increment keys.

## 6. Controller Architecture & Exception Handling
- **Centralized Handlers:** Controllers must never return ad-hoc `internalServerError()` or raw 500 JSON bodies. Throw domain exceptions and let centralized `@ControllerAdvice` (`ApiExceptionHandler`) format responses and HTTP codes.

## 7. Subscription Component Isolation
- **Override Boundaries:** Subscription and loyalty discounts must strictly apply only to eligible fee components (e.g. delivery fee waivers) and never cascade blindly across independent overrides like Meal-For-One (MFO) or Minimum-Order-Value (MOV).

## 8. Metric Span Preservation
- **I/O Observability:** When refactoring service methods or pulling logic down into helpers, ensure external I/O (database lookups, Redis calls, S3 fetches) remains enclosed within an active `metricsCollector.observe {}` timer so p99 observability is never silently dropped.

## 9. Configuration & Deployment Drift
- **Helm Secret Alignment:** Any new environment variable or secret referenced in `application.yml` or `bootstrap.yml` must be documented and mapped in `logistics-kubernetes` Helm charts before merging.
- **Deprecation Grace Period:** Never immediately remove or rename existing fields from public DTOs. Annotate with `@Deprecated`, maintain backward-compatible getters, and allow downstream clients a deprecation window.

## 10. Monetary Precision & Strict BigDecimal
- **No Floating Point:** All delivery fee amounts, surge surcharges, and discounts must use `BigDecimal` and strict parser extensions (`asStrictBigDecimal()`). Never use `Double` or `Float` to avoid precision loss on cents.

## 11. Revenue Protection on Upstream Nulls ("Free Money" Prevention)
- **Fail-Safe Fallbacks:** If an upstream dependency (e.g. CDP customer loyalty or subscription state) returns null, times out, or errors, **never default to applying discounts or free delivery waivers**. Defaulting to free perks on missing data bleeds revenue. The fallback must always be standard fee.

## 12. Dynamic Feature Flags over Static Properties
- **Runtime Toggles:** Operational knobs, country rollouts, and kill-switches should use dynamic feature flags (FeaturesWithFriends) rather than static Helm/application properties that require full pod redeployments.

## 13. Range Boundary Validation & Testing
- **Input Validation:** Range filters and interval objects (`from..to`) must validate `from <= to` in an `init {}` block. Test suites must explicitly verify boundary edges (e.g. `0`, exact thresholds, and negative bounds).
