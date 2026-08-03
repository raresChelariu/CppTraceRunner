# De verificat la primul build cu Docker real

Codul din `src/` a fost scris pornind de la documentatia si sursele
[SeePlusPlus](https://github.com/knazir/SeePlusPlus), **fara sa fi rulat vreodata
Valgrind-ul modificat**. Lista de mai jos e ce trebuie confirmat inainte sa
consideram runner-ul functional. In ordinea in care crapa.

## 1. Se compileaza SPP-Valgrind in `debian:bookworm`?

```bash
docker build -t cpp-trace-runner .
```

Riscul principal din tot proiectul. README-ul lor spune ca fork-ul e Valgrind
**3.27.0**, modernizat pentru ARM64 si binare GCC 11+, deci sansele sunt bune —
dar nu e verificat pe bookworm.

Daca esueaza: incearca `ubuntu:22.04` sau `ubuntu:24.04` ca baza in etapa 1.
Atentie sa ramana **acelasi glibc** in ambele etape, altfel Valgrind-ul copiat nu
porneste.

## 2. Numele exacte ale campurilor din `.vgtrace`

`src/parseVgTrace.mjs` presupune ca fiecare inregistrare are o linie JSON cu
campuri de tipul `event`, `line`, `stack_to_render`, `globals`,
`ordered_globals`, `heap`. Accepta si camelCase, dar **nu am vazut fisierul**.

Verificare:

```bash
docker run --rm -i cpp-trace-runner cli - "6 1 2 3 1 2 3" \
  < exemple/lista-dublata.cpp > /tmp/trace.json
```

Daca iese gol sau cu campuri lipsa, scoate `.vgtrace`-ul brut si uita-te la el:
adauga temporar un `console.error(vgtrace.slice(0, 3000))` in `src/traseaza.mjs`.

Referinta: `backend/src/parse_vg_trace.ts` din SeePlusPlus (MIT) — separatorul e
`=== pg_trace_inst ===`, iar `ExecutionPoint` are exact campurile de mai sus in
camelCase.

## 3. Redirectarea stdout catre un fisier seekable

Cea mai subtila parte, in `src/ruleaza.mjs`.

Valgrind-ul modificat **citeste inapoi din descriptorul 1** ca sa stie ce a afisat
programul pana la fiecare pas. Are nevoie de un fisier obisnuit, pe care poate
face `lseek` — un pipe **nu** merge. In shell asta se scrie `exec 1<>fisier`; noi
deschidem fisierul cu `'w+'` si dam descriptorul ca stdout.

**Simptom daca e gresit:** trace-ul are pasi corecti, dar campul `consola` e gol
peste tot. Daca vezi asta, aici e cauza.

## 4. Merge stdin?

SeePlusPlus **nu** suporta stdin — `handler.py` primeste doar codul. Noi
redirectam `intrare.txt` catre program. E cod nou, netestat de nimeni.

`lista-dublata.cpp` citeste `6` si apoi sase numere, deci daca stdin-ul nu merge,
programul blocheaza sau citeste gunoi si trace-ul iese scurt.

## 5. Ruleaza Valgrind sub restrictiile de container?

Valgrind ruleaza in user space si trebuie sa poata face `mmap` la adrese
specifice. In Docker standard merge. `compose.yml` are deja `cap_drop: ALL`,
`no-new-privileges` si `pids_limit`, tocmai ca sa aflam local daca ceva il
deranjeaza:

```bash
docker compose up --build
```

**In Azure Container Apps nu e confirmat.** De testat efectiv la primul deploy,
nu de presupus. Pe AWS Lambda se stie ca merge (SeePlusPlus ruleaza asa in
productie) — daca Container Apps refuza, aia e ruta de rezerva.

## 6. Iese acelasi trace ca al lui pythontutor?

Comparatie cu ce e deja in `AlgPlayground/docs/public/traces/lista-dublata.json`.

Nu se va potrivi la octet — pythontutor folosea g++ 9.3.0, noi folosim g++ 12 din
bookworm, iar Valgrind-ul e alta versiune. Ce trebuie sa se potriveasca:

- numarul de pasi, aproximativ;
- adresele remapate: `0x100`, `0x110`, `0x120`... in ordinea alocarii;
- `a[0]` ramane `?` tot timpul (vezi lectia);
- localele lui `FLsiDublu` au `?` pana primesc valoare, globalele pornesc de la `0`;
- consola finala: `3`.

Astea sunt exact lucrurile pe care le explica lectia
[debugger.md](https://github.com/raresChelariu/AlgPlayground/blob/master/docs/cpp/unelte/debugger.md).
Daca vreunul difera, lectia devine gresita — deci verificarea asta nu e optionala.

## 7. Cat dureaza si cat consuma?

Pentru dimensionarea Container App-ului si estimarea free grantului:

```bash
time docker run --rm -i cpp-trace-runner cli - "6 1 2 3 1 2 3" < exemple/lista-dublata.cpp > /dev/null
docker stats --no-stream
```

Planul presupune ~3 s si 2 vCPU / 4 GiB. Daca iese mult mai lent, se recalculeaza
cele ~30.000 de rulari gratuite pe luna.
