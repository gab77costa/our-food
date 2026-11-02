# OurFoodHub

Web app per tenere sotto controllo le scadenze della dispensa di casa.

- **Dal telefono** (Chrome su Android, installabile come app): a ogni spesa si tolgono i prodotti consumati e si dettano quelli nuovi.
- **Dal PC**, quando serve: tabella dei prodotti, correzioni, storico e download del file Excel di ogni spesa, nello stesso formato dei file `scad_AAAA-MM-GG_FINAL.xlsx` usati finora.

Gira interamente su Firebase: nessun PC deve restare acceso. L'accesso è con account Google, solo per gli utenti autorizzati.

> La cartella `tmp/` contiene la vecchia versione (FastAPI + PostgreSQL + React): resta solo come riferimento e non viene usata.

---

## Come funziona

### Spesa (sessione)

Una spesa corrisponde a una sessione, e ce n'è al massimo una al giorno (l'id è la data).

1. **Nuova spesa**: dal telefono, in *Registra*.
2. **Togli i consumati**: tocchi ✓ sui prodotti finiti; con −1 riduci la quantità di una confezione multipla.
3. **Aggiungi i nuovi**: premi 🎤 e detti **un prodotto per frase**, con una pausa tra un prodotto e l'altro. Esempi:
   - "kefir sei pezzi 19 novembre 2026"
   - "biscotti misura maggio 2027"
   - "banane"
4. **Revisione**: ogni prodotto dettato si può correggere (nome, quantità, data, tipo). Poi *Salva tutti*.
5. **Chiudi spesa**. Il file Excel di quella spesa si scarica subito oppure in qualsiasi momento da *Gestione → Spese ed Excel*.

I prodotti si possono segnare come consumati anche dal PC, in *Gestione → Prodotti*.

### Regole per le date dettate

| Detto | Data |
|---|---|
| giorno mese anno ("3 ottobre 2026", "3/10/26") | quel giorno |
| giorno mese senza anno ("3 ottobre") | anno corrente |
| mese anno ("maggio 2027") | ultimo giorno del mese |
| solo anno ("2030") | 31 dicembre |

Frutta e verdura (`v`) e congelatore (`c`) non richiedono una data. Per gli altri tipi, una data mancante viene segnalata ma non blocca il salvataggio.

### Tipi (colonna `tip` dei file Excel)

| tip | significato | foglio Excel |
|---|---|---|
| `v` | frutta e verdura | Frutta e verdura |
| `f` | frigorifero | Frigorifero |
| `c` | congelatore | Congelatore |
| `d` | dispensa | Dispensa e bevande |
| `b` | bevande | Dispensa e bevande |

Il tipo viene proposto in quest'ordine:
1. **storico**: stesso nome o sinonimo già visto;
2. **nome simile**: anche abbreviato, per esempio "zucca grigl" ↔ "zucca grigliata";
3. **parole chiave**;
4. **AI**: solo per i nomi rimasti senza tipo, con **una sola chiamata** a fine revisione. Si può disattivare con `VITE_AI_ENABLED=false` in `web/.env.local`: i nomi mai visti restano da scegliere a mano.

Se correggi il tipo a mano, la correzione viene ricordata per quel nome. Senza rete, i prodotti senza tipo si salvano come *da categorizzare* e si sistemano dopo da *Gestione*.

### File Excel

Ogni spesa produce `scad_AAAA-MM-GG_FINAL.xlsx`:
- fogli *Frutta e verdura*, *Congelatore*, *Frigorifero*, *Dispensa e bevande* e *FULL*;
- colonne `tip` / `desc` / `date`;
- quantità come "x6" in fondo alla descrizione;
- righe nell'ordine di inserimento.

Il file non viene salvato da nessuna parte: viene ricostruito al momento. Ogni prodotto ha data di inserimento, data di consumo e storico delle quantità, quindi si ottiene la dispensa esatta alla chiusura di quella spesa, anche per le spese vecchie.

---

## Struttura del repository

```
packages/core/          logica condivisa (TypeScript puro, con test):
                        date dettate, parsing delle frasi, categorie,
                        dispensa nel tempo, Excel, ricostruzione dello storico,
                        proposte per i nomi
web/                    app React + Vite + Tailwind + TanStack Table (PWA)
  src/pages/            Registra (telefono), Gestione (PC)
  src/data/             letture e scritture Firestore
  test/                 test delle regole di sicurezza (emulatore)
functions/              Cloud Function `categorizeProducts` (Claude), europe-west8
tools/import-history/   import una tantum dei file Excel storici
firestore.rules         regole di sicurezza
firebase.json           Hosting, Firestore (europe-west8), Functions, emulatori
docs/samples/           file Excel di esempio (non versionati: dati personali)
```

### Dati in Firestore

| Collezione | Contenuto |
|---|---|
| `allowedUsers/{email}` | account autorizzati. Si gestiscono solo dalla console o con lo script, mai dall'app |
| `products/{id}` | `name`, `tip` (o `null` = da categorizzare), `quantity`, `quantityLog`, `expiryDate` (`AAAA-MM-GG` o `null`), `status` (`active`/`consumed`), `seq` (ordine), `sessionId`, `createdAt`, `consumedAt`, `consumedInSessionId` |
| `sessions/{AAAA-MM-GG}` | `status` (`open`/`closed`), `openedAt`, `closedAt`, contatori, `source` (`app`/`import`), `order` (solo per le spese importate: ordine originale delle righe) |
| `categoryHints/{nome}` | nomi appresi: `displayName`, `aliases` (abbreviazioni e varianti), `counts` per tipo, `override` (correzione manuale) |

---

## Prima installazione

Prerequisiti:
- Node.js 22 o superiore;
- Firebase CLI (`npm i -g firebase-tools`).

Si lavora direttamente sul progetto Firebase in cloud. Gli emulatori locali sono facoltativi (vedi in fondo).

1. **Progetto Firebase**
   - Crea il progetto. L'id previsto è `ourfoodhub`; se è diverso, aggiorna `.firebaserc`.
   - Attiva il piano **Blaze**: serve per le Functions e per chiamare l'API di Claude.
   - Imposta subito un **avviso di budget** (per esempio 5 €).
2. **Firestore**: crea il database nella regione **europe-west8 (Milano)**. Attenzione: la regione non si può cambiare dopo.
3. **Authentication**:
   - attiva il provider **Google**;
   - in *Settings → Authorized domains* verifica che ci siano `ourfoodhub.web.app` e `ourfoodhub.firebaseapp.com`.
4. **App web**:
   - in *Impostazioni progetto → Le tue app* registra un'app web;
   - copia `web/.env.example` in `web/.env.local` e compila i valori.
5. **Chiave Anthropic** per le Functions, salvata in Secret Manager e non nel codice:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
6. **Dipendenze**:
   ```bash
   npm install
   npm install --prefix functions
   ```
7. **Deploy** (regole, indici, Functions, Hosting):
   ```bash
   npm run deploy
   ```
   Senza AI (`VITE_AI_ENABLED=false`) usa invece `npm run deploy:noai`: non pubblica la Cloud Function, quindi non servono né la chiave Anthropic (punto 5) né il piano Blaze.
8. **Utenti autorizzati**. Gli script di amministrazione usano le credenziali Google del PC: lancia prima `gcloud auth application-default login`, oppure imposta `GOOGLE_APPLICATION_CREDENTIALS` con il file di un service account.
   ```bash
   npm run import -- allow tua.email@gmail.com
   ```
   In alternativa: dalla console Firestore crea il documento `allowedUsers/<email in minuscolo>`.
9. **Sul telefono**: apri `https://ourfoodhub.web.app` con Chrome, poi menu → *Installa app*.

## Import dello storico (una volta sola)

Metti tutti i file `scad_AAAA-MM-GG_FINAL.xlsx` in una cartella: vengono letti solo quelli che finiscono con `_FINAL.xlsx`, gli altri sono ignorati (e segnalati). Serve un solo file per giorno. L'import li legge in ordine di data e usa il foglio **FULL**; le differenze tra FULL e gli altri fogli vengono segnalate come avvisi. Gli stessi prodotti che si ripetono in file consecutivi (stesso tipo, nome senza "xN" e data) diventano un unico prodotto. Quelli che spariscono risultano consumati in quella spesa, e l'ultimo file diventa la dispensa attuale.

1. **Proposte per i nomi**:
   ```bash
   npm run import -- propose /percorso/cartella-excel
   # facoltativo: --llm chiede a Claude i nomi per esteso
   # (serve ANTHROPIC_API_KEY sul PC; il costo è trascurabile)
   ```
   Il comando crea `tools/import-history/out/proposte-nomi.xlsx`: una riga per gruppo di varianti, con le modifiche proposte in cima ed evidenziate. Per ogni riga:
   - `accetta` = **S**: le varianti diventano un solo prodotto con il *nome finale*;
   - `accetta` = **N**: restano separate e con il nome originale;
   - *nome finale*: correggilo liberamente;
   - *tip finale*: cambialo solo se è sbagliato, perché diventa una correzione manuale.
2. **Verifica**, senza scrivere nulla:
   ```bash
   npm run import -- apply /percorso/cartella-excel --dry-run
   ```
   La verifica **ricostruisce ogni file storico** dai dati importati e lo confronta con l'originale (con i nomi finali). Se un file non coincide, l'import si ferma e scrive i dettagli in `out/verifica-errori.json`. Controlla anche `out/anteprima.json`.
3. **Import** nel progetto Firebase, prima di iniziare a usare l'app:
   ```bash
   npm run import -- apply /percorso/cartella-excel
   ```
   Se il database contiene già dati, l'import si rifiuta di procedere. Con `--force` sovrascrive i documenti importati: i loro id sono fissi (`imp-AAAA-MM-GG-NNN`), quindi ripetere l'import non crea doppioni.

I file in `tools/import-history/out/` contengono dati personali e sono esclusi da git.

## Sviluppo locale

```bash
npm run dev          # http://localhost:3000, sui dati in cloud
```

`localhost` è già tra i domini autorizzati di Firebase Auth. Le modifiche fatte in locale finiscono nei dati veri.

La dettatura funziona solo su HTTPS o su `localhost`. Per provarla dal telefono prima del deploy, usa un canale di anteprima (stesso database):

```bash
firebase hosting:channel:deploy prova
```

### Test

```bash
npm test             # core (date, frasi, categorie, Excel, storico), import, functions
npm run typecheck
```

Se c'è la cartella `docs/samples/`, i test leggono anche i file Excel reali: ognuno deve rileggersi e ricostruirsi identico, e lo storico campione deve ricostruirsi senza differenze. Senza i file, quei test vengono saltati.

Dopo il primo deploy, prova le regole di sicurezza a mano: accedi con un account **non** autorizzato e verifica che compaia *Accesso non autorizzato*. Per singole letture e scritture c'è anche il *Rules Playground* della console (Firestore → Regole).

### Emulatori (facoltativi)

Servono solo per lavorare senza toccare i dati in cloud, e richiedono **JDK 21 o superiore** (`sudo apt install openjdk-21-jre-headless`).

```bash
npm run emulators                    # auth, firestore, functions, hosting + UI su :4000
# in web/.env.local: VITE_USE_EMULATORS=true
npm run import -- allow test@example.com --emulator
npm run import -- apply /percorso/cartella-excel --emulator
npm run test:rules                   # test automatici delle regole di sicurezza
```

Per la Function in locale, metti la chiave in `functions/.secret.local` (`ANTHROPIC_API_KEY=...`). Il file è escluso da git.

## Costi

Con circa una spesa a settimana si resta nei limiti gratuiti di Hosting, Firestore e Functions. L'AI viene chiamata solo per i nomi che lo storico non conosce, una volta per spesa: pochi centesimi all'anno.

Il modello è `claude-opus-5-5` con effort `low`. Si cambia in `functions/src/classify.ts` (`MODEL`); per esempio `claude-haiku-5-5` costa ancora meno.

`maxInstances: 2` sulle Functions limita il caso peggiore.

## Limiti noti

- **Dettatura**: usa il riconoscimento vocale di Chrome, quindi serve la rete. Senza connessione resta l'inserimento manuale, e i prodotti vengono sincronizzati quando torna la rete. L'app è pensata e provata per Chrome su Android.
- **Accesso offline**: l'autorizzazione viene ricordata sul dispositivo dopo il primo accesso online.
- **Prodotti senza data nello storico** (frutta e verdura, congelatore) presenti in file consecutivi sono considerati lo stesso prodotto.
