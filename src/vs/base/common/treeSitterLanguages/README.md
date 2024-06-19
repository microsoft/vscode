# Generating Tree-Sitter wasm files

> **Note:** guidance is from https://www.npmjs.com/package/web-tree-sitter

> **Note:** does not work on Windows

> **Note:** we don't commit these as devDependencies in package.json because they have build errors: https://github.com/tree-sitter/node-tree-sitter/pull/204

The following example shows how to generate .wasm file for tree-sitter JavaScript grammar.

IMPORTANT: emscripten, docker, or podman need to be installed.

First install `tree-sitter-cli` and the `tree-sitter` language for which to generate `.wasm` (`tree-sitter-javascript` in this example):

```
npm install --save-dev tree-sitter-cli tree-sitter-javascript
```
Then just use tree-sitter cli tool to generate the .wasm.

```
npx tree-sitter build --wasm node_modules/tree-sitter-javascript
```
If everything is fine, file tree-sitter-javascript.wasm should be generated in current directory.
