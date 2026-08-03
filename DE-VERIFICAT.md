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

Comparatia cu `ci/referinta-lista-dublata.json` ruleaza la fiecare build si **pica**
daca secventa de pasi, adresele de heap sau globalele finale difera de trace-ul
pe care a fost scrisa lectia.

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

### D. Programe fara heap, cu recursivitate, cu erori de compilare

Singurul exemplu testat e `lista-dublata.cpp`. Inainte de a genera cele ~200 de
trace-uri ale lectiilor, merita adaugate in CI si celelalte exemple existente din
`AlgPlayground/scripts/exemple/`: `acelasi-nume.cpp`, `parametri-copie.cpp`,
`stiva-apeluri.cpp`.

### E. Avertismentele DWARF

`evaluate_Dwarf3_Expr: unhandled DW_OP_ 0x9b` apare de zeci de ori la fiecare
rulare. `0x9b` e `DW_OP_form_tls_address`, adresare thread-local din libstdc++ —
vine din bibliotecile de sistem, nu din codul elevului, si nu a afectat trace-ul.
De urmarit daca apare vreodata la variabile din program.
