# Imagine in doua etape: intai compilam Valgrind-ul modificat din surse, apoi
# pastram doar binarul rezultat plus un g++ si Node.
#
# ATENTIE: README-ul SPP-Valgrind avertizeaza ca directorul dat la --prefix NU
# trebuie mutat dupa instalare (valgrind face fork/exec pe cai absolute). De aceea
# calea /opt/spp-valgrind e aceeasi si in etapa de build, si in cea finala.

# ---------------------------------------------------------------------------
# Etapa 1 - compilarea Valgrind
# ---------------------------------------------------------------------------
FROM debian:bookworm AS valgrind

# Se poate fixa pe un SHA dupa ce build-ul e confirmat, ca sa fie reproductibil.
ARG SPP_VALGRIND_REPO=https://github.com/knazir/SPP-Valgrind.git
ARG SPP_VALGRIND_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
      build-essential automake autoconf libtool pkg-config \
      libc6-dbg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "${SPP_VALGRIND_REF}" "${SPP_VALGRIND_REPO}" .

RUN ./autogen.sh \
    && ./configure --prefix=/opt/spp-valgrind \
    && make -j"$(nproc)" \
    && make install

# ---------------------------------------------------------------------------
# Etapa 2 - imaginea finala
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

# g++ pentru compilarea codului elevilor; libc6-dbg pentru ca Valgrind sa poata
# citi simbolurile din glibc (fara el, trace-ul are zone oarbe).
RUN apt-get update && apt-get install -y --no-install-recommends \
      g++ libc6-dbg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=valgrind /opt/spp-valgrind /opt/spp-valgrind
ENV PATH="/opt/spp-valgrind/bin:${PATH}"

WORKDIR /app
COPY package.json ./
COPY src/ ./src/

# Utilizator neprivilegiat. Nu inlocuieste izolarea platformei, dar e gratis.
RUN useradd --create-home --shell /usr/sbin/nologin rulator \
    && mkdir -p /lucru && chown rulator:rulator /lucru
USER rulator
ENV DIR_LUCRU=/lucru

EXPOSE 8080
ENTRYPOINT ["node", "src/index.mjs"]
CMD ["server"]
