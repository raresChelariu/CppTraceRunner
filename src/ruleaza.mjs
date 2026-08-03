// Compileaza o sursa C++ si o ruleaza sub Valgrind-ul modificat, producand
// fisierul .vgtrace brut.

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const LIMITE = {
  sursaBytes: 64 * 1024,
  intrareBytes: 16 * 1024,
  timeoutCompilare: 30_000,
  timeoutExecutie: 60_000,
  stdoutBytes: 64 * 1024,
}

// Eroare cu un cod pe care serverul il traduce in raspuns HTTP.
export class EroareRulare extends Error {
  constructor(fel, mesaje) {
    super(mesaje)
    this.fel = fel        // compilare | executie | timeout | preaMare
    this.mesaje = mesaje
  }
}

// Ruleaza un proces si intoarce { cod, stdout, stderr, expirat }.
// stdin-ul si stdout-ul pot fi descriptori de fisier deja deschisi.
function ruleazaProces(comanda, argumente, { timeout, cwd, fdIntrare, fdIesire }) {
  return new Promise((rezolva, respinge) => {
    const proces = spawn(comanda, argumente, {
      cwd,
      stdio: [
        fdIntrare ?? 'ignore',
        fdIesire ?? 'pipe',
        'pipe',
      ],
    })

    let stdout = ''
    let stderr = ''
    let expirat = false

    proces.stdout?.on('data', (b) => { stdout += b })
    proces.stderr.on('data', (b) => { stderr += b })

    const ceas = setTimeout(() => {
      expirat = true
      proces.kill('SIGKILL')
    }, timeout)

    proces.on('error', (e) => { clearTimeout(ceas); respinge(e) })
    proces.on('close', (cod) => {
      clearTimeout(ceas)
      rezolva({ cod, stdout, stderr, expirat })
    })
  })
}

export async function genereazaVgTrace(cod, intrare = '') {
  if (Buffer.byteLength(cod, 'utf8') > LIMITE.sursaBytes)
    throw new EroareRulare('preaMare', `Sursa depaseste ${LIMITE.sursaBytes} octeti.`)

  if (Buffer.byteLength(intrare, 'utf8') > LIMITE.intrareBytes)
    throw new EroareRulare('preaMare', `Datele de intrare depasesc ${LIMITE.intrareBytes} octeti.`)

  const baza = process.env.DIR_LUCRU || tmpdir()
  const dir = await mkdtemp(join(baza, 'rulare-'))

  const caleSursa = join(dir, 'prog.cpp')
  const caleExe = join(dir, 'prog')
  const caleTrace = join(dir, 'prog.vgtrace')
  const caleIntrare = join(dir, 'intrare.txt')
  const caleIesire = join(dir, 'iesire.txt')

  let fdIntrare = null
  let fdIesire = null

  try {
    await writeFile(caleSursa, cod.replace(/\r\n/g, '\n'), 'utf8')
    await writeFile(caleIntrare, intrare.endsWith('\n') || intrare === '' ? intrare : intrare + '\n', 'utf8')

    // --- compilare ---------------------------------------------------------
    //
    // Numele sunt RELATIVE, iar procesele ruleaza cu cwd = dir. Valgrind-ul
    // modificat compara --source-filename cu numele inregistrat in DWARF, iar
    // g++ scrie acolo exact sirul primit in linia de comanda. Daca dam cale
    // absoluta la compilare si alta forma la valgrind, nu se instrumenteaza
    // nicio linie si trace-ul iese gol - fara niciun mesaj de eroare.
    // pythontutor lucreaza la fel: compileaza usercode.cpp in directorul curent.
    const compilare = await ruleazaProces('g++', [
      '-std=c++17',
      '-ggdb',
      '-O0',
      '-fno-omit-frame-pointer',
      '-o', 'prog',
      'prog.cpp',
    ], { timeout: LIMITE.timeoutCompilare, cwd: dir })

    if (compilare.expirat)
      throw new EroareRulare('timeout', 'Compilarea a depasit timpul permis.')

    if (compilare.cod !== 0)
      throw new EroareRulare('compilare', compilare.stderr || compilare.stdout || 'Compilare esuata.')

    // --- executie sub Valgrind ---------------------------------------------
    //
    // DETALIU CRITIC: Valgrind-ul modificat citeste inapoi din descriptorul 1 ca
    // sa stie ce a afisat programul pana la fiecare pas. Pentru asta are nevoie
    // de un fisier obisnuit, pe care poate face lseek - un pipe NU merge.
    //
    // In shell asta se scrie "exec 1<>fisier". In Node, echivalentul e sa deschidem
    // fisierul cu 'w+' (citire+scriere) si sa dam descriptorul ca stdout.
    // Daca punem 'pipe' aici, campul stdout al fiecarui pas iese gol sau gresit.
    fdIntrare = openSync(caleIntrare, 'r')
    fdIesire = openSync(caleIesire, 'w+')

    const executie = await ruleazaProces('valgrind', [
      '--tool=memcheck',
      '--source-filename=prog.cpp',
      '--trace-filename=prog.vgtrace',
      '--read-var-info=yes',
      './prog',
    ], { timeout: LIMITE.timeoutExecutie, cwd: dir, fdIntrare, fdIesire })

    closeSync(fdIntrare); fdIntrare = null
    closeSync(fdIesire); fdIesire = null

    if (executie.expirat)
      throw new EroareRulare('timeout', 'Executia a depasit timpul permis.')

    let vgtrace
    try {
      vgtrace = await readFile(caleTrace, 'utf8')
    } catch {
      throw new EroareRulare('executie',
        `Valgrind nu a produs fisier de trace.\n${executie.stderr.slice(0, 2000)}`)
    }

    let iesire = await readFile(caleIesire, 'utf8')
    if (iesire.length > LIMITE.stdoutBytes)
      iesire = iesire.slice(0, LIMITE.stdoutBytes) + '\n[...iesire trunchiata...]'

    return {
      vgtrace,
      iesire,
      stderrCompilare: compilare.stderr,   // avertismentele de la g++ raman utile
      stderrValgrind: executie.stderr,
    }
  } finally {
    if (fdIntrare !== null) try { closeSync(fdIntrare) } catch {}
    if (fdIesire !== null) try { closeSync(fdIesire) } catch {}
    await rm(dir, { recursive: true, force: true })
  }
}
