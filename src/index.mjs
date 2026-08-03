// Punct de intrare unic. Aceeasi imagine ruleaza si ca server HTTP (Azure
// Container Apps), si ca unealta one-shot (GitHub Actions, la build).
//
//   node src/index.mjs server
//   node src/index.mjs cli <fisier.cpp|-> [intrare]

const mod = process.argv[2] ?? 'server'

if (mod === 'server') {
  await import('./server.mjs')
} else if (mod === 'cli') {
  await import('./cli.mjs')
} else {
  console.error(`Mod necunoscut: ${mod}. Foloseste "server" sau "cli".`)
  process.exit(1)
}
