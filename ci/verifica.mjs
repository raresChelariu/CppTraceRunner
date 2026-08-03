// Verifica un trace generat si raporteaza prin adnotari GitHub Actions.
//
// Log-urile complete de Actions cer autentificare, dar adnotarile ::notice:: si
// ::error:: se vad public. De aceea scoatem aici si statisticile, nu doar
// verdictul - altfel nu putem depana fara login.
//
//   node ci/verifica.mjs trace.json [cod-iesire-cli] [fisier-stderr]

import { readFileSync, existsSync } from 'node:fs'

const [, , caleTrace, codCli = '0', caleStderr] = process.argv

// Adnotarile nu suporta linii noi literale.
const adnotare = (fel, titlu, text) =>
  console.log(`::${fel} title=${titlu}::${String(text).replace(/\r?\n/g, '%0A').slice(0, 3500)}`)

if (codCli !== '0') {
  const stderr = caleStderr && existsSync(caleStderr) ? readFileSync(caleStderr, 'utf8') : '(fara stderr)'
  adnotare('error', 'CLI a esuat', `cod ${codCli}\n${stderr}`)
  process.exit(1)
}

if (!existsSync(caleTrace)) {
  adnotare('error', 'Lipsa trace', `${caleTrace} nu exista`)
  process.exit(1)
}

const brut = readFileSync(caleTrace, 'utf8')
let t
try {
  t = JSON.parse(brut)
} catch (e) {
  adnotare('error', 'JSON invalid', `${e.message}\nInceput: ${brut.slice(0, 500)}`)
  process.exit(1)
}

// --- statistici, raportate mereu ---------------------------------------------

const pasi = t.pasi ?? []
const ultim = pasi.at(-1)
const maxHeap = Math.max(0, ...pasi.map((p) => p.heap?.length ?? 0))
const maxStiva = Math.max(0, ...pasi.map((p) => p.stiva?.length ?? 0))
const consola = ultim?.consola ?? ''

const rezumat = [
  `octeti JSON: ${brut.length}`,
  `pasi: ${pasi.length}`,
  `consola finala: ${JSON.stringify(consola)}`,
  `max blocuri heap: ${maxHeap}`,
  `max cadre stiva: ${maxStiva}`,
  `globale in ultimul pas: ${(ultim?.globale ?? []).map((v) => `${v.nume}=${v.val}`).join(' ')}`,
  `functii vazute: ${[...new Set(pasi.flatMap((p) => (p.stiva ?? []).map((c) => c.functie)))].join(', ')}`,
  `evenimente: ${[...new Set(pasi.map((p) => p.eveniment))].join(', ')}`,
  `primul pas: ${JSON.stringify(pasi[0] ?? null).slice(0, 600)}`,
  `un pas cu heap: ${JSON.stringify(pasi.find((p) => p.heap?.length > 0) ?? null).slice(0, 800)}`,
].join('\n')

adnotare('notice', 'Rezumat trace', rezumat)
console.log(rezumat)

// --- verificari ---------------------------------------------------------------

const probleme = []

if (pasi.length < 10) probleme.push(`Doar ${pasi.length} pasi - trace-ul pare gol.`)
if (!consola.includes('3')) probleme.push(`Consola finala ${JSON.stringify(consola)} nu contine "3".`)
if (maxHeap === 0) probleme.push('Heap gol - nodurile alocate cu new lipsesc din trace.')
if (maxStiva < 2) probleme.push('Stiva nu ajunge la doua cadre - apelul lui FLsiDublu nu apare.')

// Lectia se bazeaza pe faptul ca localele neinitializate apar cu "?".
const areNeinitializate = pasi.some((p) =>
  (p.stiva ?? []).some((c) => (c.locale ?? []).some((v) => v.val === '?')))
if (!areNeinitializate) probleme.push('Nicio locala cu "?" - lectia despre variabile neinitializate ar deveni gresita.')

// --- comparatie cu trace-ul pe care a fost scrisa lectia ----------------------
//
// Lectia debugger.md face afirmatii concrete: "ruleaza pana la pasul 45",
// adresele sunt 0x100..0x160, a[0] ramane "?". Daca noul motor produce alta
// secventa, lectia devine gresita fara ca nimeni sa observe. De aceea comparam
// cu invariantii extrasi din trace-ul original (pythontutor, g++ 9.3.0).

const caleRef = new URL('./referinta-lista-dublata.json', import.meta.url)
if (existsSync(caleRef)) {
  const ref = JSON.parse(readFileSync(caleRef, 'utf8'))
  const secventa = pasi.map((x) => `${x.linie}${x.eveniment === 'linie' ? '' : ':' + x.eveniment}`)

  const diferente = []

  if (secventa.length !== ref.secventa.length)
    diferente.push(`pasi: referinta ${ref.secventa.length}, acum ${secventa.length}`)

  // Primul loc unde secventele nu mai coincid - acolo e cauza.
  const n = Math.min(secventa.length, ref.secventa.length)
  let i = 0
  while (i < n && secventa[i] === ref.secventa[i]) i++
  if (i < n || secventa.length !== ref.secventa.length) {
    const de = (a) => a.slice(Math.max(0, i - 4), i + 6).join(' ')
    diferente.push(`prima divergenta la pasul ${i}:`)
    diferente.push(`  referinta: ${de(ref.secventa)}`)
    diferente.push(`  acum:      ${de(secventa)}`)
  }

  const adrese = [...new Set(pasi.flatMap((x) => (x.heap ?? []).map((h) => h.adr)))]
  if (adrese.join(' ') !== ref.adreseHeap.join(' '))
    diferente.push(`adrese heap: referinta [${ref.adreseHeap}], acum [${adrese}]`)

  const globale = (ultim?.globale ?? []).map((v) => `${v.nume}=${v.val}`)
  if (globale.join(' ') !== ref.globaleFinale.join(' '))
    diferente.push(`globale finale: referinta [${ref.globaleFinale}], acum [${globale}]`)

  if (diferente.length > 0) {
    adnotare('warning', 'Diferenta fata de lectie', diferente.join('\n'))
    console.warn(diferente.join('\n'))
  } else {
    console.log('Trace identic cu referinta lectiei.')
  }
}

if (probleme.length > 0) {
  adnotare('error', 'Verificari picate', probleme.join('\n'))
  for (const p of probleme) console.error(`FAIL: ${p}`)
  process.exit(1)
}

console.log('OK')
