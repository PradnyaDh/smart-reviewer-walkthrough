# PR Review Rules — Dynamic Pricing Service (Backend, Admin & Jobs)

Synthesized from **1,858 real code reviews** across pull requests in `deliveryhero/logistics-dynamic-pricing`.

---

## 1. JPA Entity Primary Key Nullability (`BACK-001`)
- **Non-Nullable Primary Keys:** Primary key identifiers on JPA entities (`@Id val id: Long`) must be declared as non-nullable. Nullable IDs cause Hibernate mapping ambiguities and potential `NullPointerException` during persistence cascades.

## 2. Liquibase Migration Immutability (`BACK-002`)
- **Never Modify Merged Changesets:** Once a Liquibase changelog has been merged or executed in staging/production, it is strictly immutable.
- **Rollback Blocks:** Every new changeset must include an explicit `<rollback>` block or SQL reverse script.
- **Column Defaults:** Adding non-nullable columns to existing tables must supply a database-level `DEFAULT` clause.

## 3. Spring Security & RBAC Enforcement (`BACK-003`)
- **Controller Annotations:** All Admin REST endpoints under `/api/v1/admin/**` must declare explicit `@PreAuthorize("hasRole(...)")` checks, mapped to Country Operations permission tiers.

## 4. Transaction Boundaries & Audit Integrity (`BACK-004`)
- **Audit Synchronization:** Mutating actions that generate pricing audit logs must ensure the audit record write is wrapped in the same `@Transactional` boundary as the main entity update, so rollbacks do not leave orphaned audit records.

## 5. SQS & Kafka Queue Maintenance (`BACK-005`)
- **Clean Deprecation:** When deprecating SQS queue consumers (e.g. legacy Delivery Area updates), remove the listener bean and container definitions from Helm charts before deleting the queue in AWS to avoid log spam and alarm triggers.

## 6. S3 Batch Precomputations & Timezones (`BACK-006`)
- **Dataset Contract Sync:** When updating ToD or precomputed pricing batch jobs in the `jobs` module, verify that the exported S3 key pattern and schema match the loader expectations in the `admin` and `api` modules.
- **Explicit Timezones:** Always serialize zone timezones in exported S3 pricing configurations so campaigns can be loaded unambiguously into runtime cache.

## 7. PostgreSQL Large In-List Performance (`BACK-007`)
- **Use `= ANY(?)`:** When querying PostgreSQL by large lists of identifiers (e.g. vendor IDs, zone IDs), use `= ANY(?)` with array bind parameters rather than dynamic `IN (?, ?, ...)` clauses. Dynamic IN clauses blow query cache and degrade planner performance.

## 8. Hibernate Lazy Class Finality (`BACK-008`)
- **Kotlin Open Classes:** In Kotlin, classes and methods are final by default. Ensure JPA entities and their getter methods are non-final (via `open` or the Kotlin `all-open` Spring plugin) to prevent `HibernateException: Getter methods of lazy classes cannot be final`.

## 9. Liquibase Preconditions for Multi-Tenant DBs (`BACK-009`)
- **Avoid Execution Collisions:** In multi-tenant per-country PostgreSQL setups, include `<preConditions onFail="MARK_RAN">` in Liquibase changesets so migrations run idempotently without failing if a schema already exists.

## 10. Transactional Event Publishing (`BACK-010`)
- **After-Commit Events:** Domain events published from inside `@Transactional` methods must use `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)` so events are never broadcast to queues if database rollbacks occur.

## 11. Fail-Safe Bootstrapping (`BACK-011`)
- **Resilient Startup:** Application startup must not fail due to a single invalid country or zone configuration value. Log a clear `WARN` with the affected entity ID and fall back to safe default operational limits.

## 12. STS Token Refresh & Sidecar Caching (`BACK-012`)
- **Sidecar Caching:** When authenticating with downstream AWS services, retrieve tokens from the local STS sidecar with jittered in-memory caching to prevent synchronized token expiration spikes and 401 storms.
