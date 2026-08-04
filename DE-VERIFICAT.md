# Stare: ce e verificat si ce nu

Actualizat dupa prima rulare verde in GitHub Actions.

## Verificat

| # | Ce | Rezultat |
|---|---|---|
| 1 | SPP-Valgrind se compileaza pe `debian:bookworm` | da — `valgrind-3.27.0.GIT`, ~3 min cu cache rece |
| 2 | Formatul `.vgtrace` | **nu** e format OPT. E brut: `{addr,kind,type,size,val}`, chei `stack`/`locals`, fara `heap`, JSON pe mai multe linii. Conversia o face `vg_to_opt_trace.py` |
| 3 | stdout pe fisier seekable | da — consola iese `"3\n"`. Cu un pipe nu ar fi mers |
| 4 | stdin | da — programul citeste `6` si cele sase numere. Cod nou, SeePlusPlus nu are asa ceva |
| 5 | Valgrind sub restrictii de container | da, in Docker standard |
| 6 | Trace-ul corespunde lectiei | da, dupa filtrarea opririi pe acolada — **106 pasi, identic cu originalul** |

Comparatia cu `ci/referinte/*.json` ruleaza la fiecare build si **pica** daca
difera secventa de pasi, **semnatura stivei** (functii, linii, locale si valorile
lor), adresele de heap, consola sau globalele finale.

> Semnatura stivei a fost adaugata dupa ce un cadru de apel etichetat gresit a
> trecut nevazut prin CI verde: se comparau doar `(linie, eveniment)`. Cand
> adaugi un camp nou in trace, adauga-l si in comparatie.

### Cadrul la primul apel dintr-o functie

Prologul functiei apelate nu si-a stabilit inca frame pointer-ul, iar
`vg_to_opt_trace.py` identifica cadrele dupa FP — deci pune in varf o copie a
apelantului:

```
3: linia 11 call [main@17 | main@17*]                  <- ar trebui cub@11
5: linia  7 call [main@17 | cub@12 | patrat@7*]        <- corect, FP deja setat
```

`reparaCadrulDeApel()` din `src/normalizeaza.mjs` il reconstruieste din pasul
urmator, cu toate valorile pe `?`. Rezultatul e **identic caracter cu caracter**
cu ce producea pythontutor, verificat pe `lista-dublata` (106 pasi), care nu a
fost folosita la depanare.

### Detaliul de la punctul 6

SPP-Valgrind emite, la intrarea intr-o functie, un pas pe linia acoladei
deschise, urmat de evenimentul de apel pe aceeasi linie. Valgrind-ul din 2015 nu
il emitea, iar lectia spune explicit ca sageata sare la prima linie **de sub**
acolada. `scoateOpririlePeAcolada()` din `src/normalizeaza.mjs` il elimina.

## De verificat

### A. Pachetul de pe ghcr.io e public?

Imaginile sunt **private implicit**, iar Azure Container Apps nu poate trage una
privata fara credentiale — ceea ce ar anula ideea de a evita registry-ul platit.

*Package settings* → *Change visibility* → **Public**.

Alternativa: `az containerapp registry set` cu un PAT **classic** (token-urile
fine-grained inca nu suporta scope-ul `packages`).

### B. Ruleaza Valgrind in Azure Container Apps?

Valgrind ruleaza in user space si trebuie sa poata face `mmap` la adrese
specifice. In Docker merge (verificat), pe AWS Lambda se stie ca merge
(SeePlusPlus ruleaza asa in productie). **Container Apps nu e testat** — de probat
efectiv la primul deploy, nu de presupus. Daca refuza, Lambda e ruta de rezerva.

### C. Cat dureaza si cat consuma o rulare?

Necesar pentru dimensionarea Container App-ului si pentru estimarea free
grantului. Planul presupune ~3 s la 2 vCPU / 4 GiB, de unde ~30.000 de rulari
gratuite pe luna. De masurat efectiv:

```bash
time docker run --rm -i cpp-trace-runner cli - "6 1 2 3 1 2 3" < exemple/lista-dublata.cpp > /dev/null
```

### D. ~~Programe fara heap, cu apeluri imbricate~~ — facut

Toate cele patru exemple din `AlgPlayground/scripts/exemple/` ruleaza in CI, cu
referinte. Doua lucruri gasite pe parcurs:

- **Consola si buferizarea:** Valgrind afla ce s-a afisat citind fisierul in
  care scrie programul, deci un `cout` fara `endl` parea sa nu afiseze nimic.
  Rezolvat cu `stdbuf -o0`, ca la SeePlusPlus, plus un backstop pe ultimul pas.
- **Primul pas pe acolada lui `main`:** SPP-Valgrind il emite mereu; g++ 9.3 pe
  pythontutor il emitea doar la `lista-dublata`. Am pastrat comportamentul
  consecvent (acolada mereu) si am aliniat referintele exemplelor simple.

**Datorie ramasa pentru regenerare:** la `stiva-apeluri` apare un pas in plus la
inceput, deci in `functii.md` trimiterea "pasul 1 si pasul 3" devine "pasul 2 si
pasul 4". De facut **odata cu** inlocuirea trace-urilor statice, nu inainte —
site-ul live foloseste inca trace-urile vechi.

### D2. ~~Recursivitate~~ — facut

`exemple/recursiv.cpp` (factorial cu `n` citit de la tastatura, adancime 5) e in
CI, cu referinta verificata pas cu pas.

Recursivitatea functioneaza: cadrele sunt reale, parintii isi pastreaza valorile
(`n=4`, `n=3`, `n=2`), iar fiecare apel nou porneste cu `n=?`. A iesit la iveala
o problema mai mica: cadrul nou ramanea pe linia apelantului, deci vizualizatorul
ar fi aratat doua cadre `factorial() ln 8` in timp ce sageata era pe linia 5.

Cauza: apelantul si apelatul au acelasi nume, iar conditia care evita reparatiile
inutile bloca si acest caz. `reparaCadrulDeApel()` trateaza acum doua situatii
separat — cadru complet gresit (reconstructie) si cadru corect cu linie invechita
(doar linia).

Doua nepotriviri de linie raman acceptate, documentate in
`ci/referinte/recursiv.json`.

### D3. Erori de compilare

Nu testam ce se intampla cu cod care nu compileaza. Runner-ul intoarce
`{ eroare: "compilare", mesaje }`, dar nu exista exemplu in CI. Conteaza abia
cand apare playground-ul, unde elevii vor trimite si cod gresit.

### E. Avertismentele DWARF

`evaluate_Dwarf3_Expr: unhandled DW_OP_ 0x9b` apare de zeci de ori la fiecare
rulare. `0x9b` e `DW_OP_form_tls_address`, adresare thread-local din libstdc++ —
vine din bibliotecile de sistem, nu din codul elevului, si nu a afectat trace-ul.
De urmarit daca apare vreodata la variabile din program.
