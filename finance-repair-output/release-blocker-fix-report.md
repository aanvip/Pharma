# Final Release Blocker Report — 2026-06-03

Last updated: 2026-06-03 post-release validation

## Issue 1: Incorrect 50kg Repair on batch 4001/1101/25/A-3147

### Root cause
`scripts/historical-finance-repair.mjs:217` computed `delivered` for each
target batch as the SUM of every `delivery_challan_items.quantity` row,
ignoring `delivery_challans.approval_status`. Batch A-3147 has these DC
items totalling 1050:

| DC | Qty | approval_status |
|---|---:|---|
| DO-25-0007 | 400 | approved |
| DO-25-0009 | 400 | approved |
| DO-26-0009 | 50  | approved |
| DO-26-0010 | 50  | **rejected ("dubble entry")** |
| DO-26-0018 | 150 | approved |

Approved-only delivered = 1000 = import. Correct `current_stock` is **0**.
HFR posted a `-50` adjustment (txn `7372f0f6-…`) and dropped the batch to
`-50`.

### Fix applied
- Posted reversal inventory_transaction `HFR-260603-STOCK-REVERSAL` with
  `quantity = +50`, `stock_before = -50`, `stock_after = 0`.
- Updated `batches.current_stock` from `-50` to `0`.
- Updated `products.current_stock` (recomputed downstream — no change for
  this product as no other batches contribute).
- Recomputed `sales_order_items.delivered_quantity` for SO-2026-0014
  (rejected DC's SO): 0 → 50 (matches the one approved DC, DO-26-0009).
  SO status remains `delivered`.

### Verification
| Check | Result |
|---|---|
| `batches.current_stock` for A-3147 | 0 |
| Approved DC sum for A-3147 | 1000 (= import) |
| HFR-260603 contribution net | -50 + 50 = 0 |
| SO-2026-0014 SO item delivered_quantity | 50 (= one approved DC) |

Conservation: the HFR-260603 repair window now nets to zero on this batch.
Pre-HFR drift in the txn log (-950 net) was present before today's repair
and falls outside the scope authorized for this fix.

## Issue 2: DC Rejection / Cancellation lifecycle

### Root causes
1. `trg_dc_rejection_release_stock` only decremented `reserved_stock`.
   For an `approved → rejected` transition the previously deducted
   `current_stock` was never restored.
2. The same trigger never reversed `sales_order_items.delivered_quantity`.
3. `update_so_delivered_quantity_atomic` incremented `delivered_quantity`
   on DC creation rather than on approval, so a rejected DC briefly
   inflated delivered totals (and stayed inflated if approved-then-rejected).
4. No DC cancellation state existed (`dc_approval_status` had only
   `pending_approval | approved | rejected`).

### Fix delivered (single migration)
`supabase/migrations/20260603120000_fix_dc_rejection_cancellation_and_a3147_stock.sql`

Components:
1. `ALTER TYPE dc_approval_status ADD VALUE 'cancelled'`.
2. `fn_recompute_so_delivered(p_so_id)` — recomputes
   `sales_order_items.delivered_quantity` from approved DCs only and
   resets `sales_orders.status`.
3. `trg_dc_rejection_release_stock` replaced — handles
   `pending → rejected` (release reservation) and `approved → rejected`
   (restore `current_stock` + log a reversing inventory_transaction).
   Calls `fn_recompute_so_delivered` so delivered totals exclude rejected.
4. `trg_dc_cancellation_release_stock` added — mirror of rejection
   trigger for the `cancelled` state.
5. `trg_dc_approval_recompute_so` added — recomputes SO delivered on
   approval, so the source of truth is always approved-DC-derived.
6. `update_so_delivered_quantity_atomic` body replaced with a call to
   `fn_recompute_so_delivered` (signature preserved — UI keeps working).
7. `fn_cancel_delivery_challan(dc_id, user, reason)` RPC added with role
   guard (`admin | accounts | warehouse | manager`).
8. Data fix block — embeds the Issue 1 reversal (idempotent: skips if
   `current_stock` is not -50) so the migration is self-contained.
9. Sweep — recomputes `delivered_quantity` for every SO that has a
   rejected or cancelled DC so historical state is clean post-deploy.

### Files changed
- `supabase/migrations/20260603120000_fix_dc_rejection_cancellation_and_a3147_stock.sql` (new)
- `scripts/fix-a3147-stock-and-so.mjs` (data fix runner; applied)
- `scripts/e2e-dc-lifecycle.test.mjs` (new automated test)

No application code changed; the UI's existing rejection call path keeps
working (it sets `approval_status = 'rejected'` and the new trigger
covers both pending and approved source states). Cancellation can be
wired up later by calling `fn_cancel_delivery_challan` from the UI.

### Automated test
`scripts/e2e-dc-lifecycle.test.mjs` provisions an isolated product, batch
(100kg), customer and SO, then asserts for each scenario that
`batches.current_stock`, `batches.reserved_stock`, and
`sales_order_items.delivered_quantity` return to pre-DC values.

Scenarios:
1. create DC → approve → reject
2. create DC → approve → cancel
3. create DC → reject (no approve)

Run with:
```
node scripts/e2e-dc-lifecycle.test.mjs
```

### Verification status
- Issue 1 data fix: **applied + verified** on prod.
- Issue 2 migration: **written, not yet applied** — DDL requires a
  Postgres connection (Supabase blocks `ALTER TYPE` / `CREATE TRIGGER`
  via the service-role REST endpoint). Once the connection string is
  available, `psql -f supabase/migrations/20260603120000_*.sql` followed
  by `node scripts/e2e-dc-lifecycle.test.mjs` completes the verification.
- Full E2E test remains blocked until cleanup is safe. The live DB currently
  cannot delete E2E sales orders because the SO delete trigger calls an
  overloaded reservation-release function ambiguously.

## Finance Post-Validation Repairs

Completed after the original blocker report:

- Trial Balance verified balanced.
- Historical COGS repair verified complete via additive correction journals.
- `RV/25-26/011` receipt journal repaired in place:
  - Existing journal retained.
  - Two balancing journal lines inserted.
  - Debit and credit both equal 78,480,108.
- `RV2606-0002` journal verified balanced. The unallocated receipt remainder is
  an unapplied/advance receipt item, not a safe automatic allocation.
- Nineteen stale sales invoice `balance_amount` values corrected from existing
  allocations.

## Current Release Blockers

1. Apply `supabase/migrations/20260603173000_fix_sales_order_delete_trigger_overload.sql`.
2. Delete:
   - `e2e-SO-TEST-1780479381949`
   - `e2e-customer-TEST-1780479381949`
3. Run full SO -> approve -> DC -> invoice -> receipt voucher E2E validation.

## Non-Blocking Audit Note

The 28 reported batch mismatches are not current-stock errors. Current batch
stock matches import quantity minus approved DC delivered quantity. The mismatch
is historical `inventory_transactions.stock_before/stock_after` snapshot drift.
Repair, if desired, should be metadata-only snapshot recomputation and must not
change `batches.current_stock`.
