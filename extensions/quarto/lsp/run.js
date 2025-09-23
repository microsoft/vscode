// attempt to run the quarto nodejs lsp using deno
// (worked for down the middle stuff, didn't work
// for mathjax, yaml intelligence, and possibly others)

// deno run -A run.ts --stdio
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("./lsp.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
for (;;) {
  await sleep(1000);
}


