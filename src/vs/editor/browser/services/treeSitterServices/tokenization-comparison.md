[# Comparison of current tokenization/colorization system with the tree-sitter implementation

_memory_

- tree-sitter-typescript.wasm file is 1300 kB
- web-tree-sitter library when unpacked has size 246 kB
- TODO: Tried to use webpack-bundle-analyzer (among others) in order to find the effect on the bundle size, data in the stats.json file does displays empty page when visualized

_performance_

File | size | lines | current speed | time to resolve queries | time to set tokens |
--- | --- | --- | --- |--- |--- |
[checker.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/checker.ts) | 301 | 283 | 290 | 286 | 289 |
--- | --- | --- | --- |--- |--- |
test.ts | 
