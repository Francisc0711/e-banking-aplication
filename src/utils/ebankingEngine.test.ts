import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_ACCOUNTS_TXT,
  INITIAL_TRANSACTIONS_TXT,
  INITIAL_BENEFICIARIES_TXT,
  INITIAL_AUDIT_LOG_TXT,
  parseAccountsFromText,
  serializeAccountsToText,
  parseTransactionsFromText,
  serializeTransactionsToText,
  parseBeneficiariesFromText,
  serializeBeneficiariesToText,
  computeTotalsByTypeVector,
  convertCurrencyWithVector,
  executeTransaction,
  createBankAccount,
  addSavedBeneficiary,
  updateAccountDailyLimit,
  importFileToState,
  reverseTransaction,
  updateTransactionDescription,
  type EBankingState,
} from './ebankingEngine.ts';

function createInitialState(): EBankingState {
  return {
    accounts: parseAccountsFromText(INITIAL_ACCOUNTS_TXT),
    transactions: parseTransactionsFromText(INITIAL_TRANSACTIONS_TXT),
    beneficiaries: parseBeneficiariesFromText(INITIAL_BENEFICIARIES_TXT),
    auditLog: INITIAL_AUDIT_LOG_TXT,
    lastSavedAt: '2026-10-19 09:00',
  };
}

test('parses and serializes accounts.txt symmetrically', () => {
  const accounts = parseAccountsFromText(INITIAL_ACCOUNTS_TXT);
  assert.equal(accounts.length, 4);
  assert.equal(accounts[0].iban, 'RO49AAAA1B31007593840000');
  assert.equal(accounts[0].balance, 14850.5);
  assert.equal(accounts[3].currency, 'EUR');

  const serialized = serializeAccountsToText(accounts);
  const reparsed = parseAccountsFromText(serialized);
  assert.deepEqual(reparsed, accounts);
});

test('parses and serializes transactions.txt symmetrically', () => {
  const transactions = parseTransactionsFromText(INITIAL_TRANSACTIONS_TXT);
  assert.equal(transactions.length, 5);
  assert.equal(transactions[0].id, 'TX-1005');
  assert.equal(transactions[0].type, 'TRANSFER');

  const serialized = serializeTransactionsToText(transactions);
  const reparsed = parseTransactionsFromText(serialized);
  assert.deepEqual(reparsed, transactions);
});

test('parses and serializes beneficiaries.txt symmetrically', () => {
  const list = parseBeneficiariesFromText(INITIAL_BENEFICIARIES_TXT);
  assert.equal(list.length, 4);
  const serialized = serializeBeneficiariesToText(list);
  assert.deepEqual(parseBeneficiariesFromText(serialized), list);
});

test('computes double[4] vector totals by transaction type accurately', () => {
  const transactions = parseTransactionsFromText(INITIAL_TRANSACTIONS_TXT);
  const vector = computeTotalsByTypeVector(transactions);
  assert.deepEqual(vector, [4650.0, 480.5, 5000.0, 600.0]);
});

test('converts currencies using BNR exchange rates vector (RON, EUR, USD)', () => {
  const bnrVector = [1.0, 4.9765, 4.5820];
  // 497.65 RON -> 100.00 EUR
  const ronToEur = convertCurrencyWithVector(497.65, 'RON', 'EUR', bnrVector);
  assert.equal(ronToEur.convertedAmount, 100.0);

  // 100 EUR -> 497.65 RON
  const eurToRon = convertCurrencyWithVector(100, 'EUR', 'RON', bnrVector);
  assert.equal(eurToRon.convertedAmount, 497.65);
});

test('executes cross-currency transfer (RON -> EUR) using BNR rates and appends audit log', () => {
  const initialState = createInitialState();
  const bnrVector = [1.0, 5.0, 4.5]; // 1 EUR = 5.00 RON for exact test math

  const { nextState, created } = executeTransaction(initialState, {
    type: 'TRANSFER',
    sourceIban: 'RO49AAAA1B31007593840000', // RON
    targetIban: 'RO55DDDD1B31007593843333', // EUR
    amount: 500.0,
    description: 'Alimentare cont valuta EUR',
    exchangeRatesVector: bnrVector,
  });

  assert.equal(created.id, 'TX-1006');
  const srcRon = nextState.accounts.find((a) => a.iban === 'RO49AAAA1B31007593840000')!;
  const destEur = nextState.accounts.find((a) => a.iban === 'RO55DDDD1B31007593843333')!;
  assert.equal(srcRon.balance, 14350.5); // 14850.50 - 500 RON
  assert.equal(destEur.balance, 3250.0); // 3150.00 + 100 EUR
  assert.ok(nextState.auditLog.includes('TX-1006 executată'));
});

test('creates a new EUR bank account and logs initial deposit', () => {
  const initialState = createInitialState();

  const { nextState, createdAccount } = createBankAccount(initialState, {
    owner: 'Cristina Dumitrescu (Economii EUR)',
    initialBalance: 1200,
    dailyLimit: 5000,
    currency: 'EUR',
  });

  assert.equal(nextState.accounts.length, 5);
  assert.equal(createdAccount.currency, 'EUR');
  assert.equal(createdAccount.balance, 1200);
  assert.equal(nextState.transactions[0].currency, 'EUR');
});

test('saves a new beneficiary to beneficiaries.txt', () => {
  const initialState = createInitialState();
  const nextState = addSavedBeneficiary(initialState, {
    name: 'Proprietar Chirie',
    iban: 'RO77INGB0000111122223333',
    category: 'Locuință',
    defaultDescription: 'Chirie lunară apartament',
  });
  assert.equal(nextState.beneficiaries.length, 5);
  assert.ok(nextState.auditLog.includes('Proprietar Chirie'));
});

test('reverses transaction and restores balances', () => {
  const initialState = createInitialState();
  const afterReverse = reverseTransaction(initialState, 'TX-1002');
  const reversedTx = afterReverse.transactions.find((t) => t.id === 'TX-1002')!;
  assert.equal(reversedTx.status, 'REVERSED');

  const src = afterReverse.accounts.find((a) => a.iban === 'RO49AAAA1B31007593840000')!;
  const dest = afterReverse.accounts.find((a) => a.iban === 'RO12BBBB1B31007593841111')!;
  assert.equal(src.balance, 16100.5);
  assert.equal(dest.balance, 7070.0);
});

test('updates transaction description cleanly', () => {
  const initialState = createInitialState();
  const updated = updateTransactionDescription(
    initialState,
    'TX-1003',
    'Factura servere dedicata'
  );
  assert.equal(
    updated.transactions.find((t) => t.id === 'TX-1003')?.description,
    'Factura servere dedicata'
  );
});

test('updates account daily limit and enforces it on subsequent transactions', () => {
  const initialState = createInitialState();
  const updated = updateAccountDailyLimit(
    initialState,
    'RO49AAAA1B31007593840000',
    1200
  );
  const acc = updated.accounts.find((a) => a.iban === 'RO49AAAA1B31007593840000')!;
  assert.equal(acc.dailyLimit, 1200);

  assert.throws(() => {
    executeTransaction(updated, {
      type: 'TRANSFER',
      sourceIban: 'RO49AAAA1B31007593840000',
      targetIban: 'RO12BBBB1B31007593841111',
      amount: 1500,
      description: 'Test depasire plafon cont',
    });
  }, /depășește plafonul zilnic setat pe contul/);
});

test('imports external .txt content into state cleanly', () => {
  const initialState = createInitialState();
  const customAccountsTxt =
    'RO99TEST1B31007500001111;Cont Importat Test;7500.00;RON;30000.00';
  const afterImport = importFileToState(initialState, 'accounts.txt', customAccountsTxt);
  assert.equal(afterImport.accounts.length, 1);
  assert.equal(afterImport.accounts[0].owner, 'Cont Importat Test');
  assert.ok(afterImport.auditLog.includes('importat manual'));
});

