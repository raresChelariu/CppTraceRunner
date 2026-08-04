// Leaga etapele: compilare + valgrind -> conversie in format OPT -> normalizare.

import { genereazaVgTrace, EroareRulare } from './ruleaza.mjs'
import { normalizeaza } from './normalizeaza.mjs'

export { EroareRulare }

export async function traseaza(cod, intrare = '') {
  const { opt, vgtrace, iesire, stderrCompilare, stderrValgrind, stderrConvertor } =
    await genereazaVgTrace(cod, intrare)

  // Cu DUMP_VGTRACE=1 scoatem inceputul fisierului brut la stderr. E singurul mod
  // de a vedea formatul real cand nu avem acces la masina care ruleaza.
  if (process.env.DUMP_VGTRACE) {
    process.stderr.write(`--- vgtrace brut (${vgtrace.length} octeti) ---\n${vgtrace.slice(0, 2000)}\n--- sfarsit ---\n`)
    process.stderr.write(`--- stderr valgrind ---\n${(stderrValgrind ?? '').slice(0, 1000)}\n--- sfarsit ---\n`)
    process.stderr.write(`--- stderr convertor ---\n${(stderrConvertor ?? '').slice(0, 2000)}\n--- sfarsit ---\n`)
    process.stderr.write(`--- OPT: ${(opt?.trace ?? []).length} pasi, chei: ${Object.keys(opt ?? {}).join(',')} ---\n`)
  }

  // Structura OPT inainte de filtrele din normalizeaza - singurul mod de a vedea
  // ce ne da convertorul cand nu putem rula local.
  if (process.env.DUMP_OPT) {
    const cadru = (c) => `${String(c.func_name ?? '?').split('(')[0]}@${c.line}${c.is_highlighted ? '*' : ''}`
    const rand = (p, i) =>
      `${String(i).padStart(3)}: linia ${String(p.line).padStart(3)} ${String(p.event ?? '?').padEnd(10)}` +
      ` [${(p.stack_to_render ?? []).map(cadru).join(' | ')}]`
    process.stderr.write(`--- OPT brut (${opt.trace.length} pasi) ---\n`)
    process.stderr.write(opt.trace.map(rand).join('\n'))
    process.stderr.write('\n--- sfarsit OPT ---\n')
  }

  if (!Array.isArray(opt?.trace) || opt.trace.length === 0)
    throw new EroareRulare('executie',
      `Trace-ul convertit nu contine pasi. vgtrace avea ${vgtrace.length} octeti. ` +
      `Chei OPT: ${Object.keys(opt ?? {}).join(',')}. ` +
      `stderr convertor: ${JSON.stringify((stderrConvertor ?? '').slice(0, 600))}`)

  const rezultat = normalizeaza(opt, { cod, intrare })

  // Iesirea completa a programului, utila la afisare langa vizualizator.
  rezultat.iesire = iesire

  // Valgrind citeste consola din fisierul in care scrie programul, deci vede
  // doar ce a fost golit din buffer. Un "cout << rez;" fara endl ramane in
  // buffer pana la terminarea programului, si ultimul pas ar arata consola
  // goala desi programul a afisat ceva. Dupa terminare stim tot ce s-a afisat,
  // asa ca ultimul pas primeste iesirea completa.
  const ultim = rezultat.pasi.at(-1)
  if (ultim && iesire.length > (ultim.consola?.length ?? 0)) ultim.consola = iesire

  // Avertismentele de la g++ raman utile intr-un context didactic.
  if (stderrCompilare?.trim()) rezultat.avertismente = stderrCompilare.trim()

  return rezultat
}
