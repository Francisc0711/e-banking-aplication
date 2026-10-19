package ro.ebanking;

import ro.ebanking.model.BankAccount;
import ro.ebanking.model.Transaction;
import ro.ebanking.model.TransactionType;
import ro.ebanking.repository.FileStorageManager;
import ro.ebanking.service.TransactionService;

import java.util.List;
import java.util.Locale;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        FileStorageManager storage = new FileStorageManager("data");
        TransactionService service = new TransactionService(storage);
        Scanner scanner = new Scanner(System.in);

        boolean running = true;
        while (running) {
            printMenu(service);
            String option = scanner.nextLine().trim();
            try {
                switch (option) {
                    case "1" -> printAccounts(service);
                    case "2" -> printTransactions(service.getTransactions());
                    case "3" -> handleAccountStatement(scanner, service);
                    case "4" -> handleNewTransaction(scanner, service);
                    case "5" -> handleOpenAccount(scanner, service);
                    case "6" -> handleUpdateLimit(scanner, service);
                    case "7" -> handleUpdateDescription(scanner, service);
                    case "8" -> handleReverseTransaction(scanner, service);
                    case "9" -> printVectorStatistics(service);
                    case "10" -> printTransactions(storage.loadBinaryBackup());
                    case "0" -> running = false;
                    default -> System.out.println("Optiune invalida.");
                }
            } catch (Exception e) {
                System.out.println("Eroare: " + e.getMessage());
            }
        }
        System.out.println("Datele au fost sincronizate in fisiere. La revedere!");
    }

    private static void printMenu(TransactionService service) {
        double[] rates = service.getExchangeRatesVector();
        System.out.println("\n=== E-BANKING - SISTEM GESTIUNE TRANZACTII BANCARE ===");
        System.out.printf(Locale.US, "Curs BNR activ: 1 EUR = %.4f RON | 1 USD = %.4f RON%n", rates[1], rates[2]);
        System.out.println("1. Portofoliu conturi bancare");
        System.out.println("2. Istoric complet tranzactii");
        System.out.println("3. Extras de cont dupa IBAN");
        System.out.println("4. Ordin de plata / Schimb valutar");
        System.out.println("5. Deschidere cont bancar nou (RON / EUR / USD)");
        System.out.println("6. Modificare plafon zilnic pe cont");
        System.out.println("7. Modificare detalii tranzactie");
        System.out.println("8. Stornare (anulare) tranzactie");
        System.out.println("9. Raport rulaj pe categorii (Vector double[])");
        System.out.println("10. Verificare arhiva binara (transactions.dat)");
        System.out.println("0. Iesire");
        System.out.print("Selecteaza o optiune: ");
    }

    private static void printAccounts(TransactionService service) {
        System.out.println("\n--- CONTURI BANCARE ACTIVE ---");
        for (BankAccount account : service.getAccounts()) {
            System.out.println(account);
        }
    }

    private static void printTransactions(List<Transaction> list) {
        System.out.println("\n--- ISTORIC TRANZACTII ---");
        if (list.isEmpty()) {
            System.out.println("Nicio tranzactie inregistrata.");
            return;
        }
        for (Transaction tx : list) {
            System.out.println(tx);
        }
    }

    private static void handleAccountStatement(Scanner scanner, TransactionService service) {
        System.out.print("Introdu codul IBAN: ");
        String iban = scanner.nextLine().trim();
        printTransactions(service.getTransactionsByAccount(iban));
    }

    private static void handleNewTransaction(Scanner scanner, TransactionService service) {
        System.out.print("Tip (DEPOSIT / WITHDRAWAL / TRANSFER / PAYMENT): ");
        TransactionType type = TransactionType.valueOf(scanner.nextLine().trim().toUpperCase(Locale.ROOT));

        String sourceIban = "";
        String targetIban = "";

        if (type != TransactionType.DEPOSIT) {
            System.out.print("IBAN Platitor (Sursa): ");
            sourceIban = scanner.nextLine().trim();
        }
        if (type != TransactionType.WITHDRAWAL) {
            System.out.print("IBAN Beneficiar (Destinatie): ");
            targetIban = scanner.nextLine().trim();
        }

        System.out.print("Suma (in moneda contului): ");
        double amount = Double.parseDouble(scanner.nextLine().trim());

        if (amount >= 5000.0) {
            System.out.print("Confirmare de securitate - Introdu codul PIN (implicit 1234): ");
            String pin = scanner.nextLine().trim();
            if (!"1234".equals(pin)) {
                throw new SecurityException("Cod PIN incorect. Operatiune respinsa.");
            }
        }

        System.out.print("Detalii plata: ");
        String description = scanner.nextLine().trim();

        Transaction created = service.executeTransaction(type, sourceIban, targetIban, amount, description);
        System.out.println("Operatiune autorizata si salvata: " + created.getId());
    }

    private static void handleOpenAccount(Scanner scanner, TransactionService service) {
        System.out.print("Titular si tip cont: ");
        String owner = scanner.nextLine().trim();
        System.out.print("Moneda contului (RON / EUR / USD): ");
        String currency = scanner.nextLine().trim();
        System.out.print("Depunere initiala: ");
        double initialBalance = Double.parseDouble(scanner.nextLine().trim());
        System.out.print("Plafon zilnic (RON): ");
        double dailyLimit = Double.parseDouble(scanner.nextLine().trim());

        BankAccount created = service.openAccount(owner, initialBalance, dailyLimit, currency);
        System.out.println("Cont deschis cu succes: " + created.getIban());
    }

    private static void handleUpdateLimit(Scanner scanner, TransactionService service) {
        System.out.print("IBAN Cont pentru modificarea plafonului: ");
        String iban = scanner.nextLine().trim();
        System.out.print("Noul plafon zilnic (RON): ");
        double newLimit = Double.parseDouble(scanner.nextLine().trim());
        service.updateAccountDailyLimit(iban, newLimit);
        System.out.println("Plafonul zilnic a fost actualizat in accounts.txt.");
    }

    private static void handleUpdateDescription(Scanner scanner, TransactionService service) {
        System.out.print("ID Tranzactie (ex. TX-1002): ");
        String id = scanner.nextLine().trim();
        System.out.print("Noile detalii de plata: ");
        String desc = scanner.nextLine().trim();
        service.updateDescription(id, desc);
        System.out.println("Detaliile au fost actualizate.");
    }

    private static void handleReverseTransaction(Scanner scanner, TransactionService service) {
        System.out.print("ID Tranzactie pentru stornare: ");
        String id = scanner.nextLine().trim();
        service.reverseTransaction(id);
        System.out.println("Tranzactie stornata si solduri recalculate.");
    }

    private static void printVectorStatistics(TransactionService service) {
        double[] totals = service.calculateTotalsByTypeVector();
        TransactionType[] types = TransactionType.values();
        System.out.println("\n--- RULAJ PE CATEGORII DE OPERATIUNI (ECHIVALENT RON) ---");
        for (int i = 0; i < types.length; i++) {
            System.out.printf(Locale.US, "[%d] %-12s : %10.2f RON%n", i, types[i], totals[i]);
        }
    }
}
