package ro.ebanking.service;

import ro.ebanking.model.BankAccount;
import ro.ebanking.model.Transaction;
import ro.ebanking.model.TransactionType;
import ro.ebanking.repository.FileStorageManager;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class TransactionService {
    private static final DateTimeFormatter TS_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    // Vectori (tablouri unidimensionale) pentru plafoane si cursul valutar zilnic BNR [RON, EUR, USD]
    private static final double[] DAILY_LIMITS = {50000.0, 10000.0, 25000.0, 15000.0};
    private static final String[] SUPPORTED_CURRENCIES = {"RON", "EUR", "USD"};
    private final double[] exchangeRatesVector;

    // Colectii Java: LinkedHashMap, ArrayList, HashSet
    private final Map<String, BankAccount> accounts;
    private final List<Transaction> transactions;
    private final Set<String> processedIds;
    private final FileStorageManager storage;

    public TransactionService(FileStorageManager storage) {
        this.storage = storage;
        this.accounts = storage.loadAccounts();
        this.transactions = storage.loadTransactionsText();
        this.processedIds = new HashSet<>();
        for (Transaction tx : transactions) {
            this.processedIds.add(tx.getId());
        }
        this.exchangeRatesVector = storage.fetchLiveBnrRatesVector();
        this.storage.saveTransactionsBinary(this.transactions);
        this.storage.appendAuditLog("INFO", String.format(Locale.US,
                "Curs BNR sincronizat in vector: 1 EUR = %.4f RON, 1 USD = %.4f RON",
                exchangeRatesVector[1], exchangeRatesVector[2]));
    }

    public Collection<BankAccount> getAccounts() {
        return Collections.unmodifiableCollection(accounts.values());
    }

    public List<Transaction> getTransactions() {
        return Collections.unmodifiableList(transactions);
    }

    public List<Transaction> getTransactionsByAccount(String iban) {
        String clean = iban.trim();
        List<Transaction> filtered = new ArrayList<>();
        for (Transaction tx : transactions) {
            if (tx.getSourceIban().equalsIgnoreCase(clean) || tx.getTargetIban().equalsIgnoreCase(clean)) {
                filtered.add(tx);
            }
        }
        return filtered;
    }

    public double[] getExchangeRatesVector() {
        return Arrays.copyOf(exchangeRatesVector, exchangeRatesVector.length);
    }

    public double convertCurrency(double amount, String fromCurrency, String toCurrency) {
        int fromIdx = getCurrencyIndex(fromCurrency);
        int toIdx = getCurrencyIndex(toCurrency);
        double amountInRon = amount * exchangeRatesVector[fromIdx];
        return Math.round((amountInRon / exchangeRatesVector[toIdx]) * 100.0) / 100.0;
    }

    private int getCurrencyIndex(String currency) {
        for (int i = 0; i < SUPPORTED_CURRENCIES.length; i++) {
            if (SUPPORTED_CURRENCIES[i].equalsIgnoreCase(currency)) {
                return i;
            }
        }
        return 0;
    }

    public double[] calculateTotalsByTypeVector() {
        double[] totals = new double[TransactionType.values().length];
        for (Transaction tx : transactions) {
            if ("COMPLETED".equals(tx.getStatus())) {
                int idx = tx.getType().ordinal();
                totals[idx] += convertCurrency(tx.getAmount(), tx.getCurrency(), "RON");
            }
        }
        return totals;
    }

    public BankAccount openAccount(String owner, double initialBalance, double dailyLimit, String currency) {
        if (owner == null || owner.isBlank()) {
            throw new IllegalArgumentException("Titularul contului este obligatoriu.");
        }
        if (initialBalance < 0) {
            throw new IllegalArgumentException("Soldul initial nu poate fi negativ.");
        }
        if (dailyLimit < 100) {
            throw new IllegalArgumentException("Plafonul zilnic trebuie sa fie cel putin 100 RON.");
        }
        String normCurr = (currency == null || currency.isBlank()) ? "RON" : currency.trim().toUpperCase(Locale.ROOT);
        int idx = accounts.size() + 1;
        String iban = String.format(Locale.US, "RO%02dEBNK1B310075%08d", 10 + idx * 7, 4000 + idx * 1111);
        BankAccount created = new BankAccount(iban, owner.trim(), initialBalance, normCurr, dailyLimit);
        accounts.put(iban, created);

        if (initialBalance > 0) {
            String txId = generateUniqueId();
            String ts = LocalDateTime.now().format(TS_FORMAT);
            Transaction initTx = new Transaction(txId, ts, TransactionType.DEPOSIT,
                    "CASH-DESK", iban, initialBalance, normCurr,
                    "Depunere initiala la deschiderea contului", "COMPLETED");
            transactions.add(0, initTx);
            processedIds.add(txId);
        }

        persistAll();
        storage.appendAuditLog("INFO", "Cont bancar nou deschis: " + iban + " (" + owner.trim() + ", " + normCurr + ")");
        return created;
    }

    public void updateAccountDailyLimit(String iban, double newDailyLimit) {
        if (newDailyLimit < 100) {
            throw new IllegalArgumentException("Plafonul zilnic trebuie sa fie de cel putin 100 RON.");
        }
        BankAccount acc = getRequiredAccount(iban.trim());
        acc.setDailyLimit(newDailyLimit);
        persistAll();
        storage.appendAuditLog("INFO", String.format(Locale.US,
                "Plafon zilnic actualizat pentru %s la %.2f RON", acc.getIban(), newDailyLimit));
    }

    public Transaction executeTransaction(TransactionType type, String sourceIban, String targetIban, double amount, String description) {
        if (amount <= 0) {
            storage.appendAuditLog("ERROR", "Incercare tranzactie cu suma invalida: " + amount);
            throw new IllegalArgumentException("Suma trebuie sa fie strict pozitiva.");
        }

        String opCurrency = "RON";
        if (type == TransactionType.DEPOSIT && accounts.containsKey(targetIban)) {
            opCurrency = accounts.get(targetIban).getCurrency();
        } else if (accounts.containsKey(sourceIban)) {
            opCurrency = accounts.get(sourceIban).getCurrency();
        }

        double amountInRon = convertCurrency(amount, opCurrency, "RON");
        double maxAllowed = DAILY_LIMITS[type.ordinal()];
        if (amountInRon > maxAllowed) {
            storage.appendAuditLog("WARN", "Depasire plafon maxim pentru " + type + ": " + amountInRon + " RON");
            throw new IllegalArgumentException("Suma depaseste plafonul admis pe operatiune (" + maxAllowed + " RON).");
        }

        if (type != TransactionType.DEPOSIT && accounts.containsKey(sourceIban)) {
            BankAccount srcAcc = accounts.get(sourceIban);
            if (amountInRon > srcAcc.getDailyLimit()) {
                storage.appendAuditLog("WARN", "Depasire plafon zilnic cont " + sourceIban + ": " + amountInRon + " RON");
                throw new IllegalArgumentException("Suma depaseste plafonul zilnic setat pe cont (" + srcAcc.getDailyLimit() + " RON).");
            }
        }

        String id = generateUniqueId();
        String timestamp = LocalDateTime.now().format(TS_FORMAT);
        String finalDesc = description;

        switch (type) {
            case DEPOSIT -> {
                BankAccount target = getRequiredAccount(targetIban);
                target.setBalance(target.getBalance() + amount);
                sourceIban = "CASH-DESK";
            }
            case WITHDRAWAL -> {
                BankAccount source = getRequiredAccount(sourceIban);
                validateSufficientFunds(source, amount);
                source.setBalance(source.getBalance() - amount);
                targetIban = "ATM-TERMINAL";
            }
            case TRANSFER, PAYMENT -> {
                if (sourceIban.equals(targetIban)) {
                    throw new IllegalArgumentException("Contul sursa si contul destinatie nu pot fi identice.");
                }
                BankAccount source = getRequiredAccount(sourceIban);
                validateSufficientFunds(source, amount);
                source.setBalance(source.getBalance() - amount);
                if (accounts.containsKey(targetIban)) {
                    BankAccount target = accounts.get(targetIban);
                    double credited = convertCurrency(amount, source.getCurrency(), target.getCurrency());
                    target.setBalance(target.getBalance() + credited);
                    if (!source.getCurrency().equalsIgnoreCase(target.getCurrency())) {
                        finalDesc = String.format(Locale.US, "%s [Curs BNR: %.2f %s]",
                                description, credited, target.getCurrency());
                    }
                }
            }
        }

        Transaction tx = new Transaction(id, timestamp, type, sourceIban, targetIban, amount, opCurrency, finalDesc, "COMPLETED");
        transactions.add(0, tx);
        processedIds.add(id);
        persistAll();
        storage.appendAuditLog("INFO", String.format(Locale.US, "%s executata: %s %.2f %s (%s -> %s)",
                id, type, amount, opCurrency, sourceIban, targetIban));
        return tx;
    }

    public void updateDescription(String txId, String newDescription) {
        if (newDescription == null || newDescription.isBlank()) {
            throw new IllegalArgumentException("Descrierea nu poate fi goala.");
        }
        Transaction tx = findById(txId);
        tx.setDescription(newDescription.trim());
        persistAll();
        storage.appendAuditLog("INFO", "Descriere actualizata pentru " + txId);
    }

    public void reverseTransaction(String txId) {
        Transaction tx = findById(txId);
        if ("REVERSED".equals(tx.getStatus())) {
            throw new IllegalStateException("Tranzactia este deja stornata.");
        }

        switch (tx.getType()) {
            case DEPOSIT -> {
                BankAccount target = getRequiredAccount(tx.getTargetIban());
                validateSufficientFunds(target, tx.getAmount());
                target.setBalance(target.getBalance() - tx.getAmount());
            }
            case WITHDRAWAL -> {
                BankAccount source = getRequiredAccount(tx.getSourceIban());
                source.setBalance(source.getBalance() + tx.getAmount());
            }
            case TRANSFER, PAYMENT -> {
                BankAccount source = getRequiredAccount(tx.getSourceIban());
                if (accounts.containsKey(tx.getTargetIban())) {
                    BankAccount target = accounts.get(tx.getTargetIban());
                    double credited = convertCurrency(tx.getAmount(), tx.getCurrency(), target.getCurrency());
                    validateSufficientFunds(target, credited);
                    target.setBalance(target.getBalance() - credited);
                }
                source.setBalance(source.getBalance() + tx.getAmount());
            }
        }

        tx.setStatus("REVERSED");
        persistAll();
        storage.appendAuditLog("WARN", "Tranzactie stornata: " + txId);
    }

    public List<Transaction> filterByAccountOrType(String query) {
        String q = query.toLowerCase(Locale.ROOT).trim();
        List<Transaction> result = new ArrayList<>();
        for (Transaction tx : transactions) {
            if (tx.getId().toLowerCase(Locale.ROOT).contains(q)
                    || tx.getSourceIban().toLowerCase(Locale.ROOT).contains(q)
                    || tx.getTargetIban().toLowerCase(Locale.ROOT).contains(q)
                    || tx.getDescription().toLowerCase(Locale.ROOT).contains(q)
                    || tx.getType().name().toLowerCase(Locale.ROOT).contains(q)) {
                result.add(tx);
            }
        }
        return result;
    }

    private BankAccount getRequiredAccount(String iban) {
        BankAccount acc = accounts.get(iban);
        if (acc == null) {
            throw new IllegalArgumentException("Contul IBAN nu exista: " + iban);
        }
        return acc;
    }

    private Transaction findById(String txId) {
        for (Transaction tx : transactions) {
            if (tx.getId().equalsIgnoreCase(txId)) {
                return tx;
            }
        }
        throw new IllegalArgumentException("Tranzactia nu a fost gasita: " + txId);
    }

    private void validateSufficientFunds(BankAccount account, double amount) {
        if (account.getBalance() < amount) {
            storage.appendAuditLog("WARN", "Fonduri insuficiente pe contul " + account.getIban());
            throw new IllegalStateException("Fonduri insuficiente in contul " + account.getIban());
        }
    }

    private String generateUniqueId() {
        int next = 1001 + transactions.size();
        String candidate = "TX-" + next;
        while (processedIds.contains(candidate)) {
            next++;
            candidate = "TX-" + next;
        }
        return candidate;
    }

    private void persistAll() {
        storage.saveAccounts(accounts.values());
        storage.saveTransactionsText(transactions);
        storage.saveTransactionsBinary(transactions);
    }
}
