-- Rollback for HFR-260603 historical finance repair.
-- Run only if the corresponding repair needs to be reversed.
BEGIN;

UPDATE products
SET current_stock = 50,
    updated_at = now()
WHERE id = '4fd7e5b5-1226-4044-b9bd-e16e1e8a516a';
UPDATE batches
SET current_stock = 0,
    updated_at = now()
WHERE id = 'cb5539e0-4c14-4086-ba30-92cf194d5db2';
DELETE FROM inventory_transactions
WHERE id = '7372f0f6-b2a2-47ad-9627-428566832b7e';


UPDATE products
SET current_stock = 1449,
    updated_at = now()
WHERE id = '3e5fd03d-c2b6-4507-8333-8a1ea8b9decc';
UPDATE batches
SET current_stock = 1449,
    updated_at = now()
WHERE id = '0db25472-29a7-432f-a847-938f64aab7b0';
DELETE FROM inventory_transactions
WHERE id = 'af0049b7-f2c8-4311-a95c-5c93b79599ed';


UPDATE journal_entries
SET total_debit = 71581,
    total_credit = 70598.5
WHERE id = 'd403aeb3-13b9-4e17-a3a5-95653dbc1941';
DELETE FROM journal_entry_lines
WHERE id = '365d26d1-e6f4-4883-bf05-49893db22149';


UPDATE journal_entries
SET total_debit = 4684685,
    total_credit = 5200000.35
WHERE id = 'd94350f4-37b7-434c-96b0-73b11e06cb9d';
DELETE FROM journal_entry_lines
WHERE id = 'f4b7022b-a0c4-4419-a7d3-6f0297470756';


UPDATE journal_entries
SET total_debit = 4684685,
    total_credit = 5200000.35
WHERE id = '3bb7a82a-5f44-4585-b7a7-1e78bc3e4770';
DELETE FROM journal_entry_lines
WHERE id = 'f088247e-1b1d-4b4a-ae9c-5f45c04b53e8';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '2a5be477-3b96-4598-be72-9ccbe8dae296';
DELETE FROM journal_entries
WHERE id = '2a5be477-3b96-4598-be72-9ccbe8dae296';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '6542ed89-80ff-4695-8183-ed72e0c068b3';
DELETE FROM journal_entries
WHERE id = '6542ed89-80ff-4695-8183-ed72e0c068b3';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '47ca969c-69dc-4541-96f2-0f6a6a47df36';
DELETE FROM journal_entries
WHERE id = '47ca969c-69dc-4541-96f2-0f6a6a47df36';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '5d4f64f8-e6de-42c7-b188-301baf9d4fb3';
DELETE FROM journal_entries
WHERE id = '5d4f64f8-e6de-42c7-b188-301baf9d4fb3';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'cb74bbeb-cf38-40d5-bb48-dbb651e885b9';
DELETE FROM journal_entries
WHERE id = 'cb74bbeb-cf38-40d5-bb48-dbb651e885b9';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '7e537a53-795a-4308-84f4-a660376b222e';
DELETE FROM journal_entries
WHERE id = '7e537a53-795a-4308-84f4-a660376b222e';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '2bec1072-99e6-45d9-a8b3-663727734377';
DELETE FROM journal_entries
WHERE id = '2bec1072-99e6-45d9-a8b3-663727734377';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'fb145f49-e6fc-4dd5-bbf6-148f25c17bc8';
DELETE FROM journal_entries
WHERE id = 'fb145f49-e6fc-4dd5-bbf6-148f25c17bc8';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '21c8bd8e-e432-47f4-9686-89bb3cefbca1';
DELETE FROM journal_entries
WHERE id = '21c8bd8e-e432-47f4-9686-89bb3cefbca1';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'd27ce89c-d195-4a25-807d-762cd359bab8';
DELETE FROM journal_entries
WHERE id = 'd27ce89c-d195-4a25-807d-762cd359bab8';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '8b809b8c-e0fc-42fa-9a2e-533aa2d443f8';
DELETE FROM journal_entries
WHERE id = '8b809b8c-e0fc-42fa-9a2e-533aa2d443f8';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '4754a66b-fa6c-43fb-93d3-10fae8d601fb';
DELETE FROM journal_entries
WHERE id = '4754a66b-fa6c-43fb-93d3-10fae8d601fb';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'c8a09161-c214-4f5e-8576-b4bb7821b2d6';
DELETE FROM journal_entries
WHERE id = 'c8a09161-c214-4f5e-8576-b4bb7821b2d6';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '74745077-4a4a-4445-8ec1-7769839131b5';
DELETE FROM journal_entries
WHERE id = '74745077-4a4a-4445-8ec1-7769839131b5';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '26887c6a-27a8-47ea-a381-c967775c8d96';
DELETE FROM journal_entries
WHERE id = '26887c6a-27a8-47ea-a381-c967775c8d96';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '43c268b8-ab59-4054-b06c-d23608b966a5';
DELETE FROM journal_entries
WHERE id = '43c268b8-ab59-4054-b06c-d23608b966a5';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'c96c783b-37a7-4923-a499-0c41383853f3';
DELETE FROM journal_entries
WHERE id = 'c96c783b-37a7-4923-a499-0c41383853f3';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'ab00d4be-914c-4f67-8181-c24481f3f5f6';
DELETE FROM journal_entries
WHERE id = 'ab00d4be-914c-4f67-8181-c24481f3f5f6';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '60f67a78-42b1-448f-a43b-aab323004ceb';
DELETE FROM journal_entries
WHERE id = '60f67a78-42b1-448f-a43b-aab323004ceb';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '401172e7-17c5-49b6-badd-178d78b05bb9';
DELETE FROM journal_entries
WHERE id = '401172e7-17c5-49b6-badd-178d78b05bb9';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '41676a4a-4265-42ae-8157-b52b338ef306';
DELETE FROM journal_entries
WHERE id = '41676a4a-4265-42ae-8157-b52b338ef306';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'efa6c648-ded5-44c9-94be-b78759c6f0fe';
DELETE FROM journal_entries
WHERE id = 'efa6c648-ded5-44c9-94be-b78759c6f0fe';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '5e68d6f0-da7b-4eb4-8311-4bb30e2dedb3';
DELETE FROM journal_entries
WHERE id = '5e68d6f0-da7b-4eb4-8311-4bb30e2dedb3';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '49b534b6-dc2c-4b56-94fe-57fcab4683b9';
DELETE FROM journal_entries
WHERE id = '49b534b6-dc2c-4b56-94fe-57fcab4683b9';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '0ff4374f-fdc5-417c-ab05-38be78c85680';
DELETE FROM journal_entries
WHERE id = '0ff4374f-fdc5-417c-ab05-38be78c85680';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '63a644d8-de87-4acc-8fa6-958c55965986';
DELETE FROM journal_entries
WHERE id = '63a644d8-de87-4acc-8fa6-958c55965986';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '4bdccab1-2e17-4fd9-8aa3-44a56369037f';
DELETE FROM journal_entries
WHERE id = '4bdccab1-2e17-4fd9-8aa3-44a56369037f';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'acf6c7df-7b7c-4410-9763-10e0e246c1b3';
DELETE FROM journal_entries
WHERE id = 'acf6c7df-7b7c-4410-9763-10e0e246c1b3';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '040ef65b-4d4e-4e41-9af7-63ce80040ebb';
DELETE FROM journal_entries
WHERE id = '040ef65b-4d4e-4e41-9af7-63ce80040ebb';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'b0be771b-b584-461e-959b-691c11bc0741';
DELETE FROM journal_entries
WHERE id = 'b0be771b-b584-461e-959b-691c11bc0741';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = '865d8c69-6896-4e39-84d9-38b24779ff86';
DELETE FROM journal_entries
WHERE id = '865d8c69-6896-4e39-84d9-38b24779ff86';


DELETE FROM journal_entry_lines
WHERE journal_entry_id = 'b3b07872-fcd6-4e3e-956e-436054572805';
DELETE FROM journal_entries
WHERE id = 'b3b07872-fcd6-4e3e-956e-436054572805';

COMMIT;