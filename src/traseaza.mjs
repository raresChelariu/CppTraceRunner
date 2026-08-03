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

  if (!Array.isArray(opt?.trace) || opt.trace.length === 0)
    throw new EroareRulare('executie',
      `Trace-ul convertit nu contine pasi. vgtrace avea ${vgtrace.length} octeti. ` +
      `Chei OPT: ${Object.keys(opt ?? {}).join(',')}. ` +
      `stderr convertor: ${JSON.stringify((stderrConvertor ?? '').slice(0, 600))}`)

  const rezultat = normalizeaza(opt, { cod, intrare })

  // Iesirea completa a programului, utila la afisare langa vizualizator.
  rezultat.iesire = iesire

  // Avertismentele de la g++ raman utile intr-un context didactic.
  if (stderrCompilare?.trim()) rezultat.avertismente = stderrCompilare.trim()

  return rezultat
}
