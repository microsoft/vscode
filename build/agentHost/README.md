# Copilot metadata contracts

[copilotd-source.json](./copilotd-source.json) records the upstream repository, source commit, and spec path. Schemas are not vendored. The generator's small contract list maps the 15 selected schema filenames to stable TypeScript export names.

After installing the root development dependencies:

```sh
npm run agent-host:generate-copilot-meta -- --source /path/to/copilot-host
npm run agent-host:check-copilot-meta -- --source /path/to/copilot-host
```

[generateCopilotMetadata.ts](./generateCopilotMetadata.ts) uses the exactly pinned `json-schema-to-typescript` development dependency to produce checked-in [copilotdMetadata.ts](../../src/vs/platform/agentHost/common/meta/copilotd/generated/copilotdMetadata.ts). The workspace marks the generated folder read-only. Both commands require an explicit local upstream checkout containing the pinned commit. `git show` reads the committed inputs, so the checkout's current branch and uncommitted changes do not affect generation. References resolve only through the selected schemas at that commit; filesystem and HTTP resolution are disabled. Nothing is fetched, and the upstream checkout is never modified. `--check` generates in memory and exits nonzero on missing or stale output or invalid inputs without writing files.

Ordinary builds and unit tests use the checked-in declarations and fixtures. They do not need an upstream checkout, network access, or generation. The full freshness check is an explicit maintenance operation, not an ordinary build prerequisite.

The generated exports describe individual metadata **values**, not a fixed `_meta` interface or runtime validators. Open `additionalProperties` shapes retain `unknown` index signatures, including nested open objects. Literal unions describe the current known enum values; readers must separately tolerate unknown raw values and fields without rejecting or discarding the enclosing metadata. Optional accessors and absence-versus-empty behavior belong to the readers, not these generated declarations.

The only retained upstream inputs are the [conformance test fixtures](../../src/vs/platform/agentHost/test/node/fixtures/copilotdMetadata/). The node tests locate them relative to the compiled test module, and normal source-resource copying places them beside the compiled tests. The handwritten runner dispatches their selected client operations and compares results with upstream expectations; it does not generate test-source files. Authentication, root-state, handshake, and encryption fixtures are excluded.

To update the pin, change `sourceCommit`, update the contract list if needed, replace the retained vectors with their byte-for-byte originals from the same commit, then regenerate and run the freshness check and conformance tests. Review the reader and feature tests for any changed semantics.

The upstream schema descriptions and test vectors are Copyright GitHub, Inc., distributed under the MIT permission and warranty notice in the repository's [License.txt](../../License.txt). The generated declarations retain this attribution; there is no separately vendored license file.
