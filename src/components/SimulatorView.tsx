import React, { useState, useMemo, useRef } from 'react';
import {
  BankAccount,
  Transaction,
  TransactionType,
  SupportedCurrency,
  EBankingState,
  SavedBeneficiary,
  AuditLogLevel,
  CURRENCIES_VECTOR,
  HIGH_VALUE_THRESHOLD_RON,
  DEFAULT_SECURITY_PIN,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  DAILY_LIMITS_VECTOR,
  computeTotalsByTypeVector,
  computeCashflowMetrics,
  convertCurrencyWithVector,
  serializeAccountsToText,
  serializeTransactionsToText,
  serializeBeneficiariesToText,
  generateBinaryHexPreview,
  CreateTransactionInput,
  CreateAccountInput,
} from '../utils/ebankingEngine';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileCode,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Undo2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

export type ActiveSection = 'overview' | 'payments' | 'history' | 'files';

export interface BnrLiveInfo {
  date: string;
  source: string;
  ratesVector: number[];
  isLoading: boolean;
}

interface SimulatorViewProps {
  state: EBankingState;
  bnrInfo: BnrLiveInfo;
  onRefreshBnrRates: () => void;
  activeSection: ActiveSection;
  onNavigateSection: (section: ActiveSection) => void;
  onExecuteTransaction: (input: CreateTransactionInput) => void;
  onCreateAccount: (input: CreateAccountInput) => void;
  onAddBeneficiary: (beneficiary: SavedBeneficiary) => void;
  onUpdateAccountLimit: (iban: string, newLimit: number) => void;
  onImportFile: (
    fileType: 'transactions.txt' | 'accounts.txt' | 'beneficiaries.txt',
    rawContent: string
  ) => void;
  onLogAuditEvent: (level: AuditLogLevel, message: string) => void;
  onReverseTransaction: (txId: string) => void;
  onUpdateDescription: (txId: string, newDesc: string) => void;
  onResetToInitial: () => void;
  onReloadFromDisk: () => void;
  isNewAccountModalOpen: boolean;
  setIsNewAccountModalOpen: (open: boolean) => void;
}

function formatShortIban(iban: string): string {
  if (iban.length <= 12) return iban;
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  state,
  bnrInfo,
  onRefreshBnrRates,
  activeSection,
  onNavigateSection,
  onExecuteTransaction,
  onCreateAccount,
  onAddBeneficiary,
  onUpdateAccountLimit,
  onImportFile,
  onLogAuditEvent,
  onReverseTransaction,
  onUpdateDescription,
  onResetToInitial,
  onReloadFromDisk,
  isNewAccountModalOpen,
  setIsNewAccountModalOpen,
}) => {
  const [selectedAccountIban, setSelectedAccountIban] = useState<string | null>(null);
  const [copiedIban, setCopiedIban] = useState<string | null>(null);
  const [showLimitsDetails, setShowLimitsDetails] = useState<boolean>(false);

  // Edit Account Daily Limit Modal state
  const [editingLimitAccount, setEditingLimitAccount] = useState<BankAccount | null>(null);
  const [editLimitValue, setEditLimitValue] = useState<string>('');
  const [editLimitError, setEditLimitError] = useState<string | null>(null);

  const [txType, setTxType] = useState<TransactionType>('TRANSFER');
  const [sourceIban, setSourceIban] = useState<string>(
    state.accounts[0]?.iban || 'RO49AAAA1B31007593840000'
  );
  const [targetIban, setTargetIban] = useState<string>(
    state.accounts[3]?.iban || state.accounts[1]?.iban || 'RO55DDDD1B31007593843333'
  );
  const [amountInput, setAmountInput] = useState<string>('450.00');
  const [descriptionInput, setDescriptionInput] = useState<string>('Transfer interbancar');
  const [saveBeneficiaryChecked, setSaveBeneficiaryChecked] = useState<boolean>(false);
  const [newBeneficiaryName, setNewBeneficiaryName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // High-value PIN Confirmation Modal state
  const [pendingHighValueTx, setPendingHighValueTx] = useState<CreateTransactionInput | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // New Account Modal state
  const [newOwnerInput, setNewOwnerInput] = useState<string>('');
  const [newCurrencyInput, setNewCurrencyInput] = useState<SupportedCurrency>('RON');
  const [newBalanceInput, setNewBalanceInput] = useState<string>('5000.00');
  const [newLimitInput, setNewLimitInput] = useState<string>('20000.00');
  const [accountModalError, setAccountModalError] = useState<string | null>(null);

  // History Filters & Sorting
  const [filterType, setFilterType] = useState<'ALL' | TransactionType>('ALL');
  const [flowFilter, setFlowFilter] = useState<'ALL' | 'INFLOW' | 'OUTFLOW'>('ALL');
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('NEWEST');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected transaction for Details Modal
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isEditingInModal, setIsEditingInModal] = useState<boolean>(false);
  const [editingDescValue, setEditingDescValue] = useState<string>('');
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  // File Tab & Import Feedback
  const [activeFileTab, setActiveFileTab] = useState<
    'transactions.txt' | 'accounts.txt' | 'beneficiaries.txt' | 'audit.log' | 'transactions.dat'
  >('transactions.txt');
  const [fileImportNotice, setFileImportNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTx = useMemo(
    () => state.transactions.find((t) => t.id === selectedTxId) || null,
    [state.transactions, selectedTxId]
  );

  const vectorTotals = useMemo(
    () => computeTotalsByTypeVector(state.transactions, bnrInfo.ratesVector),
    [state.transactions, bnrInfo.ratesVector]
  );

  const totalPortfolioBalanceRon = useMemo(
    () =>
      state.accounts.reduce((sum, acc) => {
        const { amountInRon } = convertCurrencyWithVector(
          acc.balance,
          acc.currency,
          'RON',
          bnrInfo.ratesVector
        );
        return Number((sum + amountInRon).toFixed(2));
      }, 0),
    [state.accounts, bnrInfo.ratesVector]
  );

  const selectedAccountObj = useMemo(
    () => state.accounts.find((a) => a.iban === selectedAccountIban) || null,
    [state.accounts, selectedAccountIban]
  );

  const cashflow = useMemo(
    () =>
      computeCashflowMetrics(
        state.transactions,
        selectedAccountIban,
        state.accounts,
        bnrInfo.ratesVector
      ),
    [state.transactions, selectedAccountIban, state.accounts, bnrInfo.ratesVector]
  );

  const payerAccount = useMemo(
    () => state.accounts.find((a) => a.iban === sourceIban) || state.accounts[0],
    [state.accounts, sourceIban]
  );

  const destinationInternalAccount = useMemo(
    () => state.accounts.find((a) => a.iban === targetIban) || null,
    [state.accounts, targetIban]
  );

  const activeOperationCurrency: SupportedCurrency = useMemo(() => {
    if (txType === 'DEPOSIT' && destinationInternalAccount) {
      return destinationInternalAccount.currency;
    }
    return payerAccount?.currency || 'RON';
  }, [txType, destinationInternalAccount, payerAccount]);

  const fxPreview = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    if (txType !== 'TRANSFER' && txType !== 'PAYMENT') return null;
    if (!payerAccount || !destinationInternalAccount) return null;
    if (payerAccount.currency === destinationInternalAccount.currency) return null;

    const { convertedAmount, rateUsed } = convertCurrencyWithVector(
      parsed,
      payerAccount.currency,
      destinationInternalAccount.currency,
      bnrInfo.ratesVector
    );

    return {
      fromCurrency: payerAccount.currency,
      toCurrency: destinationInternalAccount.currency,
      convertedAmount,
      rateUsed,
    };
  }, [amountInput, txType, payerAccount, destinationInternalAccount, bnrInfo.ratesVector]);

  const filteredTransactions = useMemo(() => {
    const list = state.transactions.filter((tx) => {
      if (selectedAccountIban) {
        if (tx.sourceIban !== selectedAccountIban && tx.targetIban !== selectedAccountIban) {
          return false;
        }
      }
      if (filterType !== 'ALL' && tx.type !== filterType) return false;

      const isInflow =
        tx.type === 'DEPOSIT' ||
        (selectedAccountIban !== null && tx.targetIban === selectedAccountIban);
      if (flowFilter === 'INFLOW' && !isInflow) return false;
      if (flowFilter === 'OUTFLOW' && isInflow) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          tx.id.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q) ||
          tx.sourceIban.toLowerCase().includes(q) ||
          tx.targetIban.toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sortOrder === 'AMOUNT_DESC') {
      return [...list].sort((a, b) => b.amount - a.amount);
    }
    if (sortOrder === 'AMOUNT_ASC') {
      return [...list].sort((a, b) => a.amount - b.amount);
    }
    return list;
  }, [state.transactions, selectedAccountIban, filterType, flowFilter, sortOrder, searchQuery]);

  const recentTransactions = useMemo(
    () => filteredTransactions.slice(0, 5),
    [filteredTransactions]
  );

  const handleCopyIban = (iban: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(iban);
    setCopiedIban(iban);
    setTimeout(() => setCopiedIban(null), 1800);
  };

  const handleSelectAccountCard = (acc: BankAccount) => {
    if (selectedAccountIban === acc.iban) {
      setSelectedAccountIban(null);
    } else {
      setSelectedAccountIban(acc.iban);
      setSourceIban(acc.iban);
    }
  };

  const handleOpenEditLimitModal = (acc: BankAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLimitAccount(acc);
    setEditLimitValue(acc.dailyLimit.toFixed(2));
    setEditLimitError(null);
  };

  const handleSaveAccountLimit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLimitAccount) return;
    setEditLimitError(null);
    try {
      const parsed = parseFloat(editLimitValue);
      onUpdateAccountLimit(editingLimitAccount.iban, parsed);
      setEditingLimitAccount(null);
    } catch (err) {
      setEditLimitError(err instanceof Error ? err.message : 'Eroare la actualizarea plafonului.');
    }
  };

  const handleOpenTransactionDetails = (tx: Transaction) => {
    setSelectedTxId(tx.id);
    setEditingDescValue(tx.description);
    setIsEditingInModal(false);
    setModalFeedback(null);
  };

  const handleRepeatTransaction = (tx: Transaction) => {
    setTxType(tx.type);
    if (tx.type === 'DEPOSIT') {
      setTargetIban(tx.targetIban);
    } else if (tx.type === 'WITHDRAWAL') {
      setSourceIban(tx.sourceIban);
    } else {
      setSourceIban(tx.sourceIban);
      setTargetIban(tx.targetIban);
    }
    setAmountInput(tx.amount.toFixed(2));
    const cleanDesc = tx.description.replace(/\s*\[Curs BNR:.*?\]$/i, '').trim();
    setDescriptionInput(cleanDesc);
    setFormError(null);
    setFormSuccess(null);
    setSelectedTxId(null);
    onNavigateSection('payments');
  };

  const handleSelectBeneficiaryPreset = (b: SavedBeneficiary) => {
    setTxType('PAYMENT');
    setTargetIban(b.iban);
    setDescriptionInput(b.defaultDescription);
    setFormError(null);
  };

  const finalizeTransactionSubmission = (payload: CreateTransactionInput) => {
    try {
      onExecuteTransaction(payload);
      if (saveBeneficiaryChecked && newBeneficiaryName.trim() && payload.targetIban) {
        onAddBeneficiary({
          name: newBeneficiaryName.trim(),
          iban: payload.targetIban,
          category: 'Partener Salvat',
          defaultDescription: payload.description,
        });
        setSaveBeneficiaryChecked(false);
        setNewBeneficiaryName('');
      }
      setFormSuccess('Operațiunea a fost autorizată și salvată în fișiere.');
      setDescriptionInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Eroare la procesarea tranzacției.';
      setFormError(msg);
      onLogAuditEvent('WARN', `Tranzacție respinsă: ${msg}`);
    }
  };

  const handleSubmitTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const parsedAmount = parseFloat(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Suma tranzacției trebuie să fie strict pozitivă (> 0).');
      return;
    }

    const { amountInRon } = convertCurrencyWithVector(
      parsedAmount,
      activeOperationCurrency,
      'RON',
      bnrInfo.ratesVector
    );

    const txPayload: CreateTransactionInput = {
      type: txType,
      sourceIban,
      targetIban,
      amount: parsedAmount,
      description: descriptionInput,
    };

    if (amountInRon >= HIGH_VALUE_THRESHOLD_RON) {
      setPendingHighValueTx(txPayload);
      setPinInput('');
      setPinError(null);
      return;
    }

    finalizeTransactionSubmission(txPayload);
  };

  const handleConfirmHighValuePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingHighValueTx) return;

    if (pinInput.trim() !== DEFAULT_SECURITY_PIN) {
      setPinError('Cod PIN incorect. Pentru testare utilizează codul 1234.');
      onLogAuditEvent(
        'SECURITY',
        `Autorizare PIN eșuată (PIN introdus invalid) pentru operațiune de ${pendingHighValueTx.amount.toFixed(2)} ${activeOperationCurrency}`
      );
      return;
    }

    const approvedPayload: CreateTransactionInput = {
      ...pendingHighValueTx,
      pinVerified: true,
    };
    setPendingHighValueTx(null);
    setPinInput('');
    setPinError(null);
    finalizeTransactionSubmission(approvedPayload);
  };

  const handleCreateAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountModalError(null);
    try {
      onCreateAccount({
        owner: newOwnerInput,
        initialBalance: parseFloat(newBalanceInput || '0'),
        dailyLimit: parseFloat(newLimitInput || '15000'),
        currency: newCurrencyInput,
      });
      setNewOwnerInput('');
      setNewBalanceInput('5000.00');
      setIsNewAccountModalOpen(false);
    } catch (err) {
      setAccountModalError(err instanceof Error ? err.message : 'Eroare la deschiderea contului.');
    }
  };

  const handleSaveEditInModal = () => {
    if (!selectedTx) return;
    try {
      onUpdateDescription(selectedTx.id, editingDescValue);
      setIsEditingInModal(false);
      setModalFeedback('Descrierea tranzacției a fost actualizată.');
    } catch (err) {
      setModalFeedback(err instanceof Error ? err.message : 'Eroare la modificare.');
    }
  };

  const handleReverseInModal = () => {
    if (!selectedTx) return;
    try {
      onReverseTransaction(selectedTx.id);
      setModalFeedback('Tranzacția a fost stornată și soldurile au fost actualizate.');
    } catch (err) {
      setModalFeedback(err instanceof Error ? err.message : 'Eroare la stornare.');
    }
  };

  const handleFileUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileImportNotice(null);

    if (
      activeFileTab !== 'transactions.txt' &&
      activeFileTab !== 'accounts.txt' &&
      activeFileTab !== 'beneficiaries.txt'
    ) {
      return;
    }

    const targetTab = activeFileTab;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const textContent = String(reader.result || '');
        onImportFile(targetTab, textContent);
        setFileImportNotice({
          type: 'success',
          text: `Fișierul ${file.name} a fost importat în data/${targetTab}.`,
        });
      } catch (err) {
        setFileImportNotice({
          type: 'error',
          text: err instanceof Error ? err.message : 'Formatul fișierului încărcat este invalid.',
        });
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const downloadFileContent = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accountsText = useMemo(() => serializeAccountsToText(state.accounts), [state.accounts]);
  const transactionsText = useMemo(
    () => serializeTransactionsToText(state.transactions),
    [state.transactions]
  );
  const beneficiariesText = useMemo(
    () => serializeBeneficiariesToText(state.beneficiaries || []),
    [state.beneficiaries]
  );
  const binaryHexText = useMemo(
    () => generateBinaryHexPreview(state.transactions),
    [state.transactions]
  );

  const eurRate = bnrInfo.ratesVector[1] || 4.9765;
  const usdRate = bnrInfo.ratesVector[2] || 4.582;

  const isImportableTab =
    activeFileTab === 'transactions.txt' ||
    activeFileTab === 'accounts.txt' ||
    activeFileTab === 'beneficiaries.txt';

  const renderTransactionRow = (tx: Transaction) => {
    const isReversed = tx.status === 'REVERSED';
    const isPositive =
      tx.type === 'DEPOSIT' ||
      (selectedAccountIban !== null && tx.targetIban === selectedAccountIban);

    return (
      <div
        key={tx.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenTransactionDetails(tx)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenTransactionDetails(tx);
          }
        }}
        className={`px-4 py-3.5 flex items-center justify-between gap-4 cursor-pointer ${
          isReversed
            ? 'bg-slate-50/60 dark:bg-slate-900/40 opacity-60'
            : 'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              isReversed
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                : isPositive
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {isPositive ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <p
              className={`text-sm font-semibold text-slate-900 dark:text-white truncate ${
                isReversed ? 'line-through text-slate-500' : ''
              }`}
            >
              {tx.description}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{TRANSACTION_TYPE_LABELS[tx.type]}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{tx.timestamp}</span>
              {isReversed && (
                <>
                  <span>·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-medium">Stornată</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-sm font-bold font-mono tabular-nums whitespace-nowrap ${
              isReversed
                ? 'text-slate-400 line-through'
                : isPositive
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {isPositive ? '+' : '-'}
            {tx.amount.toLocaleString('ro-RO', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            {tx.currency}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* VIEW 1: OVERVIEW (ACASĂ) */}
      {activeSection === 'overview' && (
        <div className="space-y-8">
          {/* Top Balance Hero & Live BNR Rate Strip */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {selectedAccountObj
                    ? `Sold disponibil · ${selectedAccountObj.owner}`
                    : 'Sold Total Portofoliu (Echivalent RON la Cursul BNR)'}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h1 className="text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900 dark:text-white">
                    {(selectedAccountObj
                      ? selectedAccountObj.balance
                      : totalPortfolioBalanceRon
                    ).toLocaleString('ro-RO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h1>
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {selectedAccountObj ? selectedAccountObj.currency : 'RON'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Încasări (RON):</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      +
                      {cashflow.inflows.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Plăți & Retrageri (RON):</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      -
                      {cashflow.outflows.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>
                      Curs BNR ({bnrInfo.date}): 1 EUR = {eurRate.toFixed(4)} RON · 1 USD ={' '}
                      {usdRate.toFixed(4)} RON
                    </span>
                    <button
                      type="button"
                      onClick={onRefreshBnrRates}
                      title="Sincronizează cursul valutar oficial BNR"
                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${bnrInfo.isLoading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigateSection('payments')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transfer / Schimb Valutar
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cont Nou
                </button>
              </div>
            </div>
          </section>

          {/* Accounts Grid */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Conturile Mele ({state.accounts.length})
              </h2>
              {selectedAccountIban && (
                <button
                  type="button"
                  onClick={() => setSelectedAccountIban(null)}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Afișează toate conturile
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {state.accounts.map((acc) => {
                const isSelected = selectedAccountIban === acc.iban;
                return (
                  <div
                    key={acc.iban}
                    onClick={() => handleSelectAccountCard(acc)}
                    role="button"
                    aria-label={`Selectează contul ${acc.owner}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectAccountCard(acc);
                      }
                    }}
                    className={`text-left rounded-xl p-4 cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-blue-950 text-white border-slate-900 dark:border-blue-500'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-medium truncate ${
                          isSelected ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {acc.owner}
                      </span>
                      <Wallet
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'text-blue-400' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                    </div>

                    <p className="text-lg font-bold font-mono tabular-nums mt-2.5">
                      {acc.balance.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-xs font-normal">{acc.currency}</span>
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      <span
                        title={acc.iban}
                        className={`text-xs font-mono ${
                          isSelected ? 'text-slate-300' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {formatShortIban(acc.iban)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Modifică plafonul pentru ${acc.owner}`}
                          title={`Plafon zilnic: ${acc.dailyLimit.toLocaleString('ro-RO')} RON (Click pentru modificare)`}
                          onClick={(e) => handleOpenEditLimitModal(acc, e)}
                          className={`p-1 rounded cursor-pointer ${
                            isSelected
                              ? 'text-slate-300 hover:text-white'
                              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Copiază IBAN ${acc.iban}`}
                          title="Copiază IBAN complet"
                          onClick={(e) => handleCopyIban(acc.iban, e)}
                          className={`p-1 rounded cursor-pointer ${
                            isSelected
                              ? 'text-slate-300 hover:text-white'
                              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          {copiedIban === acc.iban ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent Activity */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tranzacții Recente
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Selectează o operațiune pentru detalii complete, repetarea plății, editare sau stornare
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('history')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Tot istoricul
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nicio tranzacție înregistrată pentru selecția curentă.
                </div>
              ) : (
                recentTransactions.map(renderTransactionRow)
              )}
            </div>
          </section>

          {/* Collapsible Limits & Volume */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLimitsDetails((prev) => !prev)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
            >
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Plafoane și Rulaj pe Tipuri de Operațiuni
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {showLimitsDetails
                    ? 'Ascunde detaliile privind limitele pe operațiuni'
                    : 'Apasă pentru a vedea limitele maxime și rulajul curent'}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                  showLimitsDetails ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showLimitsDetails && (
              <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TRANSACTION_TYPES.map((type, idx) => {
                  const val = vectorTotals[idx];
                  const limit = DAILY_LIMITS_VECTOR[idx];
                  const pct = Math.min(100, Math.round((val / limit) * 100));
                  return (
                    <div key={type} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {TRANSACTION_TYPE_LABELS[type]}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <strong className="text-slate-900 dark:text-white">
                            {val.toLocaleString('ro-RO', { minimumFractionDigits: 2 })}
                          </strong>{' '}
                          / {limit.toLocaleString('ro-RO')} RON
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* VIEW 2: PAYMENTS & FX CONVERSION */}
      {activeSection === 'payments' && (
        <div className="max-w-xl mx-auto space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Plăți, Transferuri și Schimb Valutar
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Conversie automată la cursul BNR din {bnrInfo.date} pentru transferuri între valute diferite
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshBnrRates}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${bnrInfo.isLoading ? 'animate-spin' : ''}`} />
                Curs BNR
              </button>
            </div>

            <form onSubmit={handleSubmitTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tip Operațiune
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {TRANSACTION_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTxType(type);
                        setFormError(null);
                        const savedList = state.beneficiaries || [];
                        if (type === 'PAYMENT' && savedList.length > 0) {
                          setTargetIban(savedList[0].iban);
                          setDescriptionInput(savedList[0].defaultDescription);
                        } else if (type === 'TRANSFER') {
                          const otherAcc = state.accounts.find((a) => a.iban !== sourceIban);
                          if (otherAcc) setTargetIban(otherAcc.iban);
                          setDescriptionInput('Transfer interbancar');
                        } else if (type === 'DEPOSIT') {
                          setTargetIban(sourceIban);
                          setDescriptionInput('Alimentare cont curent');
                        } else if (type === 'WITHDRAWAL') {
                          setDescriptionInput('Retragere numerar ATM');
                        }
                      }}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                        txType === type
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {TRANSACTION_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {txType === 'PAYMENT' && (
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Beneficiari Salvați ({state.beneficiaries.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {state.beneficiaries.map((b) => {
                      const active = targetIban === b.iban;
                      return (
                        <button
                          key={b.iban}
                          type="button"
                          onClick={() => handleSelectBeneficiaryPreset(b)}
                          className={`text-left px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                            active
                              ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/60 text-blue-950 dark:text-blue-200 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{b.name}</span>
                          </div>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {b.category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {txType !== 'DEPOSIT' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="source-iban-select"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Din Contul
                    </label>
                    {payerAccount && (
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        Sold: {payerAccount.balance.toLocaleString('ro-RO', { minimumFractionDigits: 2 })}{' '}
                        {payerAccount.currency} · Plafon: {payerAccount.dailyLimit.toLocaleString('ro-RO')} RON
                      </span>
                    )}
                  </div>
                  <select
                    id="source-iban-select"
                    value={sourceIban}
                    onChange={(e) => setSourceIban(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {state.accounts.map((acc) => (
                      <option key={acc.iban} value={acc.iban}>
                        {acc.owner} — {formatShortIban(acc.iban)} ({acc.balance.toFixed(2)}{' '}
                        {acc.currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {txType !== 'WITHDRAWAL' && (
                <div>
                  <label
                    htmlFor="target-iban-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {txType === 'DEPOSIT'
                      ? 'În Contul'
                      : txType === 'PAYMENT'
                      ? 'IBAN Beneficiar / Furnizor'
                      : 'Către Contul Beneficiar'}
                  </label>
                  {txType === 'PAYMENT' ? (
                    <input
                      id="target-iban-select"
                      type="text"
                      value={targetIban}
                      onChange={(e) => setTargetIban(e.target.value)}
                      placeholder="RO..."
                      className="w-full px-3 py-2.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  ) : (
                    <select
                      id="target-iban-select"
                      value={targetIban}
                      onChange={(e) => setTargetIban(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {state.accounts.map((acc) => (
                        <option key={acc.iban} value={acc.iban}>
                          {acc.owner} — {formatShortIban(acc.iban)} ({acc.balance.toFixed(2)}{' '}
                          {acc.currency})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="tx-amount-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Sumă ({activeOperationCurrency})
                  </label>
                  <input
                    id="tx-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="450.00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="tx-desc-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Detalii Plată
                  </label>
                  <input
                    id="tx-desc-input"
                    type="text"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Ex: Transfer / Factură"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Live BNR Cross-Currency Conversion Box */}
              {fxPreview && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/80 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-950 dark:text-blue-200">
                      Schimb Valutar Automat · {bnrInfo.source}
                    </span>
                    <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300">
                      Data BNR: {bnrInfo.date}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-600 dark:text-slate-300">
                      Sumă creditată în contul beneficiar ({fxPreview.toCurrency}):
                    </span>
                    <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300 tabular-nums">
                      {fxPreview.convertedAmount.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {fxPreview.toCurrency}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Curs aplicat: 1 {fxPreview.fromCurrency} = {fxPreview.rateUsed.toFixed(4)}{' '}
                    {fxPreview.toCurrency} (1 EUR = {eurRate.toFixed(4)} RON · 1 USD ={' '}
                    {usdRate.toFixed(4)} RON)
                  </p>
                </div>
              )}

              {/* Option to save new Beneficiary to beneficiaries.txt */}
              {txType === 'PAYMENT' && (
                <div className="pt-1 space-y-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveBeneficiaryChecked}
                      onChange={(e) => setSaveBeneficiaryChecked(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Salvează beneficiarul în lista de parteneri (beneficiaries.txt)</span>
                  </label>

                  {saveBeneficiaryChecked && (
                    <input
                      type="text"
                      value={newBeneficiaryName}
                      onChange={(e) => setNewBeneficiaryName(e.target.value)}
                      placeholder="Nume beneficiar (ex: Asociația de Proprietari)"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                <span>Confirmare PIN necesară peste 5.000 RON</span>
                <span className="font-mono tabular-nums">
                  Plafon operațiune:{' '}
                  {DAILY_LIMITS_VECTOR[TRANSACTION_TYPES.indexOf(txType)].toLocaleString('ro-RO')}{' '}
                  RON
                </span>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="p-3 text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg"
                >
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div
                  role="status"
                  className="p-3 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg"
                >
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 cursor-pointer"
              >
                Autorizează Operațiunea
              </button>
            </form>
          </section>
        </div>
      )}

      {/* VIEW 3: FULL TRANSACTION HISTORY WITH FLOW & SORT FILTERS */}
      {activeSection === 'history' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Istoric Tranzacții
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Filtrează după sens, tip sau sumă · Click pe orice rând pentru detalii, repetare plată sau stornare
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrează după flux"
                  value={flowFilter}
                  onChange={(e) => setFlowFilter(e.target.value as 'ALL' | 'INFLOW' | 'OUTFLOW')}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">Toate Fluxurile (+/-)</option>
                  <option value="INFLOW">Doar Încasări (+)</option>
                  <option value="OUTFLOW">Doar Plăți (-)</option>
                </select>

                <select
                  aria-label="Ordonează tranzacțiile"
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(e.target.value as 'NEWEST' | 'AMOUNT_DESC' | 'AMOUNT_ASC')
                  }
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  <option value="NEWEST">Cele mai recente</option>
                  <option value="AMOUNT_DESC">Sumă (Descrescător)</option>
                  <option value="AMOUNT_ASC">Sumă (Crescător)</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Caută în tranzacții"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Caută detalii, IBAN, ID..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
              {(['ALL', ...TRANSACTION_TYPES] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    filterType === type
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'ALL' ? 'Toate' : TRANSACTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                Nicio tranzacție găsită pentru filtrele selectate.
              </div>
            ) : (
              filteredTransactions.map(renderTransactionRow)
            )}
          </div>
        </section>
      )}

      {/* VIEW 4: PERSISTENCE FILES, IMPORT & AUDIT LOG */}
      {activeSection === 'files' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Fișiere de Date și Jurnal de Audit (<code className="font-mono text-sm">data/</code>)
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspectează, descarcă sau importă fișiere <code className="font-mono">.txt</code> direct în aplicație
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
                {(
                  [
                    { id: 'transactions.txt', label: 'transactions.txt' },
                    { id: 'accounts.txt', label: 'accounts.txt' },
                    { id: 'beneficiaries.txt', label: 'beneficiaries.txt' },
                    { id: 'audit.log', label: 'audit.log' },
                    { id: 'transactions.dat', label: 'transactions.dat' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveFileTab(tab.id);
                      setFileImportNotice(null);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                      activeFileTab === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onReloadFromDisk}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Reîncarcă
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetToInitial();
                  setFileImportNotice(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resetează Datele
              </button>
            </div>
          </div>

          {fileImportNotice && (
            <div
              className={`p-3 rounded-xl text-xs border ${
                fileImportNotice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                  : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900'
              }`}
            >
              {fileImportNotice.text}
            </div>
          )}

          <div className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
            <div className="flex items-center justify-between gap-4 pb-2.5 mb-2.5 border-b border-slate-800 text-[11px] text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                {activeFileTab.endsWith('.dat') ? (
                  <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                ) : activeFileTab === 'audit.log' ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="truncate">
                  data/{activeFileTab} · Salvat la: {state.lastSavedAt}
                </span>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {isImportableTab && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleFileUploadChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Importă {activeFileTab}
                    </button>
                  </>
                )}

                {activeFileTab !== 'transactions.dat' && (
                  <button
                    type="button"
                    onClick={() => {
                      const contentMap = {
                        'transactions.txt': transactionsText,
                        'accounts.txt': accountsText,
                        'beneficiaries.txt': beneficiariesText,
                        'audit.log': state.auditLog,
                      };
                      downloadFileContent(activeFileTab, contentMap[activeFileTab]);
                    }}
                    className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descarcă {activeFileTab}
                  </button>
                )}
              </div>
            </div>
            <pre className="leading-relaxed tabular-nums">
              {activeFileTab === 'transactions.txt' && transactionsText}
              {activeFileTab === 'accounts.txt' && accountsText}
              {activeFileTab === 'beneficiaries.txt' && beneficiariesText}
              {activeFileTab === 'audit.log' && state.auditLog}
              {activeFileTab === 'transactions.dat' && binaryHexText}
            </pre>
          </div>
        </section>
      )}

      {/* Modal: Edit Account Daily Limit */}
      {editingLimitAccount && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-limit-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  id="edit-limit-modal-title"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  Modificare Plafon Zilnic Cont
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingLimitAccount.owner}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLimitAccount(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountLimit} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-account-limit-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Noul Plafon Zilnic (RON)
                </label>
                <input
                  id="edit-account-limit-input"
                  type="number"
                  step="100"
                  min="100"
                  autoFocus
                  value={editLimitValue}
                  onChange={(e) => setEditLimitValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {editLimitError && (
                <div className="p-2.5 text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
                  {editLimitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLimitAccount(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Salvează Plafonul
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: High-Value Security PIN Confirmation (>= 5.000 RON) */}
      {pendingHighValueTx && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="pin-modal-title" className="text-sm font-bold text-slate-900 dark:text-white">
                    Confirmare de Securitate
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Plată peste pragul de 5.000 RON
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingHighValueTx(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sumă operațiune:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {pendingHighValueTx.amount.toLocaleString('ro-RO', {
                    minimumFractionDigits: 2,
                  })}{' '}
                  {activeOperationCurrency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Beneficiar:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {formatShortIban(pendingHighValueTx.targetIban)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmHighValuePin} className="space-y-3">
              <div>
                <label
                  htmlFor="security-pin-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Introdu Codul PIN de 4 cifre (Cod implicit: <code className="font-mono font-bold">1234</code>)
                </label>
                <input
                  id="security-pin-input"
                  type="password"
                  maxLength={4}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-center text-base font-mono tracking-widest bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {pinError && (
                <div className="p-2.5 text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
                  {pinError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingHighValueTx(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Confirmă cu PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transaction Details, Repeat Payment, Edit & Reversal */}
      {selectedTx && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-detail-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  DETALII OPERAȚIUNE · {selectedTx.id}
                </p>
                <h2 id="tx-detail-modal-title" className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {TRANSACTION_TYPE_LABELS[selectedTx.type]}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Închide detaliile"
                onClick={() => setSelectedTxId(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 text-center border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sumă Tranzacție</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {selectedTx.amount.toLocaleString('ro-RO', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                {selectedTx.currency}
              </p>
              <span
                className={`inline-block mt-1 text-[11px] font-mono font-semibold ${
                  selectedTx.status === 'REVERSED'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {selectedTx.status === 'REVERSED' ? 'STORNATĂ (REVERSED)' : 'FINALIZATĂ (COMPLETED)'}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Data și Ora</span>
                <span className="font-mono text-slate-900 dark:text-white">{selectedTx.timestamp}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-3">
                <span className="text-slate-500 dark:text-slate-400 shrink-0">Cont Plătitor</span>
                <span className="font-mono text-slate-900 dark:text-white truncate">{selectedTx.sourceIban}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-3">
                <span className="text-slate-500 dark:text-slate-400 shrink-0">Cont Beneficiar</span>
                <span className="font-mono text-slate-900 dark:text-white truncate">{selectedTx.targetIban}</span>
              </div>

              <div className="py-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-500 dark:text-slate-400">Descriere / Referință</span>
                  {!isEditingInModal && (
                    <button
                      type="button"
                      onClick={() => setIsEditingInModal(true)}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Modifică
                    </button>
                  )}
                </div>

                {isEditingInModal ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={editingDescValue}
                      onChange={(e) => setEditingDescValue(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-blue-500 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveEditInModal}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                    >
                      Salvează
                    </button>
                  </div>
                ) : (
                  <p className="font-medium text-slate-900 dark:text-white">{selectedTx.description}</p>
                )}
              </div>
            </div>

            {modalFeedback && (
              <div className="p-2.5 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg">
                {modalFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRepeatTransaction(selectedTx)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  Repetă Plata
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadFileContent(
                      `chitanta-${selectedTx.id}.txt`,
                      `ORDIN DE PLATA ${selectedTx.id}\nData: ${selectedTx.timestamp}\nTip: ${selectedTx.type}\nPlatitor: ${selectedTx.sourceIban}\nBeneficiar: ${selectedTx.targetIban}\nSuma: ${selectedTx.amount.toFixed(2)} ${selectedTx.currency}\nDetalii: ${selectedTx.description}\nStatus: ${selectedTx.status}\n`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Chitanță
                </button>

                {selectedTx.status !== 'REVERSED' && (
                  <button
                    type="button"
                    onClick={handleReverseInModal}
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Stornează
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedTxId(null)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Open New Bank Account (Multi-Currency: RON, EUR, USD) */}
      {isNewAccountModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-account-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="new-account-title" className="text-base font-bold text-slate-900 dark:text-white">
                Deschidere Cont Bancar Nou
              </h2>
              <button
                type="button"
                aria-label="Închide fereastra"
                onClick={() => setIsNewAccountModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-account-owner"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Titular și Denumire Cont
                </label>
                <input
                  id="new-account-owner"
                  type="text"
                  value={newOwnerInput}
                  onChange={(e) => setNewOwnerInput(e.target.value)}
                  placeholder="Ex: Alexandru Marin (Economii EUR)"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-account-currency"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Monedă
                  </label>
                  <select
                    id="new-account-currency"
                    value={newCurrencyInput}
                    onChange={(e) => setNewCurrencyInput(e.target.value as SupportedCurrency)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {CURRENCIES_VECTOR.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-account-balance"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Sold Inițial
                  </label>
                  <input
                    id="new-account-balance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newBalanceInput}
                    onChange={(e) => setNewBalanceInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-account-limit"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Plafon (RON)
                  </label>
                  <input
                    id="new-account-limit"
                    type="number"
                    step="100"
                    min="100"
                    value={newLimitInput}
                    onChange={(e) => setNewLimitInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {accountModalError && (
                <div className="p-2.5 text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
                  {accountModalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Deschide Contul
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
