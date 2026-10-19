import { useState, useEffect, useCallback, useRef } from 'react';
import {
  EBankingState,
  INITIAL_ACCOUNTS_TXT,
  INITIAL_TRANSACTIONS_TXT,
  INITIAL_BENEFICIARIES_TXT,
  INITIAL_AUDIT_LOG_TXT,
  DEFAULT_EXCHANGE_RATES_VECTOR,
  parseAccountsFromText,
  serializeAccountsToText,
  parseTransactionsFromText,
  serializeTransactionsToText,
  parseBeneficiariesFromText,
  serializeBeneficiariesToText,
  executeTransaction,
  createBankAccount,
  addSavedBeneficiary,
  updateAccountDailyLimit,
  importFileToState,
  reverseTransaction,
  updateTransactionDescription,
  appendAuditLog,
  formatCurrentTimestamp,
  CreateTransactionInput,
  CreateAccountInput,
  SavedBeneficiary,
  AuditLogLevel,
} from './utils/ebankingEngine';
import { SimulatorView, ActiveSection, BnrLiveInfo } from './components/SimulatorView';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';

export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_ACCOUNTS_KEY = 'ebanking_file_accounts_txt_v3';
const STORAGE_TX_KEY = 'ebanking_file_transactions_txt_v3';
const STORAGE_BENEFICIARIES_KEY = 'ebanking_file_beneficiaries_txt_v3';
const STORAGE_AUDIT_KEY = 'ebanking_file_audit_log_v3';
const STORAGE_SAVED_AT_KEY = 'ebanking_file_saved_at_v3';
const STORAGE_THEME_KEY = 'ebanking_theme_mode_v1';

function loadStateFromSimulatedFiles(): EBankingState {
  try {
    const rawAccounts = localStorage.getItem(STORAGE_ACCOUNTS_KEY) || INITIAL_ACCOUNTS_TXT;
    const rawTx = localStorage.getItem(STORAGE_TX_KEY) || INITIAL_TRANSACTIONS_TXT;
    const rawBen = localStorage.getItem(STORAGE_BENEFICIARIES_KEY) || INITIAL_BENEFICIARIES_TXT;
    const rawAudit = localStorage.getItem(STORAGE_AUDIT_KEY) || INITIAL_AUDIT_LOG_TXT;
    const savedAt = localStorage.getItem(STORAGE_SAVED_AT_KEY) || '2026-10-19 09:05';
    return {
      accounts: parseAccountsFromText(rawAccounts),
      transactions: parseTransactionsFromText(rawTx),
      beneficiaries: parseBeneficiariesFromText(rawBen),
      auditLog: rawAudit,
      lastSavedAt: savedAt,
    };
  } catch {
    return {
      accounts: parseAccountsFromText(INITIAL_ACCOUNTS_TXT),
      transactions: parseTransactionsFromText(INITIAL_TRANSACTIONS_TXT),
      beneficiaries: parseBeneficiariesFromText(INITIAL_BENEFICIARIES_TXT),
      auditLog: INITIAL_AUDIT_LOG_TXT,
      lastSavedAt: '2026-10-19 09:05',
    };
  }
}

function saveStateToSimulatedFiles(nextState: EBankingState): void {
  localStorage.setItem(STORAGE_ACCOUNTS_KEY, serializeAccountsToText(nextState.accounts));
  localStorage.setItem(STORAGE_TX_KEY, serializeTransactionsToText(nextState.transactions));
  localStorage.setItem(
    STORAGE_BENEFICIARIES_KEY,
    serializeBeneficiariesToText(nextState.beneficiaries)
  );
  localStorage.setItem(STORAGE_AUDIT_KEY, nextState.auditLog);
  localStorage.setItem(STORAGE_SAVED_AT_KEY, nextState.lastSavedAt);
}

function getInitialThemeMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_THEME_KEY);
  if (saved === 'dark' || saved === 'light' || saved === 'system') {
    return saved;
  }
  return 'system';
}

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'White' },
  { mode: 'system', label: 'System' },
];

const NAV_ITEMS: { id: ActiveSection; label: string }[] = [
  { id: 'overview', label: 'Acasă' },
  { id: 'payments', label: 'Plăți & Schimb Valutar' },
  { id: 'history', label: 'Istoric' },
  { id: 'files', label: 'Fișiere & Audit' },
];

export default function App() {
  const [state, setState] = useState<EBankingState>(() => loadStateFromSimulatedFiles());
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState<boolean>(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode());
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState<boolean>(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  const [bnrInfo, setBnrInfo] = useState<BnrLiveInfo>({
    date: new Date().toISOString().slice(0, 10),
    source: 'BNR Oficial (nbrfxrates.xml)',
    ratesVector: DEFAULT_EXCHANGE_RATES_VECTOR,
    isLoading: false,
  });

  const fetchBnrExchangeRates = useCallback(async (logToAudit = false) => {
    setBnrInfo((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/bnr-rates');
      if (res.ok) {
        const data = (await res.json()) as {
          date: string;
          source: string;
          rates: { RON: number; EUR: number; USD: number };
        };
        const nextVector = [1.0, data.rates.EUR, data.rates.USD];
        setBnrInfo({
          date: data.date,
          source: data.source,
          ratesVector: nextVector,
          isLoading: false,
        });

        if (logToAudit) {
          setState((prev) => {
            const ts = formatCurrentTimestamp();
            const updated: EBankingState = {
              ...prev,
              auditLog: appendAuditLog(
                prev.auditLog,
                'INFO',
                `Curs valutar sincronizat cu BNR (${data.date}): 1 EUR = ${data.rates.EUR.toFixed(4)} RON, 1 USD = ${data.rates.USD.toFixed(4)} RON`,
                ts
              ),
              lastSavedAt: ts,
            };
            saveStateToSimulatedFiles(updated);
            return updated;
          });
        }
        return;
      }
    } catch {
      // Keep current rates if offline
    }
    setBnrInfo((prev) => ({ ...prev, isLoading: false }));
  }, []);

  useEffect(() => {
    fetchBnrExchangeRates(false);
  }, [fetchBnrExchangeRates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_THEME_KEY, themeMode);
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const shouldBeDark =
        themeMode === 'dark' || (themeMode === 'system' && mediaQuery.matches);
      if (shouldBeDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    if (themeMode === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [themeMode]);

  useEffect(() => {
    if (!isThemeDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsThemeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isThemeDropdownOpen]);

  useEffect(() => {
    saveStateToSimulatedFiles(state);
  }, [state]);

  const handleLogAuditEvent = useCallback((level: AuditLogLevel, message: string) => {
    setState((prev) => {
      const ts = formatCurrentTimestamp();
      const nextState: EBankingState = {
        ...prev,
        auditLog: appendAuditLog(prev.auditLog, level, message, ts),
        lastSavedAt: ts,
      };
      saveStateToSimulatedFiles(nextState);
      return nextState;
    });
  }, []);

  const handleExecuteTransaction = useCallback(
    (input: CreateTransactionInput) => {
      setState((prev) => {
        const { nextState } = executeTransaction(prev, {
          ...input,
          exchangeRatesVector: bnrInfo.ratesVector,
        });
        saveStateToSimulatedFiles(nextState);
        return nextState;
      });
    },
    [bnrInfo.ratesVector]
  );

  const handleCreateAccount = useCallback((input: CreateAccountInput) => {
    setState((prev) => {
      const { nextState } = createBankAccount(prev, input);
      saveStateToSimulatedFiles(nextState);
      return nextState;
    });
  }, []);

  const handleAddBeneficiary = useCallback((beneficiary: SavedBeneficiary) => {
    setState((prev) => {
      const nextState = addSavedBeneficiary(prev, beneficiary);
      saveStateToSimulatedFiles(nextState);
      return nextState;
    });
  }, []);

  const handleUpdateAccountLimit = useCallback((iban: string, newLimit: number) => {
    setState((prev) => {
      const nextState = updateAccountDailyLimit(prev, iban, newLimit);
      saveStateToSimulatedFiles(nextState);
      return nextState;
    });
  }, []);

  const handleImportFile = useCallback(
    (fileType: 'transactions.txt' | 'accounts.txt' | 'beneficiaries.txt', rawContent: string) => {
      setState((prev) => {
        const nextState = importFileToState(prev, fileType, rawContent);
        saveStateToSimulatedFiles(nextState);
        return nextState;
      });
    },
    []
  );

  const handleReverseTransaction = useCallback(
    (txId: string) => {
      setState((prev) => {
        const nextState = reverseTransaction(prev, txId, bnrInfo.ratesVector);
        saveStateToSimulatedFiles(nextState);
        return nextState;
      });
    },
    [bnrInfo.ratesVector]
  );

  const handleUpdateDescription = useCallback((txId: string, newDesc: string) => {
    setState((prev) => {
      const nextState = updateTransactionDescription(prev, txId, newDesc);
      saveStateToSimulatedFiles(nextState);
      return nextState;
    });
  }, []);

  const handleResetToInitial = useCallback(() => {
    const resetState: EBankingState = {
      accounts: parseAccountsFromText(INITIAL_ACCOUNTS_TXT),
      transactions: parseTransactionsFromText(INITIAL_TRANSACTIONS_TXT),
      beneficiaries: parseBeneficiariesFromText(INITIAL_BENEFICIARIES_TXT),
      auditLog: INITIAL_AUDIT_LOG_TXT,
      lastSavedAt: formatCurrentTimestamp(),
    };
    saveStateToSimulatedFiles(resetState);
    setState(resetState);
  }, []);

  const handleReloadFromDisk = useCallback(() => {
    setState(loadStateFromSimulatedFiles());
  }, []);

  const themeLabel =
    themeMode === 'dark' ? 'Dark' : themeMode === 'light' ? 'White' : 'System';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sticky Top Header */}
      <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Neutral Project Wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            E-Banking
          </button>

          {/* Zone 2: Clean View Navigation */}
          <nav
            aria-label="Navigație principală"
            className="hidden md:flex items-center gap-1 p-1 bg-slate-100/80 dark:bg-slate-800/70 rounded-lg"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Refined Theme Dropdown + Quick Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div ref={themeDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsThemeDropdownOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isThemeDropdownOpen}
                aria-label={`Selectează tema (curent: ${themeLabel})`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200/90 dark:border-slate-700/90 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {themeMode === 'dark' && <Moon className="w-3.5 h-3.5 text-blue-400" />}
                {themeMode === 'light' && <Sun className="w-3.5 h-3.5 text-amber-500" />}
                {themeMode === 'system' && (
                  <Monitor className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                )}
                <span>{themeLabel}</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                    isThemeDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isThemeDropdownOpen && (
                <div
                  role="menu"
                  aria-label="Opțiuni temă"
                  className="absolute right-0 mt-1.5 w-40 p-1 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-900/10 dark:shadow-black/40 z-50"
                >
                  {THEME_OPTIONS.map((opt) => {
                    const isSelected = themeMode === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setThemeMode(opt.mode);
                          setIsThemeDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {opt.mode === 'dark' && (
                            <Moon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400'
                              }`}
                            />
                          )}
                          {opt.mode === 'light' && (
                            <Sun
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-amber-500' : 'text-slate-400'
                              }`}
                            />
                          )}
                          {opt.mode === 'system' && (
                            <Monitor
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-slate-400'
                              }`}
                            />
                          )}
                          <span className="truncate">{opt.label}</span>
                        </span>

                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveSection('payments')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Plată Nouă
            </button>
          </div>
        </div>

        {/* Mobile Secondary Navigation Bar */}
        <div className="md:hidden border-t border-slate-100 dark:border-slate-800/80 px-4 py-2 flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 dark:bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <SimulatorView
          state={state}
          bnrInfo={bnrInfo}
          onRefreshBnrRates={() => fetchBnrExchangeRates(true)}
          activeSection={activeSection}
          onNavigateSection={setActiveSection}
          onExecuteTransaction={handleExecuteTransaction}
          onCreateAccount={handleCreateAccount}
          onAddBeneficiary={handleAddBeneficiary}
          onUpdateAccountLimit={handleUpdateAccountLimit}
          onImportFile={handleImportFile}
          onLogAuditEvent={handleLogAuditEvent}
          onReverseTransaction={handleReverseTransaction}
          onUpdateDescription={handleUpdateDescription}
          onResetToInitial={handleResetToInitial}
          onReloadFromDisk={handleReloadFromDisk}
          isNewAccountModalOpen={isNewAccountModalOpen}
          setIsNewAccountModalOpen={setIsNewAccountModalOpen}
        />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>E-Banking · Sistem pentru Gestiunea Tranzacțiilor Bancare</span>
          <span>
            Fișiere active: accounts.txt · transactions.txt · beneficiaries.txt · audit.log · transactions.dat
          </span>
        </div>
      </footer>
    </div>
  );
}
