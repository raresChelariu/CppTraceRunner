# cpp-trace-runner

Genereaza trace-uri de executie pas cu pas pentru programe C++, pentru
vizualizatorul `DebuggerVisual` din [AlgPlayground](https://github.com/raresChelariu/AlgPlayground).

Ruleaza codul sub un Valgrind modificat si intoarce, pentru fiecare linie
executata: stiva de apeluri, variabilele locale si globale, heap-ul cu pointerii
dintre blocuri si iesirea de pana atunci.

## O imagine, doi consumatori

| Consumator | Cand | Mod | Cost |
|---|---|---|---|
| Trace-urile lectiilor (~200) | la build, in GitHub Actions | CLI, one-shot | 0 |
| Playground cu cod arbitrar | la cerere | server HTTP, Azure Container Apps | 0 sub free grant |

Aceeasi imagine, publicata o data pe `ghcr.io`.

## Cum functioneaza

```
  sursa.cpp + intrare
        |
        v
  g++ -std=c++17 -ggdb -O0 -fno-omit-frame-pointer
        |
        v
  valgrind --tool=memcheck --source-filename=... --trace-filename=... --read-var-info=yes
        |
        v
  fisier .vgtrace brut   (inregistrari separate de "=== pg_trace_inst ===")
        |
        v
  src/parseVgTrace.mjs   -> pasi bruti, cu valori codate C_DATA / C_STRUCT / C_ARRAY
        |
        v
  src/normalizeaza.mjs   -> { cod, intrare, pasi }
```

Ultimul format e **identic** cu cel consumat azi de `DebuggerVisual.vue`, deci
componenta nu se modifica.

## Motorul de trace

Foloseste [knazir/SPP-Valgrind](https://github.com/knazir/SPP-Valgrind) — Valgrind
**3.27.0**, modernizat de la 3.11.0, cu suport pentru ARM64 si binare compilate cu
GCC 11+.

Filiatia merita stiuta: flag-urile `--source-filename`, `--trace-filename` si
`--read-var-info` nu exista in Valgrind-ul obisnuit. Vin din fork-ul lui Philip
Guo folosit de **pythontutor** (`opt-cpp-backend`), iar SPP-Valgrind e un
descendent modernizat al lui. De aceea formatul de iesire e acelasi, si putem
refolosi logica de decodare scrisa deja pentru pythontutor.

> `pgbovine/opt-cpp-backend` returneaza azi 404. Fork-ul supravietuitor e
> [JuezUN/opt-cpp-backend](https://github.com/JuezUN/opt-cpp-backend). Nu il
> folosim — SPP-Valgrind e mai nou si intretinut.

Licenta: acest repo e MIT, dar SPP-Valgrind e derivat din Valgrind si ramane
**GPL**. Rularea ca serviciu web nu obliga la nimic (nu e AGPL), dar
redistribuirea imaginii trebuie sa respecte termenii GPL pentru acea parte.

## Dezvoltare

Are nevoie de Docker. Daca masina ta nu are virtualizare, foloseste **GitHub
Codespaces** — `.devcontainer/` e configurat cu docker-in-docker.

```bash
npm run build      # docker build -t cpp-trace-runner:ci .
npm test           # ruleaza toate exemplele si le compara cu referintele
```

```bash
# CLI, o singura rulare
docker run --rm -i cpp-trace-runner:ci cli - "6 1 2 3 1 2 3" < exemple/lista-dublata.cpp

# server HTTP
docker run --rm -p 8080:8080 cpp-trace-runner:ci
curl -X POST localhost:8080/trace -H 'content-type: application/json' \
  -d '{"cod":"#include <iostream>\nint main(){int x=1;return 0;}","intrare":""}'
```

## Teste

`npm test` (adica `ci/testeaza.sh`) ruleaza fiecare `exemple/*.cpp` cu intrarea din
`.in`-ul de alaturi si compara rezultatul cu `ci/referinte/<nume>.json`. **Acelasi
script ruleaza si in CI**, ca sa nu existe "merge la mine dar pica in CI".

Referintele contin, pentru fiecare pas: linia, evenimentul, **semnatura completa a
stivei** (functii, linii, variabile locale si valorile lor), adresele de heap,
consola si globalele finale. Comparatia raporteaza **primul** pas care difera.

Semnatura stivei a fost adaugata dupa ce un cadru de apel etichetat gresit a trecut
nevazut prin CI verde — se comparau doar `(linie, eveniment)`. Daca adaugi un camp
nou in trace, adauga-l si in comparatie.

### Un exemplu nou

1. scrii `exemple/nume.cpp` si `exemple/nume.in`;
2. rulezi `npm test` — pica, pentru ca nu exista referinta, dar **afiseaza
   semnatura stivei**;
3. verifici manual iesirea: e chiar ce ar trebui sa vada elevul?
4. abia apoi scrii `ci/referinte/nume.json`.

Pasul 3 nu e formal. Un exemplu fara referinta e tratat ca eroare, nu ca omisiune,
tocmai ca sa nu se strecoare exemple neverificate.

## API

### `POST /trace`

```json
{ "cod": "...", "intrare": "6\n1 2 3 1 2 3" }
```

Raspuns la succes — exact structura asteptata de `DebuggerVisual`:

```json
{ "cod": "...", "intrare": "...", "pasi": [ { "eveniment": "linie", "linie": 12, "stiva": [...], "globale": [...], "heap": [...], "consola": "" } ] }
```

Raspuns la eroare:

```json
{ "eroare": "compilare", "mesaje": "prog.cpp:5:1: error: expected ';'..." }
```

`eroare` poate fi `compilare`, `executie`, `timeout` sau `preaMare`.

### `GET /sanatate`

`200 {"ok":true}` — pentru probe-urile Container Apps.

## Limite

| | |
|---|---|
| Sursa | 64 KB |
| Intrare | 16 KB |
| Timeout compilare | 30 s |
| Timeout executie | 60 s |
| Pasi in trace | 1000 (ca la pythontutor) |
| stdout | 64 KB |

## Stare

Vezi [DE-VERIFICAT.md](DE-VERIFICAT.md) — lucrurile care trebuie confirmate la
prima rulare cu Docker real.
