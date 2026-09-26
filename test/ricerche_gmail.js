/**
 * Un interprete delle ricerche di Gmail, per le prove del motore della posta
 *
 *   const { cerca, ricercaDelFiltro } = require('./ricerche_gmail');
 *
 * Lo usano test/filtri_diventano_regole.js e test/filtri_a_caso.js, per le
 * ricerche dei filtri e per quelle delle regole allo stesso modo. Gli spazi
 * sono "e", OR e' "o" e lega piu' forte degli spazi (come in Gmail), "-" e'
 * "non", le parentesi raggruppano, le graffe sono un "o", campo:(...) vale
 * per tutto il gruppo. from: guarda indirizzo e nome del mittente; le parole
 * senza campo oggetto, testo e mittente; un valore vale se c'e' dentro, come
 * pezzo di testo: from:@dominio non prende un sottodominio
 * (x@posta.dominio), from:dominio si'. label: vale senza maiuscole; le
 * categorie non ci sono.
 *
 * Un messaggio e' { da, nome, oggetto, testo, a, etichette (Set), inArrivo,
 * letto, allegato }.
 */
'use strict';

function analizza(q) {
  let i = 0;
  const salta = () => { while (i < q.length && /\s/.test(q[i])) i++; };
  function sequenza(fine) {
    const parti = [];
    for (;;) {
      salta();
      if (i >= q.length || q[i] === fine) break;
      parti.push(alternativa());
    }
    return { tipo: 'e', parti };
  }
  function alternativa() {
    const parti = [unario()];
    for (;;) {
      const prima = i;
      salta();
      if (q.startsWith('OR', i) && (i + 2 >= q.length || /[\s({"]/.test(q[i + 2]))) {
        i += 2;
        parti.push(unario());
      } else { i = prima; break; }
    }
    return parti.length === 1 ? parti[0] : { tipo: 'o', parti };
  }
  function unario() {
    salta();
    if (q[i] === '-') { i++; return { tipo: 'non', x: unario() }; }
    return primario();
  }
  function primario() {
    salta();
    if (q[i] === '(') { i++; const s = sequenza(')'); if (q[i] !== ')') throw new Error('manca ) in ' + q); i++; return s; }
    if (q[i] === '{') {
      i++;
      const parti = [];
      for (;;) { salta(); if (i >= q.length) throw new Error('manca } in ' + q); if (q[i] === '}') { i++; break; } parti.push(unario()); }
      return { tipo: 'o', parti };
    }
    if (q[i] === '"') {
      const j = q.indexOf('"', i + 1);
      if (j < 0) throw new Error('manca " in ' + q);
      const t = q.slice(i + 1, j);
      i = j + 1;
      return { tipo: 'parola', campo: '', valore: t };
    }
    let j = i;
    while (j < q.length && !/[\s(){}"]/.test(q[j])) j++;
    const t = q.slice(i, j);
    i = j;
    if (t === '') throw new Error('ricerca che non si legge: ' + q);
    const due = t.indexOf(':');
    if (due > 0 && due === t.length - 1) return { tipo: 'campo', campo: t.slice(0, -1).toLowerCase(), x: primario() };
    if (due > 0) return { tipo: 'parola', campo: t.slice(0, due).toLowerCase(), valore: t.slice(due + 1) };
    return { tipo: 'parola', campo: '', valore: t };
  }
  const albero = sequenza(null);
  if (i < q.length) throw new Error('avanza qualcosa in ' + q);
  return albero;
}

function vale(n, m, campo) {
  switch (n.tipo) {
    case 'e': return n.parti.every(p => vale(p, m, campo));
    case 'o': return n.parti.some(p => vale(p, m, campo));
    case 'non': return !vale(n.x, m, campo);
    case 'campo': return vale(n.x, m, n.campo);
    default: return parola(n.campo || campo || '', n.valore, m);
  }
}

function parola(campo, valore, m) {
  const v = String(valore).toLowerCase();
  switch (campo) {
    case 'from': return (m.da + ' ' + m.nome).toLowerCase().indexOf(v) >= 0;
    case 'to': return (m.a || '').toLowerCase().indexOf(v) >= 0;
    case 'subject': return (m.oggetto || '').toLowerCase().indexOf(v) >= 0;
    case 'label': return [...m.etichette].some(e => e.toLowerCase() === v);
    case 'in': return v === 'inbox' ? m.inArrivo : v === 'anywhere';
    case 'newer_than': case 'older_than': return true;
    case 'has': return v === 'attachment' ? !!m.allegato : false;
    case 'category': return false;
    case '': return ((m.oggetto || '') + ' ' + (m.testo || '') + ' ' + m.da + ' ' + m.nome).toLowerCase().indexOf(v) >= 0;
    default: return false;
  }
}

const valutate = new Map();
/** I messaggi della casella che la ricerca prende. */
function cerca(q, casella) {
  if (!valutate.has(q)) valutate.set(q, analizza(q));
  const albero = valutate.get(q);
  return casella.filter(m => vale(albero, m, ''));
}

/** La ricerca di un filtro dai suoi criteri (con i nomi del servizio Gmail API), come la scrive Gmail. */
function ricercaDelFiltro(c) {
  const p = [];
  if (c.from) p.push('from:(' + c.from + ')');
  if (c.to) p.push('to:(' + c.to + ')');
  if (c.subject) p.push('subject:(' + c.subject + ')');
  if (c.query) p.push('(' + c.query + ')');
  if (c.negatedQuery) p.push('-(' + c.negatedQuery + ')');
  if (c.hasAttachment) p.push('has:attachment');
  return p.join(' ');
}

module.exports = { analizza, vale, cerca, ricercaDelFiltro };
