// Bundle the client (extension host) code from TypeScript source
require("esbuild").build({
  entryPoints: ["src/extension.ts"],  // from TS source
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: false,
  external: ["vscode"],               // VS Code provides this
  allowOverwrite: true
}).catch(err => {
  console.error(err);
  process.exit(1);
});