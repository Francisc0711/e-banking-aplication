# E-Banking — Sistem pentru Gestiunea Tranzacțiilor Bancare

Aplicație completă de **Internet Banking** (interfață web interactivă + aplicație Java 17 în consolă) cu persistență exclusiv în fișiere (`accounts.txt`, `transactions.txt`, `beneficiaries.txt`, `audit.log` și `transactions.dat`), structuri de date (vectori `double[]` și colecții `Map`, `List`, `Set`) și conversie valutară automată la cursul zilnic oficial BNR (`nbrfxrates.xml`).

---

## Funcționalități Principale

- **Conturi Multi-Valută (`RON`, `EUR`, `USD`)**: Administrarea portofoliului de conturi bancare în memorie (`Map<String, BankAccount>`), deschiderea de conturi noi și modificarea plafonului zilnic pe fiecare cont.
- **Schimb Valutar Automat la Cursul Zilnic BNR**: Preluarea cursului oficial BNR din ziua respectivă (`https://www.bnr.ro/nbrfxrates.xml`), stocarea în vectorul `double[] exchangeRatesVector` (`[RON, EUR, USD]`) și conversia automată la transferurile între conturi de monede diferite.
- **Plăți, Transferuri și Beneficiari Salvați**:
  - Suport pentru `TRANSFER`, `PAYMENT`, `DEPOSIT` și `WITHDRAWAL`.
  - Șabloane rapide de furnizori și salvarea de beneficiari noi în `data/beneficiaries.txt`.
  - Opțiunea **Repetă Plata** din detaliile oricărei tranzacții.
  - Confirmare de securitate cu **cod PIN** (`1234`) pentru operațiuni de valoare mare ($\ge 5.000\text{ RON}$).
- **Controlul Integrității, Editare și Stornare**:
  - Prevenirea ID-urilor duplicate cu `Set<String>`.
  - Modificarea descrierii unei tranzacții, descărcarea chitanței (`.txt`) și **Stornarea (`REVERSED`)** cu refacerea automată a soldurilor.
- **Persistență în Fișiere și Jurnal de Audit (`data/`)**:
  - `data/accounts.txt` — conturile bancare active și plafoanele zilnice.
  - `data/transactions.txt` — registrul complet de tranzacții în format text.
  - `data/beneficiaries.txt` — lista de parteneri și furnizori salvați.
  - `data/audit.log` — jurnalul cronologic de securitate și operațiuni.
  - `data/transactions.dat` — backup binar serializat (`ObjectOutputStream`).
  - Import și export direct de fișiere `.txt` din interfață.

---

## Structura Repository-ului

```text
├── java-project/                  # Proiectul Java 17 ( arhitectura model / repository / service )
│   ├── data/                      # Fisierele de persistenta (.txt, .log, .dat)
│   └── src/ro/ebanking/
│       ├── Main.java              # Interfata CLI in consola
│       ├── model/                 # BankAccount, Transaction, TransactionType
│       ├── repository/            # FileStorageManager (I/O text, binar si curs BNR XML)
│       └── service/               # TransactionService (vectori double[], colectii si validari)
├── src/                           # Interfata Web (React + TypeScript + Tailwind CSS)
│   ├── components/SimulatorView.tsx
│   ├── utils/ebankingEngine.ts    # Motorul de gestiune si serializare in fisiere
│   └── utils/ebankingEngine.test.ts
├── server.ts                      # Server Express + proxy live pentru cursul BNR XML
└── package.json
```

---

## Rulare Locală

### 1. Interfața Web + Serverul BNR Live
```bash
npm install
npm run dev
```
Aplicația pornește la adresa `http://localhost:3000`.

### 2. Aplicația Java 17 (în consolă / IDE)
```bash
cd java-project
mkdir -p out
javac -d out $(find src -name "*.java")
java -cp out ro.ebanking.Main
```
