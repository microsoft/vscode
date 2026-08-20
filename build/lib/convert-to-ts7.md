I audited all 19 TS6 consumers in `lib` against `@typescript/native` 7.0.2.

**Can Migrate Now**

- Syntax/dependency scanning: `checkCyclicDependencies.ts:104`, `standalone.ts:94`, `extractExtensionPoints.ts`, and `agentHostDependencies.test.ts`. Use snapshots, virtual files, `SourceFile.imports`, AST guards, and `node.forEachChild`.
- Config target lookup: `tsconfigUtils.ts` can use `API.parseConfigFile`.
- Semantic references: `propertyInitOrderChecker.ts` can use `Checker.getReferencedSymbolsForNode`; this replaces its private TS6 reference API.
- NLS analysis: `nls-analysis.ts` can use checker references, with local write-access filtering.
- Tree shaking: `treeshaking.ts` has the required program, checker, symbol, type, diagnostic, and AST APIs. This is feasible but a substantial rewrite with parity tests.
- `nls.ts` only needs the TS7 `LineAndCharacter` type.
- `staticLanguageServiceHost.ts` and `typeScriptLanguageServiceHost.ts` can eventually be removed in favor of snapshots and virtual files.
- The direct AST/path usage in `compilation.ts` is replaceable, although its downstream pipeline remains blocked.

**Partially Blocked**

- `formatter.ts`: blocked by formatting.
- mangle/index.ts and `renameWorker.ts`: AST and definition handling can migrate, but rename cannot.
- `monaco-api.ts`: declaration processing can migrate, but generating `.d.ts` from `.ts` cannot.
- tsb/builder.ts: diagnostics and project updates can migrate, but emit cannot.
- tsb/transpiler.ts: blocked by transpilation and output-name calculation.
- tsb/index.ts: ordinary config loading can migrate, but overrides and parse diagnostics lack equivalent APIs.

**Missing TS7 APIs**

1. **Compilation emit** equivalent to `Program.emit` or `LanguageService.getEmitOutput`, including JavaScript, declarations, source maps, and diagnostics. TS7’s `Emitter` only provides `printNode`.
2. **Single-file transpilation** equivalent to `transpileModule`.
3. **Rename edits** equivalent to `findRenameLocations` and `RenameLocation`, especially `prefixText` and `suffixText`.
4. **Formatting** equivalent to `getFormattingEditsForDocument`, `FormatCodeSettings`, and `TextChange`.
5. **Output path calculation** equivalent to `getOutputFileNames`.
6. **Full config parsing** equivalent to `readConfigFile`, `parseJsonConfigFileContent`, and `convertCompilerOptionsFromJson`, including overrides and diagnostics. `API.parseConfigFile` is file-backed and did not report malformed-config diagnostics in testing.
7. **Reference metadata** such as `ReferenceEntry.isWriteAccess` for exact language-service parity.

Non-blocking differences include no direct `createSourceFile(text)` parser, missing convenience helpers such as `findAncestor` and `getModifiers`, and no `ScriptTarget.ES5`. These all have workable local replacements. No files were changed.


**Performance**

- **checkCyclicDependencies.ts**: 4 times slower 32seconds instead of 8 seconds.
- **nls-analysis.ts**: 2 times slower: 36 seconds instead of 17 seconds.

