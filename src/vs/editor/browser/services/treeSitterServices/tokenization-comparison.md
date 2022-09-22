# Comparison of current tokenization/colorization system with the tree-sitter implementation

_memory_

- tree-sitter-typescript.wasm file is 1300 kB
- web-tree-sitter library when unpacked has size 246 kB
- TODO: Tried to use webpack-bundle-analyzer (among others) in order to find the effect on the bundle size, data in the stats.json file does displays empty page when visualized

_performance_

File | size in kB | lines | `Force Retokenization` (unknown units - milliseconds?) | Time to resolve queries (milliseconds) | Time to set tokens (milliseconds) |
--- | --- | --- | --- |--- |--- |
[checker.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/checker.ts) | 2000 | ~2'800'000 | 0.100 | 3499 | long |
[perfLogger.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/perfLogger.ts) | 2 | 1625 | 0 | 516.6 | 544.4 |
[scanner.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/scanner.ts) | 151 | ~154'000 | 0 | 980 | 568374.5 |
