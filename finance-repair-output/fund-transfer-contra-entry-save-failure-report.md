# Fund Transfer Contra Entry Save Failure Report

Date: 2026-06-15

## Execution Path

Create Transfer button:

- `src/components/finance/FundTransferManager.tsx:823`
- `handleSubmit()` create branch calls `supabase.rpc('create_fund_transfer_with_posting', ...)` at `src/components/finance/FundTransferManager.tsx:286`
- Database RPC is defined in `supabase/migrations/20260430090000_create_fund_transfer_with_posting_rpc.sql`

There is no frontend repository/service wrapper between the button and Supabase for create. Edits use direct `fund_transfers` update at `src/components/finance/FundTransferManager.tsx:273`; deletes remove linked petty cash rows, clear statement matches, then delete `fund_transfers` at `src/components/finance/FundTransferManager.tsx:361`.

## Exact Failing SQL

The failing statement is inside `public.create_fund_transfer_with_posting`, only when `to_account_type = 'petty_cash'`:

```sql
INSERT INTO public.petty_cash_transactions (
  transaction_date,
  transaction_type,
  amount,
  description,
  bank_account_id,
  source,
  fund_transfer_id,
  created_by
) VALUES (
  v_transfer.transfer_date,
  'withdraw',
  v_transfer.to_amount,
  COALESCE(v_transfer.description, 'Fund transfer from ' || COALESCE(v_source_account_name, 'Bank')),
  CASE WHEN v_transfer.from_account_type = 'bank' THEN v_transfer.from_bank_account_id ELSE NULL END,
  'Fund Transfer ' || v_transfer.transfer_number,
  v_transfer.id,
  v_transfer.created_by
)
ON CONFLICT (fund_transfer_id) DO NOTHING;
```

Failing conflict target columns:

- `petty_cash_transactions(fund_transfer_id)`

## Schema Comparison

The migration that introduced the RPC also creates this unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_cash_transactions_fund_transfer_unique
  ON public.petty_cash_transactions (fund_transfer_id)
  WHERE fund_transfer_id IS NOT NULL;
```

This is a partial unique index. PostgreSQL cannot infer it from `ON CONFLICT (fund_transfer_id) DO NOTHING` because the conflict target lacks the partial-index predicate. The correct conflict target for that index is:

```sql
ON CONFLICT (fund_transfer_id) WHERE fund_transfer_id IS NOT NULL DO NOTHING
```

## Other Fund Transfer Workflow INSERT / ON CONFLICT Statements

Create RPC:

- `fund_transfers`: plain `INSERT ... RETURNING *`; no `ON CONFLICT`
- `petty_cash_transactions`: `INSERT ... ON CONFLICT (fund_transfer_id) DO NOTHING`; this is the failing statement

Repair migration:

- `supabase/migrations/20260430113000_repair_missing_petty_cash_and_journal_links.sql` had the same `petty_cash_transactions` conflict target while rebuilding missing Fund Transfer -> Petty Cash links. It was corrected so the repair path matches the same partial unique index.

Fund-transfer journal posting:

- `auto_post_fund_transfer_journal()` inserts `journal_entries` and `journal_entry_lines`; no `ON CONFLICT`
- `post_fund_transfer_journal(...)` inserts `journal_entries` and `journal_entry_lines`; no `ON CONFLICT`
- Journal duplicate guard migration exists as partial unique index `journal_entries(source_module, reference_id) WHERE reference_id IS NOT NULL`

Bank statement linking:

- `update_fund_transfer_bank_links()` updates `bank_statement_lines.matched_fund_transfer_id`; no `INSERT ... ON CONFLICT`
- Edit path updates `fund_transfers` and the trigger relinks statement lines
- Delete path clears `bank_statement_lines.matched_fund_transfer_id`

Bank reconciliation tables:

- No fund-transfer create-path `INSERT ... ON CONFLICT` into `bank_reconciliations` or `bank_reconciliation_items` was found.

## Root Cause

Code referenced `ON CONFLICT (fund_transfer_id)` while the only matching uniqueness guarantee in schema is a partial unique index on the same column with `WHERE fund_transfer_id IS NOT NULL`. Because the conflict target did not include the predicate, PostgreSQL raised:

```text
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

This is a code/index inference mismatch, not a missing full-table unique constraint.

## Fix Applied

Migration added:

- `supabase/migrations/20260615120000_fix_fund_transfer_petty_cash_on_conflict.sql`

Existing repair migration corrected:

- `supabase/migrations/20260430113000_repair_missing_petty_cash_and_journal_links.sql`

Change:

```sql
ON CONFLICT (fund_transfer_id) WHERE fund_transfer_id IS NOT NULL DO NOTHING;
```

No frontend change was required.

## Verification Report

Static verification completed:

- Fund Transfer -> Bank to Petty Cash: now uses a conflict target that matches `idx_petty_cash_transactions_fund_transfer_unique`
- Fund Transfer -> Bank to Bank: unaffected because the petty-cash insert branch does not run
- Fund Transfer linked to bank statement: unaffected; links are handled by `trigger_fund_transfer_bank_links_insert/update`
- Edit: unaffected; direct `fund_transfers` update path remains unchanged
- Delete: unaffected; existing cleanup of linked petty cash rows and bank-statement matches remains unchanged

Live database verification was not executed because the workspace `.env` contains only the browser Supabase anon key and URL, not a service-role key or direct database URL. To verify against production, apply the migration and create:

- Bank -> Petty Cash transfer with a selected source bank statement line
- Bank -> Bank transfer with selected source/destination bank statement lines
- Edit each transfer and confirm statement links update
- Delete each transfer and confirm linked petty cash rows and statement matches are cleared
