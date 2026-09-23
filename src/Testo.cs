// ===========================================================================
//  Testo.cs - lettura dei file di testo scelti dall'utente
//
//  Un CSV salvato da Excel italiano e' spesso in "ANSI" (Windows-1252), non
//  in UTF-8: letto come UTF-8, ogni lettera accentata diventa un carattere
//  sostitutivo, i cognomi si rovinano e un giorno scritto per intero con
//  l'accento non viene piu' riconosciuto. Qui si guarda prima il BOM, poi
//  si prova l'UTF-8 rigoroso (che si ferma al primo byte non valido), e
//  solo se non torna si legge come Windows-1252.
// ===========================================================================

using System;
using System.IO;
using System.Text;

namespace Campanella
{
    static class Testo
    {
        /// <summary>Il contenuto di un file di testo, nella codifica riconosciuta.</summary>
        public static string LeggiFile(string percorso)
        {
            return Decodifica(File.ReadAllBytes(percorso));
        }

        /// <summary>BOM se c'e' (UTF-8, UTF-16), altrimenti UTF-8 se e' valido, altrimenti Windows-1252.</summary>
        public static string Decodifica(byte[] b)
        {
            if (b == null || b.Length == 0) return "";
            if (b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF)
                return new UTF8Encoding(false).GetString(b, 3, b.Length - 3);
            if (b.Length >= 2 && b[0] == 0xFF && b[1] == 0xFE)
                return new UnicodeEncoding(false, false).GetString(b, 2, b.Length - 2);
            if (b.Length >= 2 && b[0] == 0xFE && b[1] == 0xFF)
                return new UnicodeEncoding(true, false).GetString(b, 2, b.Length - 2);
            try
            {
                return new UTF8Encoding(false, true).GetString(b);
            }
            catch (DecoderFallbackException)
            {
                return Encoding.GetEncoding(1252).GetString(b);
            }
        }
    }
}
