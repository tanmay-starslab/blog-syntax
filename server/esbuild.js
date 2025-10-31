// Bundle the language server from TypeScript source
require("esbuild").build({
  entryPoints: ["src/server.ts"],     // from TS source
  outfile: "out/server.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: false,
  allowOverwrite: true
}).catch(err => {
  console.error(err);
  process.exit(1);
});