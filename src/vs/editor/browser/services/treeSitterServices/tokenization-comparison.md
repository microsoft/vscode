# Comparison of current tokenization/colorization system with the tree-sitter implementation

_memory_

- tree-sitter-typescript.wasm file is 1300 kB
- web-tree-sitter library when unpacked has size 246 kB
- TODO: Tried to use webpack-bundle-analyzer (among others) in order to find the effect of the web-tree-sitter library on the bundle size. Attempt to display the data from the stats.json shows empty visualization?

_performance_

In order to get the results below a new boolean parameter `synchronous` has been created which forces the whole tokenization and colorization pipeline to be synchronous. As a result the colorization is done in one go once all the tokens are set for the whole file. In the current code this boolean variable is set to false and the colorization is done asynchronously when the process is idle.

Note however that despite the times below being long, when the process is asynchronous and the rendering is done immediately for every line update the colorization _appears_ to be rather quick.

The following data is obtained from one time iterations (not averages). Some clarifications on the last two columns:

*Time to resolve queries (milliseconds)*: Corresponds to the time needed to retrieve the query results needed for the colorization for the entire file
*Time to set tokens (milliseconds)*: Corresponds to the time neeeded to set the contiguous-multiline tokens and colorize the elements. I am aware of the fact that there is an error in this implementation as was discussed with Alex (ie: all the lines below the line changed should be updated, and not just the region of lines that were changed). Also from the below times, it would seem as though the performance of the actual colorization logic could be improved a lot still.

File | size in kB | lines | `Force Retokenization` (unknown units - milliseconds?) | Time to resolve queries (milliseconds) | Time to set tokens (milliseconds) |
--- | --- | --- | --- |--- |--- |
[perfLogger.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/perfLogger.ts) | 2 | 1625 | 0 | 516.6 | 544 |
[sys.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/sys.ts) | 91 | ~92'000 | 0 | 691 |  |
[scanner.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/scanner.ts) | 151 | ~154'000 | 0 | 980 | 568374 |
[emitter.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/emitter.ts) | 281 | ~290'000 | 0.100 | 750 | 490830| 
[checker.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/checker.ts) | 2000 | ~2'800'000 | 0.100 | 3499 | very long |

