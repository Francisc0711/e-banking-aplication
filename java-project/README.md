# E-Banking Transaction Management System

Sistem de gestiune a operațiunilor și conturilor bancare dezvoltat în Java 17, proiectat cu o arhitectură stratificată (`model`, `repository`, `service`) și persistență nativă în fișiere text și binare, fără dependențe externe.

## Funcționalități Principale

- **Gestiunea Conturilor Bancare**: Încărcarea și administrarea conturilor în memorie folosind `HashMap<String, BankAccount>` pentru interogare și actualizare în timp constant $O(1)$ după codul IBAN.
- **Procesarea Operațiunilor E-Banking**: Suport complet pentru depuneri numerar (`DEPOSIT`), retrageri ATM (`WITHDRAWAL`), transferuri interbancare (`TRANSFER`) și plăți facturi/comercianți (`PAYMENT`), cu validarea automată a soldului disponibil și a plafoanelor per tranzacție.
- **Controlul Integrității și Stornare**: Evidența ID-urilor procesate prin `HashSet<String>` pentru prevenirea tranzacțiilor duplicate, editarea detaliilor de plată și anularea (`REVERSED`) operațiunilor cu refacerea automată a soldurilor.
- **Analiză Statistică Vectorială**: Calcularea rulajului cumulat pe categorii de operațiuni prin tablouri unidimensionale (`double[]`).
- **Motor Dublu de Persistență (`FileStorageManager`)**:
  - **Format Text (CSV)**: Sincronizare automată în `data/accounts.txt` și `data/transactions.txt` prin `BufferedReader` și `BufferedWriter`.
  - **Format Binar**: Serializarea nativă a colecției de tranzacții în `data/transactions.dat` prin `ObjectOutputStream` și `ObjectInputStream`.

## Arhitectura Proiectului

```text
e-banking-transactions/
├── data/
│   ├── accounts.txt          # Starea conturilor bancare (IBAN;Titular;Sold;Moneda;Plafon)
│   ├── transactions.txt      # Registrul de tranzactii in format text
│   └── transactions.dat      # Snapshot binar serializat (ObjectOutputStream)
├── src/
│   └── ro/ebanking/
│       ├── Main.java
│       ├── model/
│       │   ├── BankAccount.java
│       │   ├── Transaction.java
│       │   └── TransactionType.java
│       ├── repository/
│       │   └── FileStorageManager.java
│       └── service/
│           └── TransactionService.java
├── .gitignore
└── README.md
```

## Compilare și Rulare

### Din linia de comandă (JDK 17+)

```bash
mkdir -p out
javac -d out $(find src -name "*.java")
java -cp out ro.ebanking.Main
```

### În IntelliJ IDEA / Eclipse

1. Deschide directorul `e-banking-transactions` ca proiect Java.
2. Marchează directorul `src` drept **Sources Root**.
3. Rulează clasa `ro.ebanking.Main`. Fișierele din `data/` sunt încărcate automat la pornire și actualizate după fiecare operațiune.
