package ro.ebanking.repository;

import ro.ebanking.model.BankAccount;
import ro.ebanking.model.Transaction;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.*;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class FileStorageManager {
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final Path accountsPath;
    private final Path transactionsTextPath;
    private final Path transactionsBinaryPath;
    private final Path beneficiariesPath;
    private final Path auditLogPath;

    public FileStorageManager(String dataDir) {
        Path dir = Paths.get(dataDir);
        this.accountsPath = dir.resolve("accounts.txt");
        this.transactionsTextPath = dir.resolve("transactions.txt");
        this.transactionsBinaryPath = dir.resolve("transactions.dat");
        this.beneficiariesPath = dir.resolve("beneficiaries.txt");
        this.auditLogPath = dir.resolve("audit.log");
        ensureDirectoryAndFiles(dir);
    }

    private void ensureDirectoryAndFiles(Path dir) {
        try {
            if (!Files.exists(dir)) {
                Files.createDirectories(dir);
            }
            if (!Files.exists(accountsPath)) {
                Files.createFile(accountsPath);
            }
            if (!Files.exists(transactionsTextPath)) {
                Files.createFile(transactionsTextPath);
            }
            if (!Files.exists(beneficiariesPath)) {
                Files.createFile(beneficiariesPath);
            }
            if (!Files.exists(auditLogPath)) {
                Files.createFile(auditLogPath);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la initializarea fisierelor de date", e);
        }
    }

    public Map<String, BankAccount> loadAccounts() {
        Map<String, BankAccount> accounts = new LinkedHashMap<>();
        try (BufferedReader reader = Files.newBufferedReader(accountsPath)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank() && !line.startsWith("#")) {
                    BankAccount acc = BankAccount.fromTextLine(line);
                    accounts.put(acc.getIban(), acc);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la citirea accounts.txt", e);
        }
        return accounts;
    }

    public void saveAccounts(Collection<BankAccount> accounts) {
        try (BufferedWriter writer = Files.newBufferedWriter(accountsPath)) {
            for (BankAccount acc : accounts) {
                writer.write(acc.toTextLine());
                writer.newLine();
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la salvarea accounts.txt", e);
        }
    }

    public List<Transaction> loadTransactionsText() {
        List<Transaction> list = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(transactionsTextPath)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank() && !line.startsWith("#")) {
                    list.add(Transaction.fromTextLine(line));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la citirea transactions.txt", e);
        }
        return list;
    }

    public void saveTransactionsText(List<Transaction> transactions) {
        try (BufferedWriter writer = Files.newBufferedWriter(transactionsTextPath)) {
            for (Transaction tx : transactions) {
                writer.write(tx.toTextLine());
                writer.newLine();
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la salvarea transactions.txt", e);
        }
    }

    public void saveTransactionsBinary(List<Transaction> transactions) {
        try (ObjectOutputStream oos = new ObjectOutputStream(Files.newOutputStream(transactionsBinaryPath))) {
            oos.writeObject(new ArrayList<>(transactions));
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la salvarea binara transactions.dat", e);
        }
    }

    @SuppressWarnings("unchecked")
    public List<Transaction> loadTransactionsBinary() {
        if (!Files.exists(transactionsBinaryPath)) {
            return Collections.emptyList();
        }
        try (ObjectInputStream ois = new ObjectInputStream(Files.newInputStream(transactionsBinaryPath))) {
            return (List<Transaction>) ois.readObject();
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException("Eroare la citirea binara transactions.dat", e);
        }
    }

    public Map<String, String> loadSavedBeneficiaries() {
        Map<String, String> beneficiaries = new LinkedHashMap<>();
        try (BufferedReader reader = Files.newBufferedReader(beneficiariesPath)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank() && !line.startsWith("#")) {
                    String[] parts = line.split(";");
                    if (parts.length >= 2) {
                        beneficiaries.put(parts[1].trim(), parts[0].trim());
                    }
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la citirea beneficiaries.txt", e);
        }
        return beneficiaries;
    }

    public void appendBeneficiary(String name, String iban, String category, String description) {
        String entry = String.format("%s;%s;%s;%s%n", name.trim(), iban.trim(), category.trim(), description.trim());
        try {
            Files.writeString(beneficiariesPath, entry, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la salvarea beneficiaries.txt", e);
        }
    }

    public void appendAuditLog(String level, String message) {
        String ts = LocalDateTime.now().format(TS_FMT);
        String line = String.format("%s | %s | %s%n", ts, level, message);
        try {
            Files.writeString(auditLogPath, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            throw new UncheckedIOException("Eroare la scrierea in audit.log", e);
        }
    }

    /**
     * Preia cursul valutar oficial BNR din XML-ul zilnic (https://www.bnr.ro/nbrfxrates.xml)
     * si returneaza un vector double[3] corespunzator valutelor [RON, EUR, USD].
     */
    public double[] fetchLiveBnrRatesVector() {
        double[] rates = new double[]{1.0, 4.9765, 4.5820};
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://www.bnr.ro/nbrfxrates.xml"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 200) {
                String xml = res.body();
                Matcher eurMatcher = Pattern.compile("<Rate\\s+currency=[\"']EUR[\"'][^>]*>([0-9.]+)</Rate>").matcher(xml);
                Matcher usdMatcher = Pattern.compile("<Rate\\s+currency=[\"']USD[\"'][^>]*>([0-9.]+)</Rate>").matcher(xml);
                if (eurMatcher.find()) {
                    rates[1] = Double.parseDouble(eurMatcher.group(1));
                }
                if (usdMatcher.find()) {
                    rates[2] = Double.parseDouble(usdMatcher.group(1));
                }
            }
        } catch (Exception ignored) {
            // Foloseste valorile de referinta daca conexiunea nu este disponibila
        }
        return rates;
    }
}
