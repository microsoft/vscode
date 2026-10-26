# Dictation runtime validation

The SDK version pinned in the root `package.json` also versions the on-demand native runtime published by `produce.ts`. Keep its `allowScripts` entry and the native dependency expectations in `build/lib/test/dictationRuntime.test.ts` aligned when upgrading.

SDK 2.0.1 dropped live-session language forwarding. The 2.1.0 upgrade (#341640) restored it but was reverted (#342681, #342703) after Linux x64 cold-cache crashes (#342641). SDK 2.2.1 retains the language fixes (microsoft/Foundry-Local#1064, microsoft/Foundry-Local#1138) and includes native curl symbol isolation (microsoft/Foundry-Local#1153). That upstream change removes a possible crash path; it does not, by itself, verify the reported Linux crash is fixed.

## Packaging tests

```sh
node --test build/lib/test/dictationRuntime.test.ts
```

## Native cold-cache and language smoke test

Run this on Linux x64 before shipping an SDK upgrade, as well as on the other supported platforms. It downloads the actual multilingual Nemotron model into a fresh temporary cache, loads it, and checks the final live-session transcript. It requires network access for the download and enough disk space for the model. Normal teardown removes the temporary cache; a native crash can leave a `dictation-smoke-*` temporary directory behind.

Supply a known recording as **raw mono 16 kHz signed 16-bit little-endian PCM**, not a WAV container, and a phrase expected in its transcript:

```sh
VSCODE_DICTATION_TEST_AUDIO=/absolute/path/spanish.pcm \
VSCODE_DICTATION_TEST_LANGUAGE=es \
VSCODE_DICTATION_TEST_EXPECTED_TEXT='hola' \
node --test build/dictation-runtime/smokeTest.ts
```

Repeat with regional language tags such as `es-ES`, Japanese (`ja`), and English (`en`) using matching recordings. Missing inputs, empty transcripts, unexpected text, native crashes, and timeouts must fail the test. Audio stays on-device; only the runtime/model download requires a network connection. Nonessential native telemetry is left at its default so the test does not bypass a potential crash path.

For a packaged-runtime check, set `VSCODE_DICTATION_TEST_LIBRARY_PATH` to the extracted `prebuilds/<target>` directory. Run the repository postinstall first so the SDK's addons load from that directory too. Use an Electron executable with `ELECTRON_RUN_AS_NODE=1` in place of `node` to check the Electron host.

### Linux x64 with Docker

From the repository root:

```sh
docker run --rm --platform linux/amd64 --init --workdir /work \
  --mount "type=bind,source=$PWD/build/dictation-runtime/smokeTest.ts,target=/work/smokeTest.ts,readonly" \
  --mount "type=bind,source=/absolute/path/spanish.pcm,target=/audio.pcm,readonly" \
  -e VSCODE_DICTATION_TEST_AUDIO=/audio.pcm \
  -e VSCODE_DICTATION_TEST_LANGUAGE=es \
  -e VSCODE_DICTATION_TEST_EXPECTED_TEXT=reconocimiento \
  node:24-trixie bash -lc \
  'npm install --ignore-scripts --no-audit --no-fund foundry-local-sdk@2.2.1 &&
   node node_modules/foundry-local-sdk/script/install-native.cjs &&
   node --test smokeTest.ts'
```

Use a compatible C++ runtime: both SDK 2.0.1 and 2.2.1 require `GLIBCXX_3.4.31` in the Linux x64 addon. Debian Bookworm's default runtime does not provide it; Debian Trixie does. On Apple Silicon this command exercises Linux x64 through emulation, not on native x64 hardware.

### Verified for SDK 2.2.1

- Five packaging tests, targeted TypeScript checking, and changed-TypeScript ESLint passed.
- Cold-cache Spanish (`es`, `es-ES`), Japanese (`ja`), and English (`en`) passed on macOS ARM64 and emulated Linux x64. Spanish also passed under the VS Code Insiders Electron host on both platforms.
- The same Linux Spanish test against SDK 2.0.1 failed with an empty transcript, reproducing the reported language regression.
- The Linux x64 addon and Foundry library retain their 2.0.1 glibc/C++ ABI requirements, and the 2.2.1 Foundry library exports no curl symbols.
- Windows, native Linux x64 hardware, and the published CDN payload were not exercised. macOS emitted upstream duplicate Objective-C class warnings, but all transcription tests passed.
