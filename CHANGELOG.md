# Cronologia delle versioni

## 1.2.0 — 12 settembre 2026

Prima versione pubblicata su GitHub.

- **Orari**: le email arrivano solo a chi esegue lo script; via l'invio ai
  colleghi, le bozze e l'abbinamento degli indirizzi; nei dati generati non
  c'è nessun indirizzo. Nuovo passo "Google Calendar": l'orario di un docente
  come eventi settimanali, annullabili con `ORARI_ANNULLA_calendario`.
- **Archivio** eliminato: niente più posta scaricata nel Drive né
  sorveglianza dei file.
- **Dati di altre persone** (elenco del personale, indirizzi, orari) tenibili
  in `campanella-dati.json` dentro il Drive invece che accanto al programma.
- **Posta**: il gruppo delle etichette non si chiede più (resta "Scuola");
  estensione per Chrome, generata al momento, per leggere il personale da
  ClasseViva; il riepilogo va dichiaratamente al proprio account.
- **Script**: in modalità prova non crea nemmeno le etichette; blocco di
  esecuzione contro le sovrapposizioni; una regola con ricerca rifiutata da
  Gmail viene saltata e segnalata.
- **Cartelle**: anno scolastico che cambia da solo il primo settembre; esempi
  nelle caselle; cartelle di partenza generiche; `MODELLI\PER CLASSE` copiato
  dentro ogni classe.
- **Interfaccia**: barra laterale senza sfarfallio; bordi delle caselle e
  barre di scorrimento a tema; segnaposto nelle caselle vuote; dominio di
  partenza vuoto e cartella del Drive rilevata da sola.
- **Documenti** per dirigente e DPO (nota tecnica, modello di email, GDPR)
  incorporati nell'applicazione e copiati dall'installer; condizioni d'uso
  aggiornate (versione 2, richieste di nuovo a tutti).
- **Pubblicazione**: script Inno Setup (it/en), workflow GitHub con firma
  SignPath, prove con dati inventati, `SECURITY.md`.

## 1.1.0

Versione interna: cinque strumenti (Posta, Cartelle, Orari, Archivio,
Privacy), installer in C#, anonimizzazione con rizzo-pii.
