# Historical test tools — not a new test suite

This archive extends the October 20 prototype snapshot. Eight small local
scripts are stored as exact source text in `ARCHIVE-TESTS.json`, with their
original relative paths:

- `.build/copilot-entra-agenthost/native-sdk.test.mjs`
- `.build/copilot-entra-agenthost/native-dual-sdk.test.mjs`
- `.build/copilot-entra-local/native-loki-rpc.mjs` and its test
- `.build/copilot-entra-local/loki-catalog.mjs` and its test
- `.build/copilot-entra-local/loki-headers.mjs` and its test

The JSON stores each file's `content` and byte hash, plus the separate 78-line
shared-picker draft, including that draft's original base. The completed
picker change is already in microsoft/vscode#344586.

This data representation preserves the original JavaScript without adding
active JavaScript files or changing the repository's new-JavaScript policy.
To inspect or run them, extract each `content` value to its recorded `path`
inside a separate scratch directory and verify its `sha256`.

Once extracted, the catalog/header unit tests need only Node:

```sh
node --test .build/copilot-entra-local/loki-catalog.test.mjs .build/copilot-entra-local/loki-headers.test.mjs
```

The other tests depend on their historical compiled VS Code, compatible SDK
and locally modified runtime. Those packages and binaries are deliberately
not included. The scripts span earlier prototype stages; their presence does
not claim they all run against this branch's source snapshot or today's SDK.
Do not run the live RPC probe with credentials merely to inspect the archive.

No credentials, authenticated profiles, result captures, raw logs or private
runtime source were copied. This branch is historical reference, not for merging.
