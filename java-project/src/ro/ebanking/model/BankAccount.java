package ro.ebanking.model;

import java.io.Serializable;
import java.util.Locale;

public class BankAccount implements Serializable {
    private static final long serialVersionUID = 1L;

    private final String iban;
    private final String owner;
    private double balance;
    private final String currency;
    private final double dailyLimit;

    public BankAccount(String iban, String owner, double balance, String currency, double dailyLimit) {
        this.iban = iban;
        this.owner = owner;
        this.balance = balance;
        this.currency = currency;
        this.dailyLimit = dailyLimit;
    }

    public String getIban() { return iban; }
    public String getOwner() { return owner; }
    public double getBalance() { return balance; }
    public void setBalance(double balance) { this.balance = balance; }
    public String getCurrency() { return currency; }
    public double getDailyLimit() { return dailyLimit; }

    public String toCsv() {
        return String.format(Locale.US, "%s;%s;%.2f;%s;%.2f",
                iban, owner, balance, currency, dailyLimit);
    }

    public static BankAccount fromCsv(String line) {
        String[] parts = line.split(";");
        return new BankAccount(
                parts[0].trim(),
                parts[1].trim(),
                Double.parseDouble(parts[2].trim()),
                parts[3].trim(),
                Double.parseDouble(parts[4].trim())
        );
    }

    @Override
    public String toString() {
        return String.format(Locale.US, "%-24s | %-22s | %10.2f %s | Plafon: %.2f",
                iban, owner, balance, currency, dailyLimit);
    }
}
