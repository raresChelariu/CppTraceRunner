#!/usr/bin/env bash
#
# Ruleaza toate exemplele prin imagine si le compara cu referintele din
# ci/referinte/. Acelasi script ruleaza si in CI, si local - ca sa nu existe
# "merge la mine dar pica in CI".
#
#   docker build -t cpp-trace-runner .
#   ci/testeaza.sh                      # foloseste cpp-trace-runner:ci
#   ci/testeaza.sh cpp-trace-runner     # sau alta imagine
#   IMAGINE=ghcr.io/rareschelariu/cpptracerunner:latest ci/testeaza.sh
#
# Ruleaza TOATE exemplele inainte sa raporteze, ca sa vedem dintr-o singura
# trecere care merg si care nu.

# Fara "set -e": avem nevoie de codul de iesire al fiecarei rulari.
set -uo pipefail

IMAGINE="${1:-${IMAGINE:-cpp-trace-runner:ci}}"
cd "$(dirname "$0")/.."

if ! docker image inspect "$IMAGINE" > /dev/null 2>&1; then
  echo "Nu gasesc imaginea $IMAGINE. Construieste-o cu: docker build -t $IMAGINE ."
  exit 1
fi

mkdir -p iesire
esec=0
total=0

for sursa in exemple/*.cpp; do
  nume=$(basename "$sursa" .cpp)
  total=$((total + 1))

  intrare=""
  [ -f "exemple/$nume.in" ] && intrare=$(cat "exemple/$nume.in")

  echo "::group::$nume"

  docker run --rm -i "$IMAGINE" cli - "$intrare" \
    < "$sursa" > "iesire/$nume.json" 2> "iesire/$nume.stderr"
  cod=$?

  tail -3 "iesire/$nume.stderr" 2> /dev/null

  node ci/verifica.mjs "$nume" "iesire/$nume.json" "$cod" "iesire/$nume.stderr" || esec=1

  echo "::endgroup::"
done

echo ""
if [ "$esec" -eq 0 ]; then
  echo "Toate cele $total exemple corespund referintelor."
else
  echo "Cel putin un exemplu nu corespunde referintei."
fi

exit $esec
