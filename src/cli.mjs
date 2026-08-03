// Rulare one-shot, folosita de GitHub Actions la generarea trace-urilor pentru
// lectii. Scrie JSON-ul la stdout.
//
//   node src/index.mjs cli exemple/lista-dublata.cpp "6 1 2 3 1 2 3"
//   node src/index.mjs cli - "6 1 2 3 1 2 3" < sursa.cpp

import { readFile } from 'node:fs/promises'
import { traseaza, EroareRulare } from './traseaza.mjs'

const [, , , caleSursa, intrare = ''] = process.argv

if (!caleSursa) {
  console.error('Folosire: node src/index.mjs cli <fisier.cpp|-> [intrare]')
  process.exit(1)
}

async function citesteStdin() {
  const bucati = []
  for await (const b of process.stdin) bucati.push(b)
  return Buffer.concat(bucati).toString('utf8')
}

const cod = caleSursa === '-' ? await citesteStdin() : await readFile(caleSursa, 'utf8')

try {
  const rezultat = await traseaza(cod, intrare)
  process.stdout.write(JSON.stringify(rezultat))
  process.stderr.write(
    `${rezultat.pasi.length} pasi, ${rezultat.heap?.length ?? 0} blocuri, ` +
    `consola finala: ${JSON.stringify(rezultat.pasi.at(-1)?.consola ?? '')}\n`,
  )
} catch (e) {
  if (e instanceof EroareRulare) {
    console.error(`[${e.fel}] ${e.mesaje}`)
    process.exit(2)
  }
  throw e
}
