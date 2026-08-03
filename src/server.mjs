// Server HTTP fara dependinte externe. In fata lui sta un Worker Cloudflare care
// se ocupa de CORS, Turnstile si rate limit - aici verificam doar un secret
// partajat, ca endpoint-ul sa nu fie apelabil direct daca ajunge public.

import { createServer } from 'node:http'
import { traseaza, EroareRulare } from './traseaza.mjs'

const PORT = Number(process.env.PORT ?? 8080)
const SECRET = process.env.SECRET_APEL ?? ''
const MAX_SIMULTAN = Number(process.env.MAX_SIMULTAN ?? 2)
const MAX_CORP = 128 * 1024

let inCurs = 0

function raspunde(res, stare, obiect) {
  const corp = JSON.stringify(obiect)
  res.writeHead(stare, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(corp),
  })
  res.end(corp)
}

function citesteCorp(req) {
  return new Promise((rezolva, respinge) => {
    let date = ''
    req.on('data', (b) => {
      date += b
      if (date.length > MAX_CORP) {
        respinge(new EroareRulare('preaMare', 'Cerere prea mare.'))
        req.destroy()
      }
    })
    req.on('end', () => rezolva(date))
    req.on('error', respinge)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sanatate')
    return raspunde(res, 200, { ok: true })

  if (req.method !== 'POST' || req.url !== '/trace')
    return raspunde(res, 404, { eroare: 'necunoscut', mesaje: 'Foloseste POST /trace.' })

  if (SECRET && req.headers['x-secret-apel'] !== SECRET)
    return raspunde(res, 401, { eroare: 'neautorizat', mesaje: 'Secret lipsa sau gresit.' })

  // Fara asta, o clasa intreaga care apasa Run simultan da OOM.
  if (inCurs >= MAX_SIMULTAN)
    return raspunde(res, 429, { eroare: 'ocupat', mesaje: 'Prea multe rulari simultane. Reincearca.' })

  inCurs++
  try {
    const corp = await citesteCorp(req)

    let cerere
    try {
      cerere = JSON.parse(corp)
    } catch {
      return raspunde(res, 400, { eroare: 'cerere', mesaje: 'Corp JSON invalid.' })
    }

    if (typeof cerere?.cod !== 'string' || cerere.cod.trim() === '')
      return raspunde(res, 400, { eroare: 'cerere', mesaje: 'Campul "cod" lipseste.' })

    const rezultat = await traseaza(cerere.cod, String(cerere.intrare ?? ''))
    raspunde(res, 200, rezultat)
  } catch (e) {
    if (e instanceof EroareRulare) {
      const stare = e.fel === 'compilare' ? 400 : e.fel === 'preaMare' ? 413 : 422
      return raspunde(res, stare, { eroare: e.fel, mesaje: e.mesaje })
    }
    console.error(e)
    raspunde(res, 500, { eroare: 'intern', mesaje: 'Eroare interna.' })
  } finally {
    inCurs--
  }
})

server.listen(PORT, () => console.log(`Ascult pe :${PORT} (max ${MAX_SIMULTAN} rulari simultane)`))
