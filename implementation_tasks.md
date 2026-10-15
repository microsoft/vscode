# RoboAgent — Implementation Task Board

Live status board. Legend: ☐ todo · ◐ in progress · ☑ done · ⚠ blocked/needs decision.

**Pushed to `roboagent/main` 2026-07-18** — REQ-3/4/5 + review fixes (`24ca12ae969`),
branding (`c72415cacb6`), hygiene reconciliation (`1fdb6a2a9de`). Hygiene is green, so
plain `git commit` works from here on; `--no-verify` is no longer needed.

---

## REQ-7 — Firmware Agents: Dev · Debug · Test (2026-10-15)

Spec: `requirements_docs/roboagent_req_firmware_agents.md`. Detail: `implementation.md` → REQ-7.

| # | Task | Status |
|---|------|--------|
| 7.0a | LLM path: **OpenRouter** via `OpenAiCompatibleClient`; key from `OPENROUTER_API_KEY` / secret storage, model from config (decided 2026-10-15) | ☑ |
| 7.0b | Test framework: **GoogleTest + GMock** primary, Unity fallback for small MCUs / ESP-IDF (decided 2026-10-15). ⚠ Validation boards still open (STM32 + ST-Link V2; ESP32-S3/C3 USB-JTAG or ESP-PROG) | ◐ |
| 7.0c | Host prerequisites: install `openocd`, `gdb-multiarch`, `ninja`, ESP-IDF (openocd-esp32, xtensa/riscv toolchains) | ☐ |
| 7.1 | P0 — `packages/firmware-agents` scaffold, tsconfig, mocha, boundary test banning `vscode`/`vs/*` imports, RoboAgent header lint glob (gulp wiring deferred to P4, when an extension consumes the package) | ☑ |
| 7.2 | P0 — Agent kernel: `ILlmClient`, `ITool`, `IToolRegistry` (filtered views), `IAgentHost`, `Agent` ReAct base, `IMessageBus`, `ApprovalRequiredTool`, `ScriptedFakeLlm`, OpenRouter client, Node adapters; independent code + security review, all confirmed findings fixed with regression tests (64 tests) | ☑ |
| 7.3 | P1 — Embedded ports + `TargetPlatformFactory`; `IToolchain` / `IBuildSystem` (CMake, Make, PlatformIO, ESP-IDF) / `IFlasher` (OpenOCD, st-flash, esptool) | ☐ |
| 7.4 | P1 — FirmwareDevAgent: detect, ensure_toolchain, configure/build/clean, GCC/LD diagnostic parser, size/map report, flash, FreeRTOS config lint, ChangeRequest handling; builds `fixtures/stm32_ws/stm32_test` (R7.2) | ☐ |
| 7.5 | P2a — GDB/MI client, OpenOCD debug server, ST-Link probe, Cortex-M architecture, SVD provider/decoder, CFSR/HFSR fault decoder, `ITargetSession` facade; transcript tests + real board (R7.3) | ☐ |
| 7.6 | P2a — FirmwareDebugAgent tools: session, BP/WP budget, memory, registers, evaluate/watch, backtrace, read/compare peripheral, decode_crash | ☐ |
| 7.7 | P2b — ESP32: openocd-esp32, USB-JTAG/ESP-PROG probes, Xtensa + RISC-V architectures, multi-core, panic-log / core-dump / watchdog crash sources, `ISerialPort` (R7.4) | ☐ |
| 7.8 | P2c — `IRtosAwareness` FreeRTOS: tasks/stacks/queues/heap/runtime stats; deadlock, stack-overflow risk, priority inversion, ISR-priority misuse, heap exhaustion analyses; seeded-bug tests on both targets (R7.5) | ☐ |
| 7.9 | P3 — FirmwareTestAgent + `ITestRunner` (GoogleTest/GMock host + C-mock seam generator, GoogleTest on large MCUs, Unity on small MCUs / ESP-IDF with pytest-embedded / QEMU, HIL assertions) | ☐ |
| 7.10 | P3 — Orchestrator (Mediator), `BugFixWorkflow` state machine, probe lock, audit trail; seeded-bug loop to green (R7.6) | ☐ |
| 7.11 | P4 — `extensions/roboagent-firmware-agents`: `vscode.lm.registerTool`, `@fw-dev` / `@fw-debug` / `@fw-test` participants, confirmations, `ModeHost` + target-catalog adapters (R7.7) | ☐ |
| 7.12 | P4 — `fwagent` CLI + MCP server adapter; same scenario from all three hosts (R7.8) | ☐ |
| 7.6b | P2d — Rust/probe-rs sidecar spike (1 week, go/no-go; GDB server for expressions — no custom evaluator) | ☐ |
| 7.13 | Docs (`docs/firmware-agents.md`) + trackers | ☐ |

---

## REQ-6 — Mode selector + Create / Build / Debug toolbar, bundled toolchain extensions (2026-09-04)

Branch `modes-toolbar` (off `main`). Spec = the user brief (STM32 / ESP32 / ROS2 modes, title-bar
toolbar, bundled ESP-IDF + STM32 first-run installer). Design + manual test matrix in
`docs/modes.md`; bundling/licensing decision in `docs/extensions.md`.

| # | Task | Status |
|---|------|--------|
| 6.1 | Bundle `espressif.esp-idf-extension@2.2.0` (Apache-2.0) as a built-in (`product.json`, sha256 from Open VSX; dev sync verified) | ☑ |
| 6.2 | STM32: ST's extension is SLA0048 + MS-Marketplace-only → not vendorable; `roboagent.stm32.ensureExtension` installs Cortex-Debug (MIT) from Open VSX on first STM32 selection; log-only startup check (`bundledExtensions.ts`) | ☑ |
| 6.3 | Mode model + ModeService (`workspaceState` → `globalState` → `roboagent.mode` setting; context keys `roboagent.mode` / `roboagent.modeProjectPresent`; status-bar item; QuickPick; auto-detect on open with Undo) | ☑ |
| 6.4 | Title-bar toolbar in core (`contrib/roboagent/browser/roboagentModeToolbar.ts`, `MenuId.TitleBarAdjacentCenter`, custom view items: `Mode: X ▾`, primary-styled **Create**, icon Build/Debug with `(mode)` tooltips, precondition on project presence) | ☑ |
| 6.5 | `ModeProvider` strategy + `ModeHost` side-effect abstraction (`modeProvider.ts`, `modeHost.ts`, `vscodeModeHost.ts`); pure `detect.ts`, `scaffold.ts` (temp-dir → atomic move), `toolchains.ts` | ☑ |
| 6.6 | STM32: MCU catalog (13 families / 37 parts + free text), CMake/Makefile generator with per-core flags, linker/startup stubs, .vscode configs; Build task + `$roboagent-gcc`; Debug via Cortex-Debug → cppdbg+OpenOCD → installer | ☑ |
| 6.7 | ESP32: chip picker, hello_world/blink templates or ESP-IDF extension wizard, `sdkconfig.defaults` + `set-target`; Build via `espIdf.buildDevice` / `idf.py build`; Debug via `gdbtarget` → flash+monitor | ☑ |
| 6.8 | ROS2: workspace/package/build-type/deps wizard, `ros2 pkg create` in scratch dir + launch file + atomic move + re-index (offline generator fallback); Build = existing colcon line, package-scoped, `ROS_DISTRO` from setting; Debug = pick built node → `roboagent.debugNode` | ☑ |
| 6.9 | Commands/keybindings/settings (`roboagent.selectMode|create|build|debug`, `roboagent.<mode>.*`; `Ctrl+Shift+B` when a mode project is present; `Ctrl+Alt+D` — `Ctrl+Shift+D` is taken by the Run and Debug view) | ☑ |
| 6.10 | Unit tests (mocha under Node, `vscode` stub + `FakeHost`): detection, MCU db, 3 generators, scaffold, toolchains, providers; smoke test builds the STM32 skeletons with the real `arm-none-eabi-gcc` when present | ☑ |
| 6.11 | Docs: `docs/modes.md`, `docs/extensions.md`, README section; trackers | ☑ |
| 6.12 | E2E in the live dev app (toolbar rendering in both themes, wizard flows) | ☐ |
| 6.13 | ESP-IDF presence check before ESP32 Create / Build / Debug (`esp32/ensureIdf.ts`; `discoverEspIdf` also reads `idf.currentSetup` + EIM `eim_idf.json`, `~/.espressif`): notification offers **Install ESP-IDF…** (EIM via `espIdf.installManager`, download page without the extension), **Use Existing Install…** (validated → `roboagent.esp32.idfPath`), **Create Anyway**; palette `roboagent.esp32.ensureIdf`; startup log line; discovery + provider unit tests (2026-09-07). E2E in the live app still pending under 6.12. | ☑ |
| 6.14 | STM32 toolchain presence check before Create / Build / Debug (`stm32/ensureToolchain.ts`: per-purpose requirements — gcc / gcc+cmake|make / openocd+gdb; probes PATH, `roboagent.stm32.toolchainPath` (stale value ignored), well-known dirs, `gdb-multiarch`): notification offers **Install with apt/dnf/pacman/Homebrew…** (missing packages only, run in a terminal), **Download Toolchain…**, **Use Existing Toolchain…** (folder or its `bin/` → setting), **Create Anyway**; found GDB / off-PATH toolchain passed into the Cortex-Debug and cppdbg configs; palette `roboagent.stm32.ensureToolchain`; startup log line; unit tests (2026-09-07). E2E pending under 6.12. | ☑ |

**Released 2026-09-07 — v1.120.1** (tag `v1.120.1` = commit `5805903`): version bumped in
`package.json` / `package-lock.json` (+ copilot / roboagent-ros2 `engines.vscode`), Debian metadata
branded (`resources/linux/debian/control.template`). Built under Node 22.22.1 with
`gulp vscode-linux-x64-min` → `vscode-linux-x64-prepare-deb` → `vscode-linux-x64-build-deb`;
artifact `bin/roboagent_1.120.1-1788737886_amd64.deb` (sha256 alongside), `product.json` stamped
with that commit. The rpm spec and snapcraft templates still carry the upstream tagline (unused).

Verification: core tsc clean; extension tsc + eslint clean; `npm run test-unit` in
`extensions/roboagent-ros2` (unit + smoke). The smoke test found two real generator bugs on its
first run — CMake `$<CONFIG>` lists need `;` separators, and `CMAKE_EXECUTABLE_SUFFIX_C` doubled
the `.elf` suffix — and the provider tests caught `findColconRoot()` resolving to the *package*
when seeded from the active file. All fixed.

---

## REQ-5 — ROS2 Communication Graph View (Priority: HIGH)

Spec: `requirements_docs/roboagent_req_ros2_graph_view.md`. Renders the REQ-2 communication
model as an interactive node–topic graph in a workbench editor pane.

| # | Task | Status |
|---|------|--------|
| 5.0 | Write REQ-5 requirements doc | ☑ |
| 5.1 | `common/ros2GraphLayout.ts` — pure layered layout (layering, ordering, service edges) | ☑ |
| 5.2 | `browser/ros2GraphEditorInput.ts` — singleton readonly input + serializer | ☑ |
| 5.3 | `browser/ros2GraphEditor.ts` — SVG render, pan/zoom, highlight, hovers, live update | ☑ |
| 5.4 | `media/ros2Graph.css` — theme-variable styling (light/dark) | ☑ |
| 5.5 | `ShowRos2GraphAction` — palette + Package Explorer title menu + walkthrough link | ☑ |
| 5.6 | Contribution wiring (editor pane, serializer, action) | ☑ |
| 5.7 | Unit tests `test/common/ros2GraphLayout.test.ts` (7 tests, passing) | ☑ |
| 5.8 | Type-check + transpile + E2E on fixture `../fixtures/ros2ws` (talker→/chatter→listener) | ☑ |

### REQ-5 E2E result (2026-07-18, fixture `../fixtures/ros2ws`, live dev app)
All acceptance criteria verified against the running build (screenshots in
`finalized_features/assets/`): palette + Package-Explorer title icon open a **singleton**
editor (open-editors list shows one instance after repeat invocations); talker→`chatter`→
listener→`status` chain renders with arrowheads, language accents, topic pills; the
`add_two_ints` **service edge renders dashed**, arcing below the row (back-edge routing);
**click-highlight** spotlights the selection + neighbors and dims the rest, background click
clears; **wheel zoom** (cursor-centered) + toolbar; **hover cards** via IHoverService (topic
card shows type + publisher/subscriber node keys); **live re-render** on re-index (added a
publisher to idle.cpp → `heartbeat` topic appeared, isolated node re-flowed into the layers);
**serializer restore** after Reload Window; **empty state** with working Index link in a
non-ROS2 folder (status bar: `ROS2: humble ⊘ Not indexed`); legible in **Default Light
Modern** and dark. Appended to `finalized_features/FEATURES.md`.

## Code review — uncommitted REQ-3/REQ-4 stage (2026-07-18)

Multi-agent review (10 angles → adversarial verify; sweep cut short by session limit) of the
working-tree diff. 64 candidates → top-15 report saved with the full diff under
`../docs/reviews/req34-review-2026-07-18.{json,diff}`; 45 lower-ranked candidates
unverified (re-runnable via workflow resume). Triage + fixes:

| # | Finding (file) | Verdict | Fix |
|---|---|---|---|
| F1 | `findColconRoot` walks above the workspace, boundary check dead, falls back to folder even w/o colcon markers → `colcon clean` can `rm -rf build install log` in non-colcon projects (util.ts) | CONFIRMED | ☑ rewrite walk (start at seed, stop at boundary, return `undefined` on no-match) + modal confirm on clean |
| F2 | `colcon test --symlink-install` — flag only exists on `build`; Test task always fails (colconTasks.ts) | CONFIRMED | ☑ flag only for build; drop dead clean sentinel (F15) |
| F3 | Vendored debugpy: PYTHONPATH points at the package dir (not parent); dir-exists ≠ importable (debugAdapters.ts) | CONFIRMED | ☑ PYTHONPATH = `debugAdapters/`, probe `debugpy/__init__.py` |
| F4 | Status-bar "Indexing…" unreachable — service fires no index-start event (ros2StatusBar.ts / ros2WorkspaceService) | CONFIRMED | ☑ new `onDidChangeIndexing` event on the service; drop poll |
| F5 | `ros2 run` / `ros2 launch` terminals never source distro + workspace overlay (debug.ts, commands.ts) | CONFIRMED | ☑ shared sourcing prefix (distro + `install/setup.bash`) |
| F6 | Wizard: Escape at Name step = Back, not cancel (newProject.ts) | CONFIRMED | ☑ `createInputBox` step with real Back button; Escape cancels |
| F7 | CMake status-bar buttons + `roboagent.isCMakeProject` stale (activation-time snapshot, no watcher) (cmake.ts) | CONFIRMED | ☑ CMakeLists.txt watcher + show/hide refresh; check all folder roots |
| F8 | `editor/title/run` gate `!isCMakeProject` removed Run for python files in CMake projects (package.json) | CONFIRMED | ☑ python unconditional in when-clause |
| F9 | `cmakeRun` demoted out of the visible editor/title toolbar (package.json) | CONFIRMED | ☑ restored at navigation@3 |
| F10 | `$colcon` matcher based on `$gcc`, which doesn't exist in this product → never registers; cmake.ts tasks reference `$gcc` too (package.json) | CONFIRMED | ☑ inline gcc-style pattern in `$colcon`; cmake/g++ tasks use `$colcon` |
| F11 | cpp debug factory returns `undefined` w/o message on launch.json F5 (debug.ts) | PLAUSIBLE | ☑ error message with lldb-dap guidance |
| F12 | `exists()` duplicated in debug.ts vs util.ts | CONFIRMED | ☑ export from util |
| F13 | `runTaskByName` fetches ALL tasks from every provider (cmake.ts) | CONFIRMED | ☑ `fetchTasks({ type })` |
| F14 | `ros2 run` interpolates pkg/node names into shell unvalidated (finder D, overflow) | — | ☑ identifier validation before send |
| F15 | Dead `--rm-build-install-log` sentinel (colconTasks.ts) | CONFIRMED | ☑ folded into F2 |
| — | Extension user-facing strings not nls-localized (conventions) | CONFIRMED | ☑ second pass: `vscode.l10n.t()` on all messages; `%keys%` + `package.nls.json` for contributes |
| — | Deleted `roboagent-cppdbg` GDB debugger type not re-contributed | — | ✗ intentional (2026-07-07 decision: defaults' debug side was broken; replaced by lldb-dap/debugpy) |

### Second pass (2026-07-18): the 45 unverified candidates, triaged by hand
All remaining finder candidates from the review journal were triaged against the post-fix
code. 10 were already fixed by F1–F15; **16 more fixed** (verified: ext+fork tsc clean, 30
unit tests pass, live smoke — palette titles nls-resolved, `Colcon: Build Workspace` executed
the sourced command line in the running app):

| Fix | What |
|---|---|
| S1 | `activationEvents` → `onStartupFinished` only (drops the startup `workspaceContains:**/package.xml` glob crawl; `onCommand` auto-generated) |
| S2 | `onPath()` results cached (15s TTL) — debug/build no longer spawn repeat `command -v` shells |
| S3 | `dirOf`→`path.posix.dirname`; `resolveProgramPath`→`path.join`; quickpick label→`path.posix.basename` |
| S4 | Package names validated (`isSafeRos2Name`) before reaching the `--packages-select` shell line |
| S5 | `'CMake build & run'` shell line quotes `${workspaceFolder}` paths (spaces) |
| S6 | Wizard high-level branch now data-driven (`DOMAIN_DATABASE`: label/scaffold/probe/hint in one entry); `toolchainHint` moved into `TargetDefinition` |
| S7 | Racy post-scaffold index nudge removed (fork's Ros2IndexBootstrap owns it) |
| S8 | `debugNode` "not built" now offers a package-scoped build (`colconBuildPackage`) instead of full-workspace |
| S9 | Four copy-paste tree Action2 classes → one `registerTreeForwardAction` descriptor helper |
| S10 | Reveal package.xml uses `IEditorService.openEditor` (was string-command `vscode.open`) |
| S11 | All runtime messages wrapped in `vscode.l10n.t()`; contributes strings externalized to `package.nls.json` |
| S12 | Copyright headers added to all 9 extension source files |
| S13 | `buildColconArgs`/`resolveProgramPath` un-exported (single-module use); dead `_context` param dropped |
| S14 | debug.ts header no longer claims debugpy is "bundled; always works" |

Refuted / wontfix (with reason): unused `TargetDefinition` fields (spec §7 mandates them for
the flash/deploy follow-ups); `copyTemplate` recursion (needed for `__PKG__` substitution —
`fs.copy` can't); sync `existsSync` in `isCMakeProject` (µs-scale, ported behavior);
`runTaskByName` name-lookup (filtered `fetchTasks({type})` resolved the cost); `roboagent-cppdbg`
removal (locked decision); `findColconRoot` stat pattern (bounded after F1). Remaining debt:
extension unit-test harness (colcon args / program path / sanitize tests) — still ☐ in REQ-3.

---

## REQ-4 — Project Type Selection & New-Project Wizard (Priority: HIGH)

Spec: `requirements_docs/roboagent_req_project_type_selection.md`

| # | Task | Status |
|---|------|--------|
| 4.0 | Write REQ-4 requirements doc | ☑ |
| 8.1 | `src/targets/targetDatabase.ts` — typed, data-driven catalog (STM32, ESP32 seeded) | ☑ |
| 8.2 | `src/newProject.ts` — `roboagent.newProject` stepped wizard (R4.2–R4.4) | ☑ |
| 8.3 | `templates/*` — ros2-ament, opencv-python, nlp-python, stm32-platformio, esp32-platformio | ☑ |
| 8.4 | Write `.roboagent/project.json` + openFolder + trigger index (R4.5) | ☑ |
| 8.5 | Toolchain detection + graceful warn (R4.7) | ☑ |
| 8.6 | Walkthrough "Create your first project" step (R4.1) | ☑ |

## REQ-3 — RoboAgent ROS2 Toolkit ("QNX Momentics for ROS2")

Spec: this board + inline plan. Hybrid: new builtin extension `extensions/roboagent-ros2/` +
fork surfaces in `contrib/roboagent/`.

### Decisions locked (2026-07-07)
- **roboagent-defaults**: it was NOT dead code — its build/run/status surface worked (only
  debugging was broken). It **collided** with roboagent-ros2 on the `roboagent.colconBuild`
  command id (can't both be active). Resolution (user-approved): **delete it and port** its
  generic CMake configure/build/run/clean + single-file C++/Python build-run into
  `roboagent-ros2/src/cmake.ts` — zero functionality regression.
- **C++ debug adapter**: detect system `lldb-dap`/gdb; else terminal `ros2 run` fallback + warn.
  Bundle only **debugpy** (pure-Python, small) for Python. No large build-time binary fetch.

| WS | Task | Status |
|----|------|--------|
| WS0 | Scaffold `extensions/roboagent-ros2/` (package.json, tsconfig, src/extension.ts) | ☑ |
| WS0 | Register tsconfig in `build/gulpfile.extensions.ts` `compilations` | ☑ |
| WS0 | `.gitignore` for `debugAdapters/` + `out/` | ☑ |
| WS1 | `src/commands.ts` — colcon/run/debug command set + `editor/title` menus | ☑ |
| WS3 | `src/colconTasks.ts` — `colcon` TaskProvider + `$colcon` problem matcher | ☑ |
| WS4 | `src/debug.ts` + `src/debugAdapters.ts` — debugpy bundled; C++ detect-else-terminal | ☑ |
| WS2 | FORK `browser/ros2StatusBar.ts` — distro + index state, reads project.json | ☑ |
| WS7 | FORK context menus in `ros2WorkspaceActions.ts` + `ros2PackageExplorerView.ts` | ☑ |
| WS5 | `contributes.walkthroughs` — Get started with ROS2 (+ New Project step) | ☑ |
| WS6 | Branding/keybindings polish; optional ROS2 menubar (fork, defer if costly) | ◐ (category consistent; no new keybinds; menubar deferred) |
| — | Delete `extensions/roboagent-defaults/` + port generics → `cmake.ts` | ☑ |
| — | Type-check both sides (extension tsc ✓ / fork tsc ✓); transpile+emit ✓ | ☑ |
| — | Unit tests (colcon args / program path / sanitize) | ☐ |
| — | E2E smoke launch (fixture colcon ws) | ☑ |
| — | Full E2E (debug breakpoint, wizard scaffold) + append to `finalized_features/FEATURES.md` | ☐ (env-limited) |

### E2E smoke result (2026-07-07, fixture `scratchpad/ros2ws`, `ROS_DISTRO=humble`)
Verified live in the running dev app:
- Extension `roboagent.roboagent-ros2` **activates cleanly** on `onStartupFinished` — no duplicate-command crash (collision resolved).
- Fork **status bar** shows `ROS2: humble  ✓ 1 pkgs` (distro from env + live WKG count).
- **Walkthrough** "Get started with ROS2" surfaces on the Welcome page.
- **Colcon task** provider active; `Build Workspace` ran our exact `colcon build --symlink-install`
  command line (failed only because the sandbox has no sourced ROS2/rclcpp — graceful, errors in terminal).
- WKG indexed the fixture (`Indexed 1 package(s), 1 node(s)`).

Still needs a real ROS2 install to E2E-verify: **Debug Node** hitting a breakpoint (codelldb-absent →
terminal fallback path; debugpy path), the interactive **New-Project wizard** scaffold, and colcon
errors landing in **Problems** via `$colcon`. Then append to `finalized_features/FEATURES.md`.

---

## Branding — new logo rollout (2026-07-18)

Source: `../roboagent_logo.png` (RA badge lockup). The badge mark was cropped square,
corner-rounded (15%), and regenerated into every product-image asset:

| Surface | Asset | Status |
|---|---|--------|
| Linux window/taskbar icon (`windows.ts` → `resources/linux/code.png`, also .deb/snap) | 1024px tile | ☑ |
| Web/server (`resources/server/code-{192,512}.png`, `favicon.ico`, manifest) | tiles + 16/32/48 ico | ☑ |
| Windows (`resources/win32/code.ico` 16–256, `code_{70,150}` tiles) | multi-res ico + tiles | ☑ |
| macOS (`resources/darwin/code.icns`) | hand-assembled ICNS (ic07–ic10, PNG payloads) | ☑ |
| Titlebar/welcome/banner/update icon (`browser/media/code-icon.svg`) | SVG w/ embedded 256px tile | ☑ |
| Sessions window (`sessions/browser/media/vscode-icon.svg`) | same | ☑ |
| Empty-editor watermark (`letterpress-{light,dark,hcLight,hcDark}.svg`) | embedded tile, per-theme opacity (.85/.5/.9/.6) | ☑ |
| E2E: relaunch → titlebar icon ✓ in-app; letterpress SVG render ✓ (static rasterization; visible in-app once all editors are closed); `_NET_WM_ICON` empty in dev on this GNOME/XWayland setup (env quirk — packaged builds take the icon from the .desktop entry → code.png) | | ☑ |

Not regenerated (no product image inside): aquarium easter-egg logo path
(`sessions/contrib/aquarium/.../vscodeLogoPath.ts` — vector outline, cosmetic only).

---

## Hygiene — `npm run gulp hygiene` now passes (2026-07-18)

Was failing with **114 errors**; now **0**. Two real code bugs, the rest policy/config that the
fork had never reconciled (the roboagent contrib has used a RoboAgent copyright since REQ-1,
which is why `--no-verify` was needed to commit until now).

**Real code fixes**
- `ros2GraphLayout.ts` — a literal **NUL byte** (U+0000) had crept into the back-edge map key
  (`` `${source}<NUL>${target}` ``). Now an explicit ` ` escape with a comment saying why
  (NUL can't occur in a vertex id, so the key is collision-proof).
- `ros2GraphEditor.ts` — `e.target instanceof HTMLElement` → `isHTMLElement()` (multi-window
  safety, `no-restricted-syntax`).
- Disallowed unicode removed from sources: en dash `–` (the checker whitelists `—` but not
  `–`), `①`/`④`, `§`.
- `build/lib/i18n.resources.json` — registered `vs/workbench/contrib/roboagent` so the
  contrib's `localize()` strings are picked up for translation.
- Extension headers split: copyright is now its own 4-line block (the checker compares
  lines 0–3 exactly), with the descriptive banner as a second block.

**Policy/config (deliberate, each commented in place)**
- `build/hygiene.ts` — accepts the **RoboAgent** copyright header as well as Microsoft's.
  The fork's own files stay attributed to the fork; upstream files keep MS's.
- `eslint.config.js` — matching `header/header` override for `contrib/roboagent/**` and
  `roboagent-ros2/src/**`.
- `build/filters.ts` — excludes: `roboagent-ros2/templates/**` (scaffolds become the *user's*
  files: no RoboAgent copyright, and PEP 8/ROS2 spaces, not tabs); `contrib/roboagent/test/**`
  indentation (parser tests embed real package.xml/setup.py fixtures that must keep their own
  indentation); `**/*.tsbuildinfo` (gitignored build artifacts); `roboagent.run` (dev shell
  script, like the already-excluded `*.sh`).
- `build/hygiene.ts` — the `extensionsGallery` ban now only rejects a **non-Open-VSX** gallery.
  RoboAgent ships Open VSX, a vendor-neutral registry a fork may legitimately use; upstream's
  blanket ban exists because their OSS build must not carry Microsoft's proprietary endpoints.

Verified: hygiene clean, fork + extension tsc clean, 30 unit tests pass, transpile current.

---

## Verification gates
- Fork TS: `node --max-old-space-size=12288 node_modules/typescript/bin/tsc --project ./src/tsconfig.json --noEmit --skipLibCheck` (tsgo is wrong arch here).
- Extension: `npm run gulp compile-extensions` (fails if new tsconfig not wired).
- Layers: `npm run valid-layers-check`.
- Unit: `scripts/test.sh --grep roboagent`.
- E2E: launch skill on a fixture colcon workspace; confirm buttons, status bar, colcon build → Problems, context-menu Run/Debug, walkthrough, and REQ-4 wizard flows.
