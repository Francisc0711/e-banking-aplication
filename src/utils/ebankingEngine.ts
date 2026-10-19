export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'PAYMENT';
export type TransactionStatus = 'COMPLETED' | 'REVERSED';
export type SupportedCurrency = 'RON' | 'EUR' | 'USD';
export type AuditLogLevel = 'INFO' | 'WARN' | 'SECURITY' | 'ERROR';

export interface BankAccount {
  iban: string;
  owner: string;
  balance: number;
  currency: SupportedCurrency;
  dailyLimit: number;
}

export interface Transaction {
  id: string;
  timestamp: string;
  type: TransactionType;
  sourceIban: string;
  targetIban: string;
  amount: number;
  currency: SupportedCurrency;
  description: string;
  status: TransactionStatus;
}

export interface SavedBeneficiary {
  name: string;
  iban: string;
  category: string;
  defaultDescription: string;
}

export interface EBankingState {
  accounts: BankAccount[];
  transactions: Transaction[];
  beneficiaries: SavedBeneficiary[];
  auditLog: string;
  lastSavedAt: string;
}

export const CURRENCIES_VECTOR: SupportedCurrency[] = ['RON', 'EUR', 'USD'];

// Vector paralel cu CURRENCIES_VECTOR: cursul în RON pentru [RON, EUR, USD]
export const DEFAULT_EXCHANGE_RATES_VECTOR: number[] = [1.0, 4.9765, 4.5820];

export const HIGH_VALUE_THRESHOLD_RON = 5000.0;
export const DEFAULT_SECURITY_PIN = '1234';

export const TRANSACTION_TYPES: TransactionType[] = [
  'TRANSFER',
  'PAYMENT',
  'DEPOSIT',
  'WITHDRAWAL',
];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  TRANSFER: 'Transfer IBAN',
  PAYMENT: 'Plată Factură',
  DEPOSIT: 'Alimentare Cont',
  WITHDRAWAL: 'Retragere ATM',
};

export const DAILY_LIMITS_VECTOR: number[] = [25000.0, 15000.0, 50000.0, 10000.0];

export const INITIAL_ACCOUNTS_TXT = `RO49AAAA1B31007593840000;Andrei Popescu (Cont Curent);14850.50;RON;25000.00
RO12BBBB1B31007593841111;Elena Ionescu (Cont Economii);8320.00;RON;15000.00
RO88CCCC1B31007593842222;SC TechSolutions SRL (Business);64200.75;RON;50000.00
RO55DDDD1B31007593843333;Andrei Popescu (Cont Valută EUR);3150.00;EUR;10000.00`;

export const INITIAL_TRANSACTIONS_TXT = `TX-1005;2026-10-19 08:20;TRANSFER;RO88CCCC1B31007593842222;RO49AAAA1B31007593840000;3400.00;RON;Onorariu consultanta dezvoltare software;COMPLETED
TX-1004;2026-10-18 16:45;WITHDRAWAL;RO55DDDD1B31007593843333;ATM-BUCURESTI-04;600.00;RON;Retragere numerar ATM Victoriei;COMPLETED
TX-1003;2026-10-17 11:05;PAYMENT;RO12BBBB1B31007593841111;RO88CCCC1B31007593842222;480.50;RON;Achizitie licente si echipamente IT;COMPLETED
TX-1002;2026-10-16 14:30;TRANSFER;RO49AAAA1B31007593840000;RO12BBBB1B31007593841111;1250.00;RON;Transfer economii lunare;COMPLETED
TX-1001;2026-10-15 09:14;DEPOSIT;CASH-DESK;RO49AAAA1B31007593840000;5000.00;RON;Incasare drepturi salariale;COMPLETED`;

export const INITIAL_BENEFICIARIES_TXT = `PPC Energie (Enel);RO66BACX0000001234567890;Energie Electrică;Plată factură energie electrică
Digi România (RCS & RDS);RO44INGB0000999900112233;Telecomunicații & Internet;Abonament fibră și telefonie
Apa Nova București;RO21BRDE410SV11223344556;Apă și Canalizare;Factură utilități apă rece
Trezoreria Statului (ANAF);RO90TREZ70020A470100XXXX;Taxe și Impozite;Plată obligații bugetare`;

export const INITIAL_AUDIT_LOG_TXT = `2026-10-19 08:20 | INFO | TX-1005 executată: TRANSFER 3400.00 RON (RO88CCCC1B31007593842222 -> RO49AAAA1B31007593840000)
2026-10-18 16:45 | INFO | TX-1004 executată: WITHDRAWAL 600.00 RON (RO55DDDD1B31007593843333 -> ATM-BUCURESTI-04)
2026-10-17 11:05 | INFO | TX-1003 executată: PAYMENT 480.50 RON (RO12BBBB1B31007593841111 -> RO88CCCC1B31007593842222)
2026-10-16 14:30 | INFO | TX-1002 executată: TRANSFER 1250.00 RON (RO49AAAA1B31007593840000 -> RO12BBBB1B31007593841111)
2026-10-15 09:14 | SECURITY | TX-1001 autorizată cu PIN (valoare >= 5000 RON): DEPOSIT 5000.00 RON`;

export const SAVED_BENEFICIARIES: SavedBeneficiary[] = parseBeneficiariesFromText(
  INITIAL_BENEFICIARIES_TXT
);

export function formatCurrentTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
}

export function appendAuditLog(
  currentLog: string,
  level: AuditLogLevel,
  message: string,
  timestamp?: string
): string {
  const ts = timestamp || formatCurrentTimestamp();
  const entry = `${ts} | ${level} | ${message}`;
  return currentLog.trim() ? `${entry}\n${currentLog.trim()}` : entry;
}

export function convertCurrencyWithVector(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesVector: number[] = DEFAULT_EXCHANGE_RATES_VECTOR
): { convertedAmount: number; rateUsed: number; amountInRon: number } {
  const fromIdx = Math.max(0, CURRENCIES_VECTOR.indexOf(fromCurrency as SupportedCurrency));
  const toIdx = Math.max(0, CURRENCIES_VECTOR.indexOf(toCurrency as SupportedCurrency));

  const fromRateToRon = ratesVector[fromIdx] || 1.0;
  const toRateToRon = ratesVector[toIdx] || 1.0;

  const amountInRon = Number((amount * fromRateToRon).toFixed(2));
  if (fromCurrency === toCurrency) {
    return {
      convertedAmount: Number(amount.toFixed(2)),
      rateUsed: 1.0,
      amountInRon,
    };
  }

  const rateUsed = Number((fromRateToRon / toRateToRon).toFixed(4));
  const convertedAmount = Number(((amount * fromRateToRon) / toRateToRon).toFixed(2));

  return {
    convertedAmount,
    rateUsed,
    amountInRon,
  };
}

export function parseAccountsFromText(text: string): BankAccount[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(';');
      if (parts.length < 5) {
        throw new Error(`Format invalid în accounts.txt: ${line}`);
      }
      const rawCurr = parts[3].trim().toUpperCase();
      const currency: SupportedCurrency =
        rawCurr === 'EUR' || rawCurr === 'USD' ? rawCurr : 'RON';
      return {
        iban: parts[0].trim(),
        owner: parts[1].trim(),
        balance: Number(parseFloat(parts[2]).toFixed(2)),
        currency,
        dailyLimit: Number(parseFloat(parts[4]).toFixed(2)),
      };
    });
}

export function serializeAccountsToText(accounts: BankAccount[]): string {
  return accounts
    .map(
      (a) =>
        `${a.iban};${a.owner.replace(/;/g, ',')};${a.balance.toFixed(2)};${a.currency};${a.dailyLimit.toFixed(2)}`
    )
    .join('\n');
}

export function parseTransactionsFromText(text: string): Transaction[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(';');
      if (parts.length < 9) {
        throw new Error(`Format invalid în transactions.txt: ${line}`);
      }
      const rawCurr = parts[6].trim().toUpperCase();
      const currency: SupportedCurrency =
        rawCurr === 'EUR' || rawCurr === 'USD' ? rawCurr : 'RON';
      return {
        id: parts[0].trim(),
        timestamp: parts[1].trim(),
        type: parts[2].trim() as TransactionType,
        sourceIban: parts[3].trim(),
        targetIban: parts[4].trim(),
        amount: Number(parseFloat(parts[5]).toFixed(2)),
        currency,
        description: parts[7].trim(),
        status: (parts[8].trim() as TransactionStatus) || 'COMPLETED',
      };
    });
}

export function serializeTransactionsToText(transactions: Transaction[]): string {
  return transactions
    .map(
      (t) =>
        `${t.id};${t.timestamp};${t.type};${t.sourceIban};${t.targetIban};${t.amount.toFixed(2)};${t.currency};${t.description.replace(/;/g, ',')};${t.status}`
    )
    .join('\n');
}

export function parseBeneficiariesFromText(text: string): SavedBeneficiary[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(';');
      if (parts.length < 4) {
        throw new Error(`Format invalid în beneficiaries.txt: ${line}`);
      }
      return {
        name: parts[0].trim(),
        iban: parts[1].trim(),
        category: parts[2].trim(),
        defaultDescription: parts[3].trim(),
      };
    });
}

export function serializeBeneficiariesToText(beneficiaries: SavedBeneficiary[]): string {
  return beneficiaries
    .map(
      (b) =>
        `${b.name.replace(/;/g, ',')};${b.iban.trim()};${b.category.replace(/;/g, ',')};${b.defaultDescription.replace(/;/g, ',')}`
    )
    .join('\n');
}

export function addSavedBeneficiary(
  state: EBankingState,
  beneficiary: SavedBeneficiary
): EBankingState {
  const cleanName = beneficiary.name.trim();
  const cleanIban = beneficiary.iban.trim().toUpperCase();
  if (!cleanName || !cleanIban) {
    throw new Error('Numele și IBAN-ul beneficiarului sunt obligatorii.');
  }

  const existingIbans = new Set((state.beneficiaries || []).map((b) => b.iban.toUpperCase()));
  if (existingIbans.has(cleanIban)) {
    return state;
  }

  const created: SavedBeneficiary = {
    name: cleanName,
    iban: cleanIban,
    category: beneficiary.category.trim() || 'Partener Salvat',
    defaultDescription: beneficiary.defaultDescription.trim() || `Plată către ${cleanName}`,
  };

  const ts = formatCurrentTimestamp();
  return {
    ...state,
    beneficiaries: [...(state.beneficiaries || []), created],
    auditLog: appendAuditLog(
      state.auditLog || '',
      'INFO',
      `Beneficiar nou salvat în beneficiaries.txt: ${cleanName} (${cleanIban})`,
      ts
    ),
    lastSavedAt: ts,
  };
}

/**
 * Calculează vectorul (double[4]) cu sumele totale (echivalent RON) pe fiecare tip de tranzacție:
 * Index 0: TRANSFER, Index 1: PAYMENT, Index 2: DEPOSIT, Index 3: WITHDRAWAL
 */
export function computeTotalsByTypeVector(
  transactions: Transaction[],
  ratesVector: number[] = DEFAULT_EXCHANGE_RATES_VECTOR
): number[] {
  const vector: number[] = [0.0, 0.0, 0.0, 0.0];
  for (const tx of transactions) {
    if (tx.status !== 'COMPLETED') continue;
    const typeIndex = TRANSACTION_TYPES.indexOf(tx.type);
    if (typeIndex !== -1) {
      const { amountInRon } = convertCurrencyWithVector(
        tx.amount,
        tx.currency,
        'RON',
        ratesVector
      );
      vector[typeIndex] = Number((vector[typeIndex] + amountInRon).toFixed(2));
    }
  }
  return vector;
}

export function computeCashflowMetrics(
  transactions: Transaction[],
  selectedIban: string | null,
  knownAccounts: BankAccount[],
  ratesVector: number[] = DEFAULT_EXCHANGE_RATES_VECTOR
): { inflows: number; outflows: number; net: number } {
  const internalIbans = new Set(knownAccounts.map((a) => a.iban));
  let inflows = 0;
  let outflows = 0;

  for (const tx of transactions) {
    if (tx.status !== 'COMPLETED') continue;
    const { amountInRon } = convertCurrencyWithVector(
      tx.amount,
      tx.currency,
      'RON',
      ratesVector
    );

    if (selectedIban) {
      if (tx.targetIban === selectedIban) {
        inflows += amountInRon;
      }
      if (tx.sourceIban === selectedIban) {
        outflows += amountInRon;
      }
    } else {
      if (tx.type === 'DEPOSIT') {
        inflows += amountInRon;
      } else if (tx.type === 'WITHDRAWAL') {
        outflows += amountInRon;
      } else if (tx.type === 'PAYMENT' || tx.type === 'TRANSFER') {
        if (!internalIbans.has(tx.targetIban)) {
          outflows += amountInRon;
        } else {
          inflows += amountInRon;
          outflows += amountInRon;
        }
      }
    }
  }

  return {
    inflows: Number(inflows.toFixed(2)),
    outflows: Number(outflows.toFixed(2)),
    net: Number((inflows - outflows).toFixed(2)),
  };
}

export function getUniqueTransactionIdsSet(transactions: Transaction[]): Set<string> {
  return new Set(transactions.map((t) => t.id));
}

export interface CreateTransactionInput {
  type: TransactionType;
  sourceIban: string;
  targetIban: string;
  amount: number;
  description: string;
  exchangeRatesVector?: number[];
  pinVerified?: boolean;
  customId?: string;
  customTimestamp?: string;
}

export function executeTransaction(
  state: EBankingState,
  input: CreateTransactionInput
): { nextState: EBankingState; created: Transaction } {
  const ratesVector = input.exchangeRatesVector || DEFAULT_EXCHANGE_RATES_VECTOR;
  const cleanDescription = input.description.trim();
  if (!cleanDescription) {
    throw new Error('Detaliile plății sunt obligatorii.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Suma tranzacției trebuie să fie strict pozitivă (> 0).');
  }

  const accountMap = new Map<string, BankAccount>();
  for (const acc of state.accounts) {
    accountMap.set(acc.iban, { ...acc });
  }

  let sourceIban = input.sourceIban.trim();
  let targetIban = input.targetIban.trim();

  // Determine operation currency based on active account
  let txCurrency: SupportedCurrency = 'RON';
  if (input.type === 'DEPOSIT') {
    const destAcc = accountMap.get(targetIban);
    if (destAcc) txCurrency = destAcc.currency;
  } else {
    const srcAcc = accountMap.get(sourceIban);
    if (srcAcc) txCurrency = srcAcc.currency;
  }

  const { amountInRon } = convertCurrencyWithVector(
    input.amount,
    txCurrency,
    'RON',
    ratesVector
  );

  const typeIndex = TRANSACTION_TYPES.indexOf(input.type);
  const maxAllowedForType = DAILY_LIMITS_VECTOR[typeIndex] ?? 25000;
  if (amountInRon > maxAllowedForType) {
    throw new Error(
      `Suma (${amountInRon.toFixed(2)} RON) depășește plafonul pe operațiune pentru ${TRANSACTION_TYPE_LABELS[input.type]} (${maxAllowedForType.toFixed(2)} RON).`
    );
  }

  const existingIds = getUniqueTransactionIdsSet(state.transactions);
  const nextNumericId =
    state.transactions.reduce((max, t) => {
      const num = parseInt(t.id.replace(/\D/g, ''), 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 1000) + 1;
  const txId = input.customId || `TX-${nextNumericId}`;

  if (existingIds.has(txId)) {
    throw new Error(`Referința tranzacției există deja: ${txId}`);
  }

  // Check account-specific daily limit if source account is internal
  if (input.type !== 'DEPOSIT') {
    const srcAccForLimit = accountMap.get(sourceIban);
    if (srcAccForLimit && amountInRon > srcAccForLimit.dailyLimit) {
      throw new Error(
        `Suma (${amountInRon.toFixed(2)} RON) depășește plafonul zilnic setat pe contul ${srcAccForLimit.owner} (${srcAccForLimit.dailyLimit.toFixed(2)} RON).`
      );
    }
  }

  let finalDescription = cleanDescription;

  if (input.type === 'DEPOSIT') {
    sourceIban = 'CASH-DESK';
    const destAcc = accountMap.get(targetIban);
    if (!destAcc) {
      throw new Error('Contul destinație pentru alimentare nu a fost găsit.');
    }
    destAcc.balance = Number((destAcc.balance + input.amount).toFixed(2));
  } else if (input.type === 'WITHDRAWAL') {
    targetIban = 'ATM-TERMINAL';
    const srcAcc = accountMap.get(sourceIban);
    if (!srcAcc) {
      throw new Error('Contul sursă pentru retragere nu a fost găsit.');
    }
    if (srcAcc.balance < input.amount) {
      throw new Error(
        `Fonduri insuficiente în contul ${srcAcc.iban} (Disponibil: ${srcAcc.balance.toFixed(2)} ${srcAcc.currency}).`
      );
    }
    srcAcc.balance = Number((srcAcc.balance - input.amount).toFixed(2));
  } else if (input.type === 'TRANSFER') {
    if (sourceIban === targetIban) {
      throw new Error('Contul plătitor și contul beneficiar nu pot fi identice.');
    }
    const srcAcc = accountMap.get(sourceIban);
    const destAcc = accountMap.get(targetIban);
    if (!srcAcc) {
      throw new Error('Contul plătitor nu a fost găsit.');
    }
    if (!destAcc && !targetIban.startsWith('RO')) {
      throw new Error('Codul IBAN al beneficiarului este invalid.');
    }
    if (srcAcc.balance < input.amount) {
      throw new Error(
        `Fonduri insuficiente pentru transfer (Disponibil: ${srcAcc.balance.toFixed(2)} ${srcAcc.currency}).`
      );
    }
    srcAcc.balance = Number((srcAcc.balance - input.amount).toFixed(2));
    if (destAcc) {
      if (srcAcc.currency !== destAcc.currency) {
        const { convertedAmount, rateUsed } = convertCurrencyWithVector(
          input.amount,
          srcAcc.currency,
          destAcc.currency,
          ratesVector
        );
        destAcc.balance = Number((destAcc.balance + convertedAmount).toFixed(2));
        finalDescription = `${cleanDescription} [Curs BNR: ${convertedAmount.toFixed(2)} ${destAcc.currency} @ ${rateUsed.toFixed(4)}]`;
      } else {
        destAcc.balance = Number((destAcc.balance + input.amount).toFixed(2));
      }
    }
  } else if (input.type === 'PAYMENT') {
    const srcAcc = accountMap.get(sourceIban);
    if (!srcAcc) {
      throw new Error('Contul plătitor nu a fost găsit.');
    }
    if (!targetIban) {
      targetIban = 'RO66BACX0000001234567890';
    }
    if (srcAcc.balance < input.amount) {
      throw new Error(
        `Fonduri insuficiente pentru plată (Disponibil: ${srcAcc.balance.toFixed(2)} ${srcAcc.currency}).`
      );
    }
    srcAcc.balance = Number((srcAcc.balance - input.amount).toFixed(2));
    const destAcc = accountMap.get(targetIban);
    if (destAcc) {
      const { convertedAmount } = convertCurrencyWithVector(
        input.amount,
        srcAcc.currency,
        destAcc.currency,
        ratesVector
      );
      destAcc.balance = Number((destAcc.balance + convertedAmount).toFixed(2));
    }
  }

  const formattedTime = input.customTimestamp || formatCurrentTimestamp();

  const created: Transaction = {
    id: txId,
    timestamp: formattedTime,
    type: input.type,
    sourceIban,
    targetIban,
    amount: Number(input.amount.toFixed(2)),
    currency: txCurrency,
    description: finalDescription,
    status: 'COMPLETED',
  };

  const auditLevel: AuditLogLevel = input.pinVerified ? 'SECURITY' : 'INFO';
  const auditMsg = input.pinVerified
    ? `${txId} autorizată cu PIN (valoare mare): ${input.type} ${created.amount.toFixed(2)} ${created.currency} (${sourceIban} -> ${targetIban})`
    : `${txId} executată: ${input.type} ${created.amount.toFixed(2)} ${created.currency} (${sourceIban} -> ${targetIban})`;

  return {
    created,
    nextState: {
      ...state,
      accounts: Array.from(accountMap.values()),
      transactions: [created, ...state.transactions],
      auditLog: appendAuditLog(state.auditLog || '', auditLevel, auditMsg, formattedTime),
      lastSavedAt: formattedTime,
    },
  };
}

export interface CreateAccountInput {
  owner: string;
  initialBalance: number;
  dailyLimit: number;
  currency?: SupportedCurrency;
}

export function createBankAccount(
  state: EBankingState,
  input: CreateAccountInput
): { nextState: EBankingState; createdAccount: BankAccount } {
  const cleanOwner = input.owner.trim();
  if (!cleanOwner) {
    throw new Error('Numele titularului / denumirea contului este obligatorie.');
  }
  if (!Number.isFinite(input.initialBalance) || input.initialBalance < 0) {
    throw new Error('Soldul inițial nu poate fi negativ.');
  }
  if (!Number.isFinite(input.dailyLimit) || input.dailyLimit <= 0) {
    throw new Error('Plafonul zilnic trebuie să fie strict pozitiv.');
  }

  const currency: SupportedCurrency = input.currency || 'RON';
  const index = state.accounts.length + 1;
  const suffix = String(4000 + index * 1111).padStart(8, '0');
  const generatedIban = `RO${String(10 + index * 7).slice(0, 2)}EBNK1B310075${suffix}`;

  const createdAccount: BankAccount = {
    iban: generatedIban,
    owner: cleanOwner,
    balance: Number(input.initialBalance.toFixed(2)),
    currency,
    dailyLimit: Number(input.dailyLimit.toFixed(2)),
  };

  const formattedTime = formatCurrentTimestamp();
  const nextAccounts = [...state.accounts, createdAccount];
  let nextTransactions = state.transactions;

  if (createdAccount.balance > 0) {
    const nextNumericId =
      state.transactions.reduce((max, t) => {
        const num = parseInt(t.id.replace(/\D/g, ''), 10);
        return Number.isFinite(num) && num > max ? num : max;
      }, 1000) + 1;

    const initialDepositTx: Transaction = {
      id: `TX-${nextNumericId}`,
      timestamp: formattedTime,
      type: 'DEPOSIT',
      sourceIban: 'CASH-DESK',
      targetIban: createdAccount.iban,
      amount: createdAccount.balance,
      currency,
      description: 'Depunere inițială la deschiderea contului',
      status: 'COMPLETED',
    };
    nextTransactions = [initialDepositTx, ...state.transactions];
  }

  return {
    createdAccount,
    nextState: {
      ...state,
      accounts: nextAccounts,
      transactions: nextTransactions,
      auditLog: appendAuditLog(
        state.auditLog || '',
        'INFO',
        `Cont bancar nou deschis: ${generatedIban} (${cleanOwner}, ${currency})`,
        formattedTime
      ),
      lastSavedAt: formattedTime,
    },
  };
}

export function updateAccountDailyLimit(
  state: EBankingState,
  iban: string,
  newDailyLimit: number
): EBankingState {
  if (!Number.isFinite(newDailyLimit) || newDailyLimit < 100) {
    throw new Error('Plafonul zilnic trebuie să fie de cel puțin 100 RON.');
  }
  const targetAcc = state.accounts.find((a) => a.iban === iban);
  if (!targetAcc) {
    throw new Error(`Contul ${iban} nu a fost găsit.`);
  }

  const ts = formatCurrentTimestamp();
  const nextAccounts = state.accounts.map((acc) =>
    acc.iban === iban
      ? { ...acc, dailyLimit: Number(newDailyLimit.toFixed(2)) }
      : acc
  );

  return {
    ...state,
    accounts: nextAccounts,
    auditLog: appendAuditLog(
      state.auditLog || '',
      'INFO',
      `Plafonul zilnic pentru ${targetAcc.owner} (${iban}) a fost actualizat la ${newDailyLimit.toFixed(2)} RON`,
      ts
    ),
    lastSavedAt: ts,
  };
}

export function importFileToState(
  state: EBankingState,
  fileType: 'transactions.txt' | 'accounts.txt' | 'beneficiaries.txt',
  rawContent: string
): EBankingState {
  const clean = rawContent.trim();
  if (!clean) {
    throw new Error(`Fișierul ${fileType} încărcat este gol.`);
  }

  const ts = formatCurrentTimestamp();

  if (fileType === 'accounts.txt') {
    const parsedAccounts = parseAccountsFromText(clean);
    if (parsedAccounts.length === 0) {
      throw new Error('Nu s-au găsit conturi valide în fișierul importat.');
    }
    return {
      ...state,
      accounts: parsedAccounts,
      auditLog: appendAuditLog(
        state.auditLog || '',
        'INFO',
        `Fișierul accounts.txt a fost importat manual (${parsedAccounts.length} conturi încărcate)`,
        ts
      ),
      lastSavedAt: ts,
    };
  }

  if (fileType === 'transactions.txt') {
    const parsedTransactions = parseTransactionsFromText(clean);
    if (parsedTransactions.length === 0) {
      throw new Error('Nu s-au găsit tranzacții valide în fișierul importat.');
    }
    return {
      ...state,
      transactions: parsedTransactions,
      auditLog: appendAuditLog(
        state.auditLog || '',
        'INFO',
        `Fișierul transactions.txt a fost importat manual (${parsedTransactions.length} tranzacții încărcate)`,
        ts
      ),
      lastSavedAt: ts,
    };
  }

  const parsedBeneficiaries = parseBeneficiariesFromText(clean);
  if (parsedBeneficiaries.length === 0) {
    throw new Error('Nu s-au găsit beneficiari valizi în fișierul importat.');
  }
  return {
    ...state,
    beneficiaries: parsedBeneficiaries,
    auditLog: appendAuditLog(
      state.auditLog || '',
      'INFO',
      `Fișierul beneficiaries.txt a fost importat manual (${parsedBeneficiaries.length} beneficiari încărcați)`,
      ts
    ),
    lastSavedAt: ts,
  };
}

export function reverseTransaction(
  state: EBankingState,
  txId: string,
  ratesVector: number[] = DEFAULT_EXCHANGE_RATES_VECTOR
): EBankingState {
  const targetTx = state.transactions.find((t) => t.id === txId);
  if (!targetTx) {
    throw new Error(`Tranzacția ${txId} nu există.`);
  }
  if (targetTx.status === 'REVERSED') {
    throw new Error(`Tranzacția ${txId} este deja stornată.`);
  }

  const accountMap = new Map<string, BankAccount>();
  for (const acc of state.accounts) {
    accountMap.set(acc.iban, { ...acc });
  }

  if (targetTx.type === 'DEPOSIT') {
    const destAcc = accountMap.get(targetTx.targetIban);
    if (destAcc) {
      if (destAcc.balance < targetTx.amount) {
        throw new Error('Sold insuficient în contul destinație pentru stornarea alimentării.');
      }
      destAcc.balance = Number((destAcc.balance - targetTx.amount).toFixed(2));
    }
  } else if (targetTx.type === 'WITHDRAWAL') {
    const srcAcc = accountMap.get(targetTx.sourceIban);
    if (srcAcc) {
      srcAcc.balance = Number((srcAcc.balance + targetTx.amount).toFixed(2));
    }
  } else if (targetTx.type === 'TRANSFER' || targetTx.type === 'PAYMENT') {
    const srcAcc = accountMap.get(targetTx.sourceIban);
    const destAcc = accountMap.get(targetTx.targetIban);
    const creditInDestCurrency = destAcc
      ? convertCurrencyWithVector(
          targetTx.amount,
          targetTx.currency,
          destAcc.currency,
          ratesVector
        ).convertedAmount
      : targetTx.amount;

    if (destAcc && destAcc.balance < creditInDestCurrency) {
      throw new Error('Beneficiarul nu are sold suficient pentru stornarea transferului.');
    }
    if (srcAcc) {
      srcAcc.balance = Number((srcAcc.balance + targetTx.amount).toFixed(2));
    }
    if (destAcc) {
      destAcc.balance = Number((destAcc.balance - creditInDestCurrency).toFixed(2));
    }
  }

  const nextTransactions = state.transactions.map((t) =>
    t.id === txId ? { ...t, status: 'REVERSED' as TransactionStatus } : t
  );

  const ts = formatCurrentTimestamp();
  return {
    ...state,
    accounts: Array.from(accountMap.values()),
    transactions: nextTransactions,
    auditLog: appendAuditLog(
      state.auditLog || '',
      'WARN',
      `Operațiunea ${txId} (${targetTx.amount.toFixed(2)} ${targetTx.currency}) a fost STORNATĂ`,
      ts
    ),
    lastSavedAt: ts,
  };
}

export function updateTransactionDescription(
  state: EBankingState,
  txId: string,
  newDescription: string
): EBankingState {
  const clean = newDescription.trim();
  if (!clean) {
    throw new Error('Detaliile plății nu pot fi goale.');
  }
  const exists = state.transactions.some((t) => t.id === txId);
  if (!exists) {
    throw new Error(`Tranzacția ${txId} nu a fost găsită.`);
  }

  const ts = formatCurrentTimestamp();
  return {
    ...state,
    transactions: state.transactions.map((t) =>
      t.id === txId ? { ...t, description: clean } : t
    ),
    auditLog: appendAuditLog(
      state.auditLog || '',
      'INFO',
      `Descrierea tranzacției ${txId} a fost actualizată în "${clean}"`,
      ts
    ),
    lastSavedAt: ts,
  };
}

export function generateBinaryHexPreview(transactions: Transaction[]): string {
  const header = 'AC ED 00 05 73 72 00 13 6A 61 76 61 2E 75 74 69  |....sr..java.uti|\n';
  const subHeader = '6C 2E 41 72 72 61 79 4C 69 73 74 78 81 D2 1D 99  |l.ArrayListx....|\n';
  const classDesc = 'C7 61 9D 03 00 01 49 00 04 73 69 7A 65 78 70 00  |.a....I..sizexp.|\n';

  const countHex = transactions.length.toString(16).padStart(4, '0').toUpperCase();
  const countLine = `00 ${countHex.slice(0, 2)} ${countHex.slice(2, 4)} 77 04 00 00 00 ${countHex.slice(
    2,
    4
  )} 73 72 00 1D 72 6F 2E  |...w.....sr..ro.|\n`;

  const rows = transactions.slice(0, 6).map((tx) => {
    const raw = `${tx.id}|${tx.type}|${tx.amount.toFixed(2)}|${tx.status}`;
    const bytes: string[] = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      const code = i < raw.length ? raw.charCodeAt(i) : 0;
      bytes.push(code.toString(16).padStart(2, '0').toUpperCase());
      ascii += code >= 32 && code <= 126 ? raw[i] : '.';
    }
    return `${bytes.join(' ')}  |${ascii}|`;
  });

  return `${header}${subHeader}${classDesc}${countLine}${rows.join('\n')}`;
}
