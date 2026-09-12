"""
finto_rizzo.py - un rizzo-pii finto, per provare il client di Campanella
senza scaricare il modello vero.

    python test/finto_rizzo.py [porta]

Risponde come il servizio vero su /health, /analyze e /pdf, con un
riconoscitore fatto di quattro espressioni regolari: basta a verificare che
Campanella parli il protocollo giusto (JSON, multipart, intestazioni X-PII-*).
"""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 5005

RICONOSCITORI = [
    ("EMAIL", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("CF", re.compile(r"\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b")),
    ("IBAN", re.compile(r"\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b")),
    ("PHONE", re.compile(r"\b3\d{2}[ .]?\d{6,7}\b")),
    ("FULLNAME", re.compile(r"\b(?:Mario Rossi|Anna Verdi|Luigi Bianchi|Giulia Neri)\b")),
]


def analizza(testo, con_dizionario=True):
    trovate = []
    for etichetta, regex in RICONOSCITORI:
        for m in regex.finditer(testo):
            trovate.append((m.start(), m.end(), etichetta, m.group(0)))
    trovate.sort()

    # niente sovrapposizioni: vince chi comincia prima
    pulite, fine = [], -1
    for t in trovate:
        if t[0] >= fine:
            pulite.append(t)
            fine = t[1]

    contatori, visti, mappa, pezzi, per_tipo = {}, {}, {}, [], {}
    pos = 0
    for inizio, termine, etichetta, valore in pulite:
        pezzi.append(testo[pos:inizio])
        chiave = (etichetta, valore.lower())
        if chiave in visti:
            ph = visti[chiave]
        else:
            contatori[etichetta] = contatori.get(etichetta, 0) + 1
            ph = "[%s_%d]" % (etichetta, contatori[etichetta])
            visti[chiave] = ph
            if con_dizionario:
                mappa[ph] = valore
        pezzi.append(ph)
        per_tipo[etichetta] = per_tipo.get(etichetta, 0) + 1
        pos = termine
    pezzi.append(testo[pos:])

    return {
        "anonymized_text": "".join(pezzi),
        "mapping": mappa,
        "mapping_enabled": con_dizionario,
        "n_entities": len(pulite),
        "n_unique": len(visti),
        "by_label": per_tipo,
        "n_chars": len(testo),
    }


def parti_multipart(corpo, confine):
    """Torna { nome_campo: (nome_file, contenuto_bytes) }."""
    separatore = b"--" + confine
    fuori = {}
    for blocco in corpo.split(separatore):
        if b"\r\n\r\n" not in blocco:
            continue
        testa, dati = blocco.split(b"\r\n\r\n", 1)
        testa = testa.decode("utf-8", "replace")
        m = re.search(r'name="([^"]*)"', testa)
        if not m:
            continue
        nome_file = re.search(r'filename="([^"]*)"', testa)
        fuori[m.group(1)] = (nome_file.group(1) if nome_file else None,
                             dati.rstrip(b"\r\n"))
    return fuori


class Gestore(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"      # come gunicorn: connessioni riusabili

    def log_message(self, formato, *args):
        sys.stderr.write("  %s\n" % (formato % args))

    def _json(self, oggetto, stato=200):
        dati = json.dumps(oggetto).encode("utf-8")
        self.send_response(stato)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)

    def do_GET(self):
        if self.path in ("/health", "/healthz"):
            self._json({
                "status": "ok", "model_loaded": True,
                "model": "rizzo-pii-0.3B-finto", "model_version": "1.5.0",
                "app_version": "finto", "device": "cpu", "tags": 22,
                "excluded_tags": [], "mapping_enabled": True,
            })
        else:
            self._json({"error": "non previsto"}, 404)

    def do_POST(self):
        lunghezza = int(self.headers.get("Content-Length") or 0)
        tipo = self.headers.get("Content-Type") or ""

        if self.headers.get("Transfer-Encoding") == "chunked":
            corpo = b""
            while True:
                riga = self.rfile.readline().strip()
                n = int(riga, 16) if riga else 0
                if n == 0:
                    self.rfile.readline()
                    break
                corpo += self.rfile.read(n)
                self.rfile.readline()
        else:
            corpo = self.rfile.read(lunghezza)

        if self.path == "/analyze" and tipo.startswith("application/json"):
            richiesta = json.loads(corpo.decode("utf-8"))
            con_diz = str(richiesta.get("include_mapping", "true")).lower() != "false"
            fuori = analizza(richiesta.get("text", ""), con_diz)
            fuori["source_text"] = richiesta.get("text", "")
            return self._json(fuori)

        if self.path in ("/analyze", "/pdf") and "multipart/form-data" in tipo:
            confine = tipo.split("boundary=")[1].strip().encode("utf-8")
            campi = parti_multipart(corpo, confine)
            if "file" not in campi:
                return self._json({"error": "manca il file"}, 400)
            nome_file, dati = campi["file"]
            con_diz = campi.get("include_mapping", (None, b"true"))[1].decode().lower() != "false"
            testo = dati.decode("utf-8", "replace")
            fuori = analizza(testo, con_diz)

            if self.path == "/analyze":
                return self._json(fuori)

            # /pdf: torno un finto PDF con dentro il testo anonimizzato
            pdf = b"%PDF-1.4 finto\n" + fuori["anonymized_text"].encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition",
                             'attachment; filename=%s' % (nome_file or "out.pdf"))
            self.send_header("X-PII-Redactions", str(fuori["n_entities"]))
            self.send_header("X-PII-Residual", "0")
            self.send_header("X-PII-Skipped", "0")
            self.send_header("X-PII-Notfound", "0")
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)
            return

        self._json({"error": "richiesta non riconosciuta"}, 400)


if __name__ == "__main__":
    print("finto rizzo-pii in ascolto su http://127.0.0.1:%d" % PORTA)
    ThreadingHTTPServer(("127.0.0.1", PORTA), Gestore).serve_forever()
