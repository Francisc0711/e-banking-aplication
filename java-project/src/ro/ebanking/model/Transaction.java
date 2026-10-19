package ro.ebanking.model;

import java.io.Serializable;
import java.util.Locale;

public class Transaction implements Serializable {
    private static final long serialVersionUID = 1L;

    private final String id;
    private final String timestamp;
    private final TransactionType type;
    private final String sourceIban;
    private final String targetIban;
    private final double amount;
    private final String currency;
    private String description;
    private String status;

    public Transaction(String id, String timestamp, TransactionType type,
                       String sourceIban, String targetIban, double amount,
                       String currency, String description, String status) {
        this.id = id;
        this.timestamp = timestamp;
        this.type = type;
        this.sourceIban = sourceIban;
        this.targetIban = targetIban;
        this.amount = amount;
        this.currency = currency;
        this.description = description;
        this.status = status;
    }

    public String getId() { return id; }
    public String getTimestamp() { return timestamp; }
    public TransactionType getType() { return type; }
    public String getSourceIban() { return sourceIban; }
    public String getTargetIban() { return targetIban; }
    public double getAmount() { return amount; }
    public String getCurrency() { return currency; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String toCsv() {
        return String.format(Locale.US, "%s;%s;%s;%s;%s;%.2f;%s;%s;%s",
                id, timestamp, type.name(), sourceIban, targetIban,
                amount, currency, description.replace(";", ","), status);
    }

    public static Transaction fromCsv(String line) {
        String[] parts = line.split(";");
        return new Transaction(
                parts[0].trim(),
                parts[1].trim(),
                TransactionType.valueOf(parts[2].trim()),
                parts[3].trim(),
                parts[4].trim(),
                Double.parseDouble(parts[5].trim()),
                parts[6].trim(),
                parts[7].trim(),
                parts[8].trim()
        );
    }

    @Override
    public String toString() {
        return String.format(Locale.US, "%-8s | %-16s | %-10s | %-24s -> %-24s | %9.2f %s | %-10s | %s",
                id, timestamp, type, sourceIban, targetIban, amount, currency, status, description);
    }
}
