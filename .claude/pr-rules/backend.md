# PR Review Rules — Dynamic Pricing Service (Backend & Admin)

Synthesized from 1,858 real code reviews across pull requests in `deliveryhero/logistics-dynamic-pricing`.

## 1. JPA Entity Primary Key Nullability (`BACK-001`)
- **Non-Nullable Primary Keys:** Primary key identifiers on JPA entities (`@Id val id: Long`) must be declared as non-nullable. Nullable IDs cause Hibernate mapping ambiguities and potential `NullPointerException` during persistence cascades.

## 2. Liquibase Migration Immutability (`BACK-002`)
- **Never Modify Merged Changesets:** Once a Liquibase changelog has been merged or executed in staging/production, it is strictly immutable.
- **Rollback Blocks:** Every new changeset must include an explicit `<rollback>` block or SQL reverse script.
- **Column Defaults:** Adding non-nullable columns to existing tables must supply a database-level `DEFAULT` clause.

## 3. Spring Security & RBAC Enforcement (`BACK-003`)
- **Controller Annotations:** All Admin REST endpoints under `/api/v1/admin/**` must declare explicit `@PreAuthorize("hasRole(...)")` checks, mapped to Country Operations permission tiers.

## 4. Transaction Boundaries & Audit Integrity (`BACK-004`)
- **Audit Synchronization:** Mutating actions that generate pricing audit logs must ensure the audit record write is wrapped in the same `@Transactional` boundary as the main entity update, so rollbacks do not leave phantom audit records.

## 5. SQS & Kafka Queue Maintenance (`BACK-005`)
- **Clean Deprecation:** When deprecating SQS queue consumers (e.g. legacy Delivery Area updates), remove the listener bean and container definitions from Helm charts before deleting the queue in AWS to avoid log spam and alarm triggers.

## 6. S3 Batch Precomputations (`BACK-006`)
- **Dataset Contract Sync:** When updating ToD or precomputed pricing batch jobs in the `jobs` module, verify that the exported S3 key pattern and schema match the loader expectations in the `admin` and `api` modules.
