// Transforma fisierul .vgtrace brut in pasi de executie.
//
// Formatul brut: inregistrari separate de linia "=== pg_trace_inst ===".
// Fiecare inregistrare contine:
//   - o linie JSON cu starea (stiva, globale, heap),
//   - optional linii "ERROR: ..." pentru exceptii,
//   - optional o linie "STDOUT: ..." cu iesirea de pana acum, codata ca sir JSON.
//
// "pg" din pg_trace_inst vine de la Philip Guo - acelasi Valgrind sta si sub
// pythontutor, si sub SeePlusPlus.
//
// DE VERIFICAT la primul build real: numele exacte ale campurilor din linia JSON.
// Acceptam si snake_case (pythontutor), si camelCase (SeePlusPlus), tocmai ca sa
// nu depindem de varianta.

const SEPARATOR = '=== pg_trace_inst ==='

// Ia prima cheie care exista dintre variantele date.
function camp(obiect, ...variante) {
  for (const v of variante)
    if (obiect[v] !== undefined) return obiect[v]
  return undefined
}

function normalizeazaInregistrare(brut) {
  return {
    eveniment: camp(brut, 'event') ?? 'step_line',
    linie: camp(brut, 'line'),
    numeFunctie: camp(brut, 'func_name', 'funcName'),
    stiva: camp(brut, 'stack_to_render', 'stackToRender') ?? [],
    globale: camp(brut, 'globals') ?? {},
    globaleOrdonate: camp(brut, 'ordered_globals', 'orderedGlobals') ?? [],
    heap: camp(brut, 'heap') ?? {},
    consola: camp(brut, 'stdout') ?? '',
    exceptie: camp(brut, 'exception_msg', 'exceptionMsg'),
  }
}

export function parseVgTrace(vgtrace) {
  const pasi = []
  let curent = null
  let erori = []

  const finalizeaza = () => {
    if (curent === null) return
    const pas = normalizeazaInregistrare(curent)
    if (erori.length > 0 && !pas.exceptie) pas.exceptie = erori.join('\n')
    pasi.push(pas)
    curent = null
    erori = []
  }

  for (const linieBruta of vgtrace.split('\n')) {
    const linie = linieBruta.trimEnd()

    if (linie === SEPARATOR) { finalizeaza(); continue }
    if (linie === '') continue

    if (linie.startsWith('ERROR: ')) { erori.push(linie.slice(7)); continue }

    if (linie.startsWith('STDOUT: ')) {
      const rest = linie.slice(8)
      curent ??= {}
      try { curent.stdout = JSON.parse(rest) } catch { curent.stdout = rest }
      continue
    }

    // Orice altceva ar trebui sa fie JSON. Liniile pe care nu le intelegem sunt
    // ignorate in tacere: Valgrind mai scrie si mesaje proprii in trace.
    try {
      const obiect = JSON.parse(linie)
      if (obiect && typeof obiect === 'object') curent = { ...(curent ?? {}), ...obiect }
    } catch {
      // ignorat intentionat
    }
  }

  finalizeaza()
  return pasi
}
