// Verifica un trace generat, comparandu-l cu invariantii trace-ului pe care a
// fost scrisa lectia, si raporteaza prin adnotari GitHub Actions.
//
// Log-urile complete de Actions cer autentificare, dar adnotarile ::notice:: si
// ::error:: se vad public. De aceea scoatem aici si statisticile, nu doar
// verdictul - altfel nu putem depana fara login.
//
//   node ci/verifica.mjs <nume> <trace.json> [cod-iesire-cli] [fisier-stderr]

import { readFileSync, existsSync } from 'node:fs'

const [, , nume, caleTrace, codCli = '0', caleStderr] = process.argv

if (!nume || !caleTrace) {
  console.error('Folosire: node ci/verifica.mjs <nume> <trace.json> [cod-cli] [stderr]')
  process.exit(1)
}

// Adnotarile nu suporta linii noi literale.
const adnotare = (fel, titlu, text) =>
  console.log(`::${fel} title=${titlu}::${String(text).replace(/\r?\n/g, '%0A').slice(0, 3500)}`)

if (codCli !== '0') {
  const stderr = caleStderr && existsSync(caleStderr) ? readFileSync(caleStderr, 'utf8') : '(fara stderr)'
  adnotare('error', `${nume}: CLI a esuat`, `cod ${codCli}\n${stderr}`)
  process.exit(1)
}

if (!existsSync(caleTrace)) {
  adnotare('error', `${nume}: lipsa trace`, `${caleTrace} nu exista`)
  process.exit(1)
}

const brut = readFileSync(caleTrace, 'utf8')
let t
try {
  t = JSON.parse(brut)
} catch (e) {
  adnotare('error', `${nume}: JSON invalid`, `${e.message}\nInceput: ${brut.slice(0, 500)}`)
  process.exit(1)
}

const pasi = t.pasi ?? []
const ultim = pasi.at(-1)
const maxHeap = Math.max(0, ...pasi.map((p) => p.heap?.length ?? 0))
const maxStiva = Math.max(0, ...pasi.map((p) => p.stiva?.length ?? 0))
const consola = ultim?.consola ?? ''
const secventa = pasi.map((x) => `${x.linie}${x.eveniment === 'linie' ? '' : ':' + x.eveniment}`)

// Semnatura stivei, cu tot cu locale. Comparatia pe (linie, eveniment) singura a
// lasat sa treaca un cadru de apel etichetat gresit - de aceea si continutul.
const cadru = (c) =>
  `${c.functie}@${c.linie}${c.activ ? '*' : ''}{${(c.locale ?? []).map((v) => `${v.nume}=${v.val}`).join(',')}}`
const stive = pasi.map((x) => (x.stiva ?? []).map(cadru).join(' | '))
const adrese = [...new Set(pasi.flatMap((x) => (x.heap ?? []).map((h) => h.adr)))]
const globale = (ultim?.globale ?? []).map((v) => `${v.nume}=${v.val}`)

const probleme = []

// --- verificari generale ------------------------------------------------------

if (pasi.length === 0) probleme.push('Trace gol.')
if (t.exceptie) probleme.push(`Programul s-a oprit cu eroare: ${t.exceptie}`)

// --- comparatie cu trace-ul pe care a fost scrisa lectia ----------------------
//
// Lectiile fac afirmatii concrete: "ruleaza pana la pasul 45", adresele sunt
// 0x100..0x160, a[0] ramane "?". Daca noul motor produce alta secventa, lectia
// devine gresita fara ca nimeni sa observe. De aceea comparatia e obligatorie,
// nu informativa - un exemplu fara referinta e o eroare, nu o omisiune.

const caleRef = new URL(`./referinte/${nume}.json`, import.meta.url)

if (!existsSync(caleRef)) {
  probleme.push(`Nu exista ci/referinte/${nume}.json - nu pot verifica fata de lectie.`)

  // Propunem referinta, ca sa nu fie nevoie de reconstruit de mana. NU o scriem
  // singuri: pasul de verificat manual - "e chiar ce ar trebui sa vada elevul?" -
  // e tot rostul referintei.
  const propunere = {
    sursa: 'DE VERIFICAT MANUAL inainte de a fi acceptata ca referinta',
    pasi: pasi.length,
    secventa,
    stive,
    adreseHeap: adrese,
    globaleFinale: globale,
    consolaFinala: consola,
    maxHeap,
    maxStiva,
  }
  adnotare('notice', `${nume}: referinta propusa`, JSON.stringify(propunere, null, 2))
} else {
  const ref = JSON.parse(readFileSync(caleRef, 'utf8'))

  if (secventa.length !== ref.secventa.length)
    probleme.push(`pasi: referinta ${ref.secventa.length}, acum ${secventa.length}`)

  // Primul loc unde secventele nu mai coincid - acolo e cauza.
  const n = Math.min(secventa.length, ref.secventa.length)
  let i = 0
  while (i < n && secventa[i] === ref.secventa[i]) i++
  if (i < n) {
    const de = (a) => a.slice(Math.max(0, i - 4), i + 6).join(' ')
    probleme.push(`prima divergenta la pasul ${i}:`)
    probleme.push(`  referinta: ${de(ref.secventa)}`)
    probleme.push(`  acum:      ${de(secventa)}`)
  }

  // Referintele mai vechi nu au semnaturi de stiva; le comparam doar cand exista.
  if (Array.isArray(ref.stive)) {
    const m = Math.min(stive.length, ref.stive.length)
    let j = 0
    while (j < m && stive[j] === ref.stive[j]) j++
    if (j < m) {
      probleme.push(`stiva difera la pasul ${j}:`)
      probleme.push(`  referinta: ${ref.stive[j]}`)
      probleme.push(`  acum:      ${stive[j]}`)
    }
  }

  if (adrese.join(' ') !== ref.adreseHeap.join(' '))
    probleme.push(`adrese heap: referinta [${ref.adreseHeap}], acum [${adrese}]`)

  if (globale.join(' ') !== ref.globaleFinale.join(' '))
    probleme.push(`globale finale: referinta [${ref.globaleFinale}], acum [${globale}]`)

  if (consola !== ref.consolaFinala)
    probleme.push(`consola: referinta ${JSON.stringify(ref.consolaFinala)}, acum ${JSON.stringify(consola)}`)

  if (maxStiva !== ref.maxStiva)
    probleme.push(`adancime stiva: referinta ${ref.maxStiva}, acum ${maxStiva}`)

  if (maxHeap !== ref.maxHeap)
    probleme.push(`blocuri heap: referinta ${ref.maxHeap}, acum ${maxHeap}`)
}

// --- raport -------------------------------------------------------------------

const rezumat = [
  `octeti JSON: ${brut.length}`,
  `pasi: ${pasi.length}`,
  `consola finala: ${JSON.stringify(consola)}`,
  `max blocuri heap: ${maxHeap}`,
  `max cadre stiva: ${maxStiva}`,
  `globale finale: ${globale.join(' ') || '(fara globale)'}`,
  `functii vazute: ${[...new Set(pasi.flatMap((p) => (p.stiva ?? []).map((c) => c.functie)))].join(', ')}`,
  `evenimente: ${[...new Set(pasi.map((p) => p.eveniment))].join(', ')}`,
  '',
  'stiva la pasii care conteaza (primii doi, apeluri si retururi):',
  ...pasi
    .map((p, i) => [i, p])
    .filter(([i, p]) => i < 2 || p.eveniment !== 'linie')
    .slice(0, 14)
    .map(([i, p]) => `  ${String(i).padStart(3)}: linia ${String(p.linie).padStart(3)} ${p.eveniment.padEnd(5)} ${stive[i]}`),
].join('\n')

console.log(`--- ${nume} ---\n${rezumat}`)

if (probleme.length > 0) {
  adnotare('error', `${nume}: nu corespunde lectiei`, `${probleme.join('\n')}\n\n${rezumat}`)
  for (const p of probleme) console.error(`FAIL: ${p}`)
  process.exit(1)
}

adnotare('notice', `${nume}: OK`, rezumat)
