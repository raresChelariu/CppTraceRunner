// Leaga cele trei etape: rulare -> parsare -> normalizare.

import { genereazaVgTrace, EroareRulare } from './ruleaza.mjs'
import { parseVgTrace } from './parseVgTrace.mjs'
import { normalizeaza } from './normalizeaza.mjs'

export { EroareRulare }

export async function traseaza(cod, intrare = '') {
  const { vgtrace, iesire, stderrCompilare } = await genereazaVgTrace(cod, intrare)

  // Cu DUMP_VGTRACE=1 scoatem inceputul fisierului brut la stderr. E singurul mod
  // de a vedea formatul real cand nu avem acces la masina care ruleaza.
  if (process.env.DUMP_VGTRACE)
    process.stderr.write(`--- vgtrace brut (${vgtrace.length} octeti) ---\n${vgtrace.slice(0, 3000)}\n--- sfarsit ---\n`)

  const pasiBruti = parseVgTrace(vgtrace)
  if (pasiBruti.length === 0)
    throw new EroareRulare('executie',
      `Trace-ul nu contine niciun pas de executie. Fisierul are ${vgtrace.length} octeti. ` +
      `Inceput: ${JSON.stringify(vgtrace.slice(0, 400))}`)

  const rezultat = normalizeaza(pasiBruti, { cod, intrare })

  // Iesirea completa a programului, utila la afisare langa vizualizator.
  rezultat.iesire = iesire

  // Avertismentele de la g++ (-Wall nu e pornit implicit, dar tot pot aparea).
  if (stderrCompilare?.trim()) rezultat.avertismente = stderrCompilare.trim()

  return rezultat
}
