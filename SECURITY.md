# Segnalare un problema di sicurezza

Se trovi una vulnerabilità in Campanella, nell'applicazione, negli script
Apps Script, nell'installer o nell'estensione per Chrome, **non aprire una
issue pubblica**: usa la segnalazione privata di GitHub, dalla scheda
*Security* del repository ("Report a vulnerability"), oppure
<https://github.com/vittop89/Campanella/security/advisories/new>.

Scrivi come riprodurla e quale dato o permesso è in gioco. Il progetto è
mantenuto da una persona sola nel tempo libero: la risposta può richiedere
qualche settimana, ma arriva.

## Cosa conta come problema di sicurezza, qui

- Lo script fa qualcosa che il testo non dice: manda email ad altri, cancella,
  contatta servizi esterni, chiede permessi non documentati.
- L'applicazione scrive dati personali in un posto diverso da quelli
  dichiarati (`campanella.json`, `campanella-dati.json`, le cartelle scelte
  dall'utente), o li manda in rete.
- Il download di rizzo-pii dalle Impostazioni può essere dirottato.
- L'estensione per Chrome legge o manda più di quello che dichiara.
- L'installer o il disinstallatore toccano file fuori dalla propria cartella.

Non sono problemi di sicurezza: l'avviso di SmartScreen sugli eseguibili non
firmati (vedi README, sezione sulla firma) e l'avviso "app non verificata" di
Google, che compare per tutti gli script personali.

## Versioni supportate

Solo l'ultima versione pubblicata. Le precedenti non ricevono correzioni:
si aggiorna.
