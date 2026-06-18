# Historical Finance Repair Final Reconciliation

Run date: 2026-06-03

Last updated: 2026-06-03 post-release validation

## Scope Applied

- Posted additive historical COGS correction journals using `landed_cost_per_unit`.
- Added corrective balancing lines to the three verified unbalanced journal entries.
- Posted inventory adjustment transactions for the two verified physical stock errors and updated batch/product current stock to match the adjustment entries.
- Did not change stock logic, DC logic, invoice logic, COGS trigger, security, or delete data.

## Generated Artifacts

- `finance-repair-output/historical-finance-repair.sql`
- `finance-repair-output/historical-finance-rollback.sql`
- `finance-repair-output/historical-finance-repair-report-before.json`
- `finance-repair-output/historical-finance-repair-report-after.json`
- `scripts/historical-finance-repair.mjs`

## Before / After

| Check | Before | After |
|---|---:|---:|
| Missing COGS correction total | 3,019,847,625.32 | 0.00 remaining |
| HFR COGS journals posted | 0 | 32 |
| HFR COGS debit to 5100 | 0.00 | 3,019,847,625.32 |
| HFR inventory credit to 1130 | 0.00 | 3,019,847,625.32 |
| Unbalanced posted journals | 3 | 0 |
| Trial balance delta, debit minus credit | -1,029,648.20 | 0.00 |
| 1130 GL balance | -665,822.77 | -3,020,514,430.59 |
| Batch valuation | 1,554,947,363.56 | 1,547,191,616.61 |
| 1130 GL minus batch valuation | -1,555,613,186.33 | -4,567,706,047.20 |

The 1130 variance increases after this repair because historical COGS was correctly credited to inventory while purchase-side capitalization remains outside this approved repair scope.

## Unbalanced Journal Repairs

| Journal | Repair |
|---|---|
| JE-2511-0002 | Added debit 515,315.35 to account 1140 as corrective missing 11% PPN input balancing line. |
| JE-2510-0002 | Added debit 515,315.35 to account 1140 as corrective missing 11% PPN input balancing line. |
| JE-2509-0002 | Added credit 982.50 to account 1130 as corrective duplicate inventory debit balancing line. |

Production does not currently have account `1150 PPN Input`; account `1140 Prepaid Expenses` was the existing current-asset account used for the two VAT balancing lines.

## Physical Stock Repairs

| Batch | Before Current | Adjustment | Final Current | Approved Delivered | Import Qty | Physical Error After |
|---|---:|---:|---:|---:|---:|---:|
| 4001/1101/25/A-3147 | 0 | -50 then +50 reversal | 0 | 1,000 | 1,000 | 0 |
| 250816w2 | 1,449 | +1 | 1,450 | 550 | 2,000 | 0 |

The initial `4001/1101/25/A-3147` negative-stock repair was later reversed
after approval-status-aware validation showed one 50-unit DC was rejected.
Current production state is 0 stock, 1,000 approved delivered, 1,000 imported.

## Verification Results

- `scripts/finance-audit-verify-rest.mjs`: posted journals scanned 968; unbalanced 0.
- Custom live verification: trial balance delta 0.
- Custom live verification: HFR COGS journals 32; 5100 debit and 1130 credit both 3,019,847,625.32.
- Custom live verification: target physical stock errors are 0 for both requested batches.
- Known audit-script limitations remain: `sales_invoices.status` does not exist in production, and `inventory_transactions.operation_id` does not exist in production.

## Post-Validation Finance Updates

- Trial Balance remains balanced after receipt repair.
- `RV/25-26/011` historical receipt journal was repaired in place:
  - Existing journal entry retained.
  - Reference number corrected to `RV/25-26/011`.
  - Two journal lines inserted.
  - Total debit and credit now both equal 78,480,108.
- `RV2606-0002` is balanced for the full receipt amount. Its unapplied
  remainder is not automatically allocated; it remains an advance/unapplied
  receipt classification item.
- Nineteen stale `sales_invoices.balance_amount` values were corrected to match
  `total_amount - paid_amount` where existing receipt allocations already
  matched `paid_amount`.

## Remaining Release Blockers

- Apply `supabase/migrations/20260603173000_fix_sales_order_delete_trigger_overload.sql`
  through a direct database migration channel.
- Delete remaining E2E records after that migration:
  - `e2e-SO-TEST-1780479381949`
  - `e2e-customer-TEST-1780479381949`
- Full live E2E validation is blocked until the E2E cleanup delete path works.
- The 28 batch history mismatches are historical `stock_before/stock_after`
  snapshot drift only; current batch stock is correct and should not be adjusted.
