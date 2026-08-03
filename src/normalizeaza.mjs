// Traduce trace-ul in format OPT (iesirea lui vg_to_opt_trace.py) in forma
// simpla consumata de DebuggerVisual.vue: valorile sunt deja formatate ca text,
// ca sa nu ducem logica de decodare in Vue.
//
// Portat din AlgPlayground/scripts/genereaza-trace.mjs, care facea acelasi lucru
// cu raspunsul primit de la pythontutor - acelasi format, aceeasi origine.

export const MAX_PASI = 1000

const esteData = (v) => Array.isArray(v) && v[0] === 'C_DATA'
const esteStruct = (v) => Array.isArray(v) && v[0] === 'C_STRUCT'
const esteArray = (v) => Array.isArray(v) && v[0] === 'C_ARRAY'

// Al treilea element al unui C_ARRAY este un dictionar de metadate
// (elt_bytes, heap_block), nu un element propriu-zis.
function elementeArray(v) {
  const rest = v.slice(2)
  if (rest.length > 0 && !Array.isArray(rest[0]) && typeof rest[0] === 'object') return rest.slice(1)
  return rest
}

function numeStruct(v) {
  const al3lea = v[2]
  if (typeof al3lea === 'string') return al3lea
  return al3lea?.name ?? 'struct'
}

// Campurile <padding> sunt octetii de aliniere dintre membrii unui struct.
// Nu exista in codul sursa, deci nu au ce cauta intr-o lectie.
const estePadding = (nume) => nume === '<padding>'

// "FLsiDublu(Nod*)" -> "FLsiDublu"
const numeScurt = (n) => String(n ?? '').split('(')[0]

const traduceEveniment = { call: 'apel', return: 'retur', step_line: 'linie' }

// SPP-Valgrind emite, la intrarea intr-o functie, un pas obisnuit pe linia
// acoladei deschise, urmat imediat de evenimentul de apel pe aceeasi linie.
// Valgrind-ul din 2015 folosit de pythontutor nu il emitea, iar lectia spune
// explicit ca la apel sageata sare la prima linie DE SUB acolada. Il scoatem,
// ca sa nu rescriem lectia dupa un detaliu de implementare.
function scoateOpririlePeAcolada(trace) {
  return trace.filter((pas, i) => {
    const urmator = trace[i + 1]
    return !(urmator?.event === 'call' && pas.event !== 'call' && pas.event !== 'return'
             && pas.line === urmator.line)
  })
}

export function normalizeaza(opt, { cod, intrare = '' }) {
  const trace = scoateOpririlePeAcolada(Array.isArray(opt?.trace) ? opt.trace : [])

  // --- remaparea adreselor ---------------------------------------------------
  //
  // Adresele reale (0x5C7BC80) nu spun nimic unui elev si fac schema ilizibila.
  // Le inlocuim cu 0x100, 0x110, 0x120... in ordinea in care blocurile apar
  // prima data in trace, adica exact ordinea alocarii lor cu "new".
  const adrese = new Map()

  for (const pas of trace)
    for (const adresa of Object.keys(pas.heap ?? {}))
      if (!adrese.has(adresa))
        adrese.set(adresa, `0x${(0x100 + adrese.size * 0x10).toString(16).toUpperCase()}`)

  const tradAdresa = (valoare) => {
    if (valoare === null || valoare === undefined || valoare === '0x0') return null
    return adrese.get(valoare) ?? String(valoare)
  }

  function citesteData(v) {
    const tip = String(v[2])
    const valoare = v[3]

    if (valoare === '<UNINITIALIZED>' || valoare === '<UNALLOCATED>')
      return { tip, val: '?', pointer: false }

    if (tip === 'pointer' || tip === 'ref') {
      const tinta = tradAdresa(valoare)
      return { tip: 'pointer', val: tinta ?? 'NULL', pointer: tinta !== null }
    }

    if (typeof valoare === 'string') return { tip, val: valoare, pointer: false }
    return { tip, val: String(valoare), pointer: false }
  }

  function listaVariabile(numeOrdonate, codate) {
    const rezultat = []
    for (const nume of numeOrdonate ?? []) {
      const v = codate?.[nume]
      if (v === undefined) continue
      if (esteData(v)) rezultat.push({ nume, ...citesteData(v) })
      else rezultat.push({ nume, tip: '', val: '...', pointer: false })
    }
    return rezultat
  }

  // Un bloc de heap este mereu un C_ARRAY cu heap_block: true. Daca are un singur
  // element si acela e un struct, il aratam ca nod; altfel ca tablou.
  function citesteBlocHeap(adresa, v) {
    const adr = adrese.get(adresa) ?? adresa
    if (!esteArray(v)) return { adr, fel: 'tablou', tip: '', elemente: [] }

    const elemente = elementeArray(v)

    if (elemente.length === 1 && esteStruct(elemente[0])) {
      const s = elemente[0]
      const campuri = []
      for (const c of s.slice(3)) {
        if (!Array.isArray(c)) continue
        const [nume, valoare] = c
        if (estePadding(nume)) continue
        if (esteData(valoare)) campuri.push({ nume, ...citesteData(valoare) })
      }
      return { adr, fel: 'nod', tip: numeStruct(s), campuri }
    }

    return {
      adr,
      fel: 'tablou',
      tip: elemente.length > 0 && esteData(elemente[0]) ? String(elemente[0][2]) : '',
      elemente: elemente.map((el, idx) => ({ idx, val: esteData(el) ? citesteData(el).val : '...' })),
    }
  }

  // --- traducerea pasilor ----------------------------------------------------

  const pasi = trace.slice(0, MAX_PASI).map((pas) => ({
    eveniment: traduceEveniment[pas.event] ?? 'linie',
    linie: pas.line,
    stiva: (pas.stack_to_render ?? []).map((cadru) => ({
      functie: numeScurt(cadru.func_name),
      activ: Boolean(cadru.is_highlighted),
      linie: cadru.line ?? null,
      locale: listaVariabile(cadru.ordered_varnames, cadru.encoded_locals),
    })),
    globale: listaVariabile(pas.ordered_globals, pas.globals),
    heap: Object.entries(pas.heap ?? {}).map(([adresa, v]) => citesteBlocHeap(adresa, v)),
    consola: pas.stdout ?? '',
  }))

  const rezultat = { cod, intrare, pasi }
  if (trace.length > MAX_PASI) rezultat.trunchiat = trace.length

  const ultim = trace.at(-1)
  if (ultim?.event === 'uncaught_exception' || ultim?.exception_msg)
    rezultat.exceptie = ultim.exception_msg ?? 'Programul s-a oprit cu eroare.'

  return rezultat
}
