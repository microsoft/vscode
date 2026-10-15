# RoboAgent Requirement — Firmware Agents (Dev · Debug · Test)

**Requirement ID:** REQ-7
**Priority: HIGH**
**Status:** In progress — P0 (agent kernel) done 2026-10-15. Implementation plan: `agents_dev/agents_plan.md` (RoboAgent root).
**Relates to:** REQ-4 (Project Type Selection — target database), REQ-6 (Modes toolbar — STM32/ESP32 build & debug, toolchain checks), `extensions/roboagent-ai` (gateway + chat participant)
**Blueprint alignment:** Part 2 §5.1–5.2 (Agent Router, Debugging Agent ReAct loop), Part 2 §5.5 (Multi-Agent Coordination), Part 3 §8 (Embedded Systems Support — flashing, register/memory view, FreeRTOS crash analysis)

---

## 1. Summary

Three cooperating AI agents for microcontroller firmware:

| Agent | Job |
|---|---|
| **FirmwareDevAgent** | Sets up the toolchain, configures and builds the code, flashes the target, applies change requests. |
| **FirmwareDebugAgent** | Drives an on-chip debugger (OpenOCD + GDB/MI over ST-Link V2, ESP-PROG or ESP USB-JTAG): breakpoints, watch expressions, memory, core registers, SFRs decoded from SVD, fault/panic decoding, FreeRTOS task awareness. |
| **FirmwareTestAgent** | Writes and runs tests (host, on-target, debugger-driven HIL assertions); on failure asks the Debug agent for evidence and the Dev agent for a fix, then re-verifies. |

**Hard constraint — host-agnostic.** The agents live in a standalone library with **no `vscode`
dependency**, so they can run inside RoboAgent, from a CLI, or behind an MCP server (Claude Code,
Cursor, any MCP client). RoboAgent is one adapter among several. Design follows SOLID and
classic design patterns (§4).

Targets in scope: **STM32 (Cortex-M)**, **ESP32 family (Xtensa LX6/LX7 and RISC-V)**, with or
without **FreeRTOS**.

---

## 2. Motivation

The REQ-6 toolbar gives one-click build and debug, but the engineer still reads registers,
decodes `CFSR` bits and walks FreeRTOS task lists by hand. Blueprint Part 2 names the debugging
agent as *the most critical agent*; this REQ delivers it for firmware and pairs it with the build
and test roles it needs to close the loop: **detect → investigate → fix → verify**.

Making the core host-agnostic keeps the investment reusable (CLI for CI, MCP for other AI tools)
and keeps the agent logic testable without an editor.

---

## 3. Architecture

```
┌──────────────────────── hosts (adapters) ──────────────────────────────┐
│ RoboAgent extension │ CLI (`fwagent`) │ MCP server (Claude Code etc.)  │
└──────────┬──────────────────────────────────────────────────────────────┘
           ▼ implements ports
┌──────────────────── agents (application layer) ────────────────────────┐
│ FirmwareDevAgent · FirmwareDebugAgent · FirmwareTestAgent               │
│ Orchestrator (Mediator) · BugFixWorkflow (State machine)                │
└──────────┬──────────────────────────────────────────────────────────────┘
           ▼ depends only on interfaces
┌──────────────────── domain ports + implementations ────────────────────┐
│ agent kernel : ILlmClient, ITool, IToolRegistry, IAgentHost, Agent      │
│ embedded     : IToolchain, IBuildSystem, IFlasher, IProbe,              │
│                IDebugServer, IDebugger, ITargetSession, ICoreArchitecture│
│                ICrashSource, IRtosAwareness, ISvdProvider, ISerialPort, │
│                ITestRunner, TargetPlatformFactory                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Package location:** `packages/firmware-agents/` (new). Plain TypeScript, own `tsconfig.json`,
mocha unit tests, no import of `vscode` or `vs/*` — enforced by an ESLint `no-restricted-imports`
rule scoped to the package. Node built-ins are reached only through `IAgentHost` ports, with
Node implementations under `src/adapters/node/`.

### 3.1 Agent kernel (generic, not firmware-specific)

- `ILlmClient` — `chat(messages, tools, signal) → AsyncIterable<LlmEvent>` where events are
  `text-delta | tool-call | finish`. Adapters: `RoboAgentGatewayClient` (wraps the existing
  `extensions/roboagent-ai/src/gateway.ts` protocol), `AnthropicClient`, `OpenAiClient`,
  `ScriptedFakeLlm` (tests).
- `ITool` — `{ name, description, inputSchema (JSON Schema), risk: 'read'|'write'|'hardware', invoke(input, ctx) }`.
- `IToolRegistry` — register/lookup; each agent receives a *filtered view* (its tool subset).
- `IAgentHost` — `fs`, `exec` (spawn with cancellation + streaming output), `approve(request)`,
  `log`, `progress`. Implemented by each host.
- `Agent` (abstract) — the ReAct loop (think → tool call → observe → repeat, bounded steps).
  Concrete agents supply an `AgentProfile` (system prompt, tool subset, output contract).
- `IMessageBus` — typed publish/subscribe used by the Orchestrator; agents never reference each other.

### 3.2 Embedded domain ports

| Port | STM32 impl | ESP32 impl | Notes |
|---|---|---|---|
| `IToolchain` | arm-none-eabi-gcc | xtensa-esp32*-elf / riscv32-esp-elf (ESP-IDF) | detect, version, install hint (reuse REQ-6 `ensureToolchain` / `ensureIdf` discovery logic) |
| `IBuildSystem` | CMake, Make, PlatformIO | ESP-IDF (`idf.py`), PlatformIO | configure / build / clean / artifacts (ELF, map) |
| `IFlasher` | OpenOCD `program … verify reset`, st-flash | esptool | always gated by approval |
| `IProbe` | ST-Link V2 (`st-info --probe`, USB 0483:3748) | ESP-PROG (FTDI), built-in USB-Serial-JTAG (S3/C3/C6) | detection + exclusivity lock |
| `IDebugServer` | upstream OpenOCD | `openocd-esp32` fork | config selection per target/probe |
| `IDebugger` | GDB/MI client (arm-none-eabi-gdb / gdb-multiarch) | GDB/MI client (xtensa/riscv gdb) | one MI client, parameterised binary |
| `ICoreArchitecture` | Cortex-M | Xtensa, RISC-V | register map, HW breakpoint/watchpoint budget, fault decoder |
| `ICrashSource` | live fault registers (CFSR/HFSR/MMFAR/BFAR + stacked frame) | live `EXCCAUSE`/`EPC1`/`EXCVADDR`; "Guru Meditation" panic log over serial (addr2line backtrace); core dump from flash (`espcoredump`); IWDT/TWDT messages | |
| `IRtosAwareness` | none, FreeRTOS | FreeRTOS | Zephyr/ThreadX later = new strategy |
| `ISvdProvider` | CMSIS-SVD packs | Espressif SVD | fetch + local cache, parsed to peripheral/register/field model |
| `ISerialPort` | UART logs | console / panic / Unity output | |
| `ITestRunner` | Unity host / Unity on-target / HIL | ESP-IDF Unity + pytest-embedded, Espressif QEMU | §5.3 |

`TargetPlatformFactory` (**Abstract Factory**) builds a matched family of the above from a target
id (e.g. `stm32f4` → Cortex-M + ST-Link + OpenOCD + CMake + OpenOCD flasher + CFSR crash source;
`esp32s3` → Xtensa + USB-JTAG + openocd-esp32 + ESP-IDF + esptool + panic-log crash source +
FreeRTOS). The RoboAgent adapter feeds it from the existing REQ-4 target database / REQ-6 MCU
catalog through an `ITargetCatalog` port.

`ITargetSession` (**Facade**) wraps debug server + debugger + architecture + SVD + RTOS into one
object the Debug agent's tools talk to: `halt/resume/step/reset`, `setBreakpoint/setWatchpoint`,
`readMemory/writeMemory`, `readCoreRegisters`, `readPeripheral(name)`, `evaluate(expr)`,
`backtrace(thread?)`, `threads()`, `decodeCrash()`, `rtos()`.

---

## 4. Design patterns & SOLID mapping

| Concern | Pattern | Principle |
|---|---|---|
| Every agent capability (build, read_memory, read_sfr, …) | **Command** (`ITool`) | SRP; OCP — add a tool without editing agents |
| ReAct loop | **Template Method** in `Agent`; prompt + tools via `AgentProfile` | OCP |
| Build system / debug server / flasher / architecture / RTOS / crash source | **Strategy**, selected by **Factory** (project + probe detection) | OCP, LSP |
| Matched per-target component family | **Abstract Factory** (`TargetPlatformFactory`) | OCP |
| LLM backends, host services | **Adapter** behind `ILlmClient`, `IAgentHost` | DIP |
| Agent collaboration | **Mediator** (`Orchestrator`) + typed messages on `IMessageBus` | DIP, low coupling |
| Bug loop | **State** (`BugFixWorkflow`) | SRP |
| Debug session | **Facade** (`ITargetSession`) | ISP |
| Approval on flash / write-memory / file edits / installs | **Decorator** (`ApprovalRequiredTool`) | OCP |
| Tool-set per agent (Debug agent cannot edit source) | filtered registry views | ISP, least privilege |

Typed collaboration messages: `TestFailure`, `InvestigationRequest`, `DebugFindings` (evidence:
registers, memory, SFR fields, backtrace, crash decode, RTOS snapshot), `ChangeRequest`,
`ChangeApplied`, `VerificationResult`.

---

## 5. Agent specifications

### 5.1 FirmwareDevAgent
- Detect target MCU + build system (CMake/Make/PlatformIO/ESP-IDF, `.ioc`, `sdkconfig`, `.roboagent/project.json`, `st-info --probe`).
- `ensure_toolchain` — detect missing compilers / OpenOCD / GDB / CMake / Ninja / ESP-IDF; propose or run the install (approval).
- `configure`, `build`, `clean`; GCC/LD diagnostic parser → structured errors (file, line, severity, message).
- `size_report` — `*-size` + map-file parsing (Flash/RAM per section).
- `flash` (approval).
- FreeRTOS config lint — `configASSERT` defined, `configCHECK_FOR_STACK_OVERFLOW == 2`, malloc-failed hook, `uxTopUsedPriority` retained for OpenOCD RTOS awareness.
- Consumes `ChangeRequest` → edit, rebuild → `ChangeApplied` (diff + build result).

### 5.2 FirmwareDebugAgent (read-only on source)
- Session lifecycle: start/stop debug server, attach GDB/MI, halt/resume/step/reset.
- Breakpoints & watchpoints within the architecture's HW budget (Cortex-M FPB/DWT limits; Xtensa 2 BP + 2 WP per core); budget is tracked and reported, never silently exceeded.
- `read_memory`, `write_memory` (approval), `read_core_registers`, `evaluate` / watch list, `backtrace`, `locals`.
- `read_peripheral` — SVD-decoded SFRs to named fields (e.g. `RCC.APB1ENR.USART2EN = 0`); `compare_peripheral` against expected values.
- `decode_crash` via the target's `ICrashSource`.
- Multi-core: per-core state on ESP32 (cores surface as threads).
- FreeRTOS (`IRtosAwareness`, works with or without OpenOCD `-rtos FreeRTOS`, by reading kernel structures through GDB expressions):
  - tasks: name, state, priority, stack size, high-water mark (`0xA5` fill scan);
  - queues/semaphores via the queue registry; heap (`xFreeBytesRemaining`, min-ever); runtime stats when enabled;
  - analyses: stack-overflow risk, deadlock (wait-for graph cycle over `pxMutexHolder`), priority inversion, ISR-priority misuse (NVIC priorities vs `configMAX_SYSCALL_INTERRUPT_PRIORITY`, STM32), heap exhaustion, starvation.
- Output contract: always a `DebugFindings` message with evidence attached; never a bare opinion.

### 5.3 FirmwareTestAgent
- Levels behind `ITestRunner`:
  1. **Host unit tests** — **GoogleTest + GMock** built with host GCC/G++; C HAL mocked through generated link-time seams (GMock class + `extern "C"` forwarding functions); FreeRTOS logic on the FreeRTOS POSIX port.
  2. **On-target tests** — GoogleTest (no exceptions/RTTI) on large MCUs; **Unity** on small MCUs (F0/L0/G0/C0 or below flash/RAM thresholds) and in ESP-IDF projects (Unity component + pytest-embedded; Espressif QEMU for hardware-less CI). Results via semihosting, RTT, serial, or a results struct read by the debugger, normalised into one `TestReport`.
  3. **Debugger-driven HIL assertions** — e.g. "after `MX_GPIO_Init`, `GPIOA.MODER.MODER5 == 0b01`".
- On failure: `InvestigationRequest` → Debug agent; turns `DebugFindings` into a `ChangeRequest` → Dev agent; re-runs → `VerificationResult`.

### 5.4 Orchestrator
- Runs `BugFixWorkflow` (states: `Detected → Investigating → FixRequested → Fixed → Verifying → Passed | Failed | GaveUp`), bounded iterations.
- **Probe lock** — one agent holds the probe at a time.
- Audit trail of every tool call, approval and message (exportable).

---

## 6. Host adapters

1. **RoboAgent** — new builtin extension `extensions/roboagent-firmware-agents/` (listed in `build/gulpfile.extensions.ts`):
   - each `ITool` registered via `vscode.lm.registerTool`;
   - chat participants `@fw-dev`, `@fw-debug`, `@fw-test`;
   - approvals through VS Code confirmations; `IAgentHost` backed by the REQ-6 `ModeHost`;
   - `ITargetCatalog` adapter over the REQ-4 target database / REQ-6 MCU catalog;
   - optional hand-off to Cortex-Debug / ESP-IDF debug UI for the visual session.
2. **CLI `fwagent`** — proves the core runs with no IDE (CI usage).
3. **MCP server** — exposes the same tools to any MCP client.

---

## 7. Functional requirements

| ID | Requirement |
|---|---|
| **R7.1** | `packages/firmware-agents` builds and tests with no `vscode` / `vs/*` import (lint-enforced). |
| **R7.2** | Dev agent builds `fixtures/stm32_ws/stm32_test` from a clean checkout, installing missing tools only after approval. |
| **R7.3** | Debug agent attaches to an STM32 over ST-Link V2 via OpenOCD, reads memory, core registers and SVD-decoded SFRs, and decodes a HardFault. |
| **R7.4** | Debug agent attaches to an ESP32-S3/C3 via USB-JTAG (or ESP-PROG) via openocd-esp32 and decodes a panic from live registers and from the serial panic log. |
| **R7.5** | FreeRTOS snapshot (tasks, stacks, queues, heap) on both targets; deadlock and stack-overflow-risk analyses detect seeded bugs. |
| **R7.6** | Test agent writes and runs host + on-target tests; failing test triggers the full bug-fix loop to green on a seeded bug. |
| **R7.7** | All hardware-writing / file-writing / installing tools are approval-gated in every host. |
| **R7.8** | The same seeded-bug scenario runs from RoboAgent chat, from `fwagent`, and from an MCP client. |
| **R7.9** | Missing probe / toolchain / gateway capability degrades gracefully with an actionable message (no crash, no hang). |

---

## 8. Phases

| Phase | Deliverable | Verified by |
|---|---|---|
| P0 | Package scaffold + build wiring + agent kernel, fake LLM, message bus, approval decorator | unit tests with `ScriptedFakeLlm` |
| P1 | Dev agent: toolchain detection, CMake/Make/PlatformIO/ESP-IDF strategies, diagnostic parser, size report, flash | R7.2 |
| P2a | STM32 debug: OpenOCD + GDB/MI client, Cortex-M arch, SVD decoder, fault decoder | recorded GDB/MI transcripts, then real ST-Link (R7.3) |
| P2b | ESP32 debug: openocd-esp32, Xtensa/RISC-V arch, panic-log + core-dump crash sources, serial port | R7.4 |
| P2c | FreeRTOS awareness + analyses | seeded stack overflow / deadlock / ISR-priority bugs (R7.5) |
| P2d | Optional Rust/probe-rs sidecar spike (1 week, go/no-go) as a second `ITargetSession` backend; exposes a GDB server so expressions still go through GDB | spike criteria in the implementation plan |
| P3 | Test agent + Orchestrator + `BugFixWorkflow` | seeded-bug loop to green (R7.6) |
| P4 | RoboAgent extension, `fwagent` CLI, MCP server | R7.7, R7.8 |

---

## 9. Open decisions

1. ✅ **LLM path** — OpenRouter through an OpenAI-compatible `ILlmClient` (tool calls, streaming); key from `OPENROUTER_API_KEY` or secret storage, model from configuration. The RoboAgent gateway adapter can follow behind the same port.
2. ✅ **Test framework** — GoogleTest + GMock primary; Unity fallback for small MCUs and ESP-IDF.
3. ⚠ **Hardware for validation** — which STM32 board (ST-Link V2) and which ESP32 board (S3/C3 with USB-JTAG, or ESP-PROG).
4. SVD sourcing — fetch per MCU from CMSIS packs / Espressif and cache locally (first use needs network).

## 9a. Security deferrals (from the P0 security review, 2026-10-15)

| Item | Why deferred | Must be closed by |
|---|---|---|
| TOCTOU: a symlink swapped in between the path check and the I/O | Needs `openat`/`O_NOFOLLOW`-style APIs Node lacks; the threat model is the agent itself, not a concurrent local writer | Revisit if the agents ever run against untrusted concurrent processes |
| Windows binary planting (libuv searches the child's cwd before `PATH`) | Package is Linux-only today | Before any Windows build: resolve tool commands to absolute paths from trusted directories |
| Secret filtering for file reads (`.env`, `.git/config`, `*.pem`, `id_*`, credential files) | No file-read tool exists in P0 | **Blocking gate for P1 file tools** |
| `onOutput` redaction is per chunk (a key split across two chunks can pass) | Captured output is redacted as a whole; only the live stream is per chunk | P4, when the host UIs consume the stream |
| A child that calls `setsid` escapes process-group kill | Inherent to POSIX process groups | Long-lived servers (OpenOCD, GDB) get a tracked handle API in P2a |

 (this dev machine, 2026-10-15)

Present: `arm-none-eabi-gcc`, `cmake`, `st-flash`, `st-info`. Missing: `openocd`, `gdb-multiarch`
(or `arm-none-eabi-gdb`), `ninja`, ESP-IDF toolchain (`openocd-esp32`, xtensa/riscv gcc+gdb).

## 11. Out of scope (follow-ups)

A custom C expression evaluator (GDB always evaluates watch expressions); J-Link / pyOCD debug servers; Zephyr / ThreadX RTOS awareness; SWO/ITM and SystemView trace;
protocol-aware serial viewer; Nordic / RP2040 targets — each is a new strategy, no agent changes.
