# RoboAgent Requirement — Project Type Selection & New-Project Wizard

**Requirement ID:** REQ-4
**Priority: HIGH**
**Status:** Specified (implementation in progress)
**Relates to:** REQ-1 (ROS2 Workspace Detection & Indexing — shipped), REQ-3 (RoboAgent ROS2 Toolkit)
**Blueprint alignment:** Part 3 §8 (Embedded Workspace Integration — STM32/ESP32, PlatformIO/OpenOCD/esptool), Part 4 §9.4 (Onboarding Flow — *"Let's create a new project"*)

---

## 1. Summary

The first thing a robotics engineer does is **start a project by choosing what kind of
system they are building** — a high-level autonomy/perception stack, or low-level firmware for
a microcontroller. RoboAgent must make that the front door: a guided **New-Project Wizard**
that asks *Control Level → Framework/Target → Environment*, scaffolds a matching starter,
records the choice, and opens/indexes the workspace so every downstream surface (build, run,
debug, flash, status bar) can specialize to the project type.

This requirement is a **prerequisite for a coherent IDE feel** (REQ-3): the toolkit's
build/run/debug surfaces only know *which* tools to offer once the project's control level and
target are known. It is therefore tracked as its own high-priority requirement.

---

## 2. Motivation

Today a user opens a folder and RoboAgent guesses (colcon vs. CMake vs. plain files). That is
fine for *existing* workspaces but gives no on-ramp for *new* ones, and it cannot distinguish a
high-level ROS2 stack from low-level STM32 firmware — a distinction that changes the entire
toolchain (colcon/ament vs. PlatformIO/esptool, gdb-on-host vs. OpenOCD-over-SWD).

The blueprint already anticipates this: Part 4 §9.4 lists *"Let's create a new project"* as a
first-launch offer, and Part 3 §8 specifies STM32/ESP32 targets with PlatformIO, OpenOCD, and
esptool flashing. REQ-4 delivers the **selection + scaffold** slice of that vision; deploy and
flash are explicit follow-ups (see §7).

---

## 3. Wizard Flow

```
RoboAgent: New Project
        │
        ▼
  ① Control Level  ──────────────┬────────────────────────────┐
        │                        │                            │
   High-Level Control       Low-Level Control                 │
        │                        │                            │
        ▼                        ▼                            │
  ② Framework/Domain      ② Target (Target Database)          │
   • ROS2                  • STM32   (family, extensible)      │
   • OpenCV               • ESP32                              │
   • NLP                   (more MCUs added later)             │
        │                        │                            │
        ▼                        ▼                            │
  ③ Target/Environment    (board/variant — future)            │
   • On Host                                                   │
   • On Target (remote device)                                │
   • VM                                                        │
        │                        │                            │
        └──────────────┬─────────┘                            │
                       ▼                                       │
  ④ Name + location → scaffold template → write ───────────────┘
     .roboagent/project.json (control level, domain, target)
     → open folder → index (REQ-1) → status bar reflects type
```

The wizard is a stepped picker with **back/next** support (implemented with
`vscode.window.createQuickPick`, falling back to sequential `showQuickPick` calls). Cancelling
at any step aborts without writing anything.

---

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| **R4.1** | A `RoboAgent: New Project` command **and** a **"New Project"** entry on the welcome / getting-started surface (walkthrough step) open a guided multi-step picker. |
| **R4.2** | Step 1 chooses **High-Level Control** or **Low-Level Control** (mutually exclusive). |
| **R4.3** | High-Level → step 2 chooses a domain from **{ROS2, OpenCV, NLP}**; step 3 chooses a deployment environment from **{On Host, On Target, VM}**. |
| **R4.4** | Low-Level → step 2 chooses a target from the **Target Database**, seeded with **STM32** and **ESP32** families. The database is **data-driven and extensible** — adding an MCU/board is a data edit, no wizard code change. |
| **R4.5** | The wizard scaffolds a minimal starter matching the selection and records the choices in per-project config **`.roboagent/project.json`** (`{ controlLevel, domain?, target, env?, createdWith }`), then opens and indexes the workspace (REQ-1). |
| **R4.6** | The recorded project type **drives downstream behavior** (which build/run/flash surfaces and debug adapters apply) and is **shown in the RoboAgent/ROS2 status bar** (e.g. `$(circuit-board) STM32` for low-level, `ROS2: <distro>` for high-level ROS2). |
| **R4.7** | **Graceful degradation:** missing toolchains (colcon, PlatformIO, ST-Link/OpenOCD, esptool) are detected; the wizard still scaffolds and **warns** rather than blocking. |

---

## 5. Data Model

### 5.1 `.roboagent/project.json`

```jsonc
{
  "controlLevel": "high" | "low",
  "domain":  "ros2" | "opencv" | "nlp",   // high-level only
  "env":     "host" | "target" | "vm",     // high-level only
  "target":  "stm32" | "esp32" | "host",   // low-level target id, or "host" for high-level
  "createdWith": "roboagent-new-project@<ext-version>"
}
```

### 5.2 Target Database entry (`extensions/roboagent-ros2/src/targets/targetDatabase.ts`)

A typed catalog; each entry is pure data:

```ts
interface TargetDefinition {
  id: string;                              // 'stm32', 'esp32', …
  family: 'STM32' | 'ESP32';
  label: string;                           // shown in the picker
  description: string;
  framework: 'platformio' | 'cube' | 'esp-idf';
  flashTool: 'openocd' | 'esptool';
  debugAdapter?: string;                   // future: OpenOCD/gdb wiring
  scaffold: string;                        // template folder under templates/
}
```

Seeded with STM32 (PlatformIO) and ESP32 (PlatformIO). Adding a new MCU/board = append one
entry (satisfies **R4.4**).

---

## 6. Scaffolds (MVP)

Minimal starters under `extensions/roboagent-ros2/templates/` — folder layout + a few seed
files, **not** full projects:

| Selection | Template | Seed contents |
|---|---|---|
| High-Level · ROS2 | `ros2-ament` | `package.xml`, `CMakeLists.txt` (or `setup.py`), `src/`, one node stub, `.roboagent/project.json` |
| High-Level · OpenCV | `opencv-python` | `main.py` (capture + display), `requirements.txt`, `README.md` |
| High-Level · NLP | `nlp-python` | `main.py`, `requirements.txt`, `README.md` |
| Low-Level · STM32 | `stm32-platformio` | `platformio.ini` (ststm32), `src/main.cpp`, `README.md` |
| Low-Level · ESP32 | `esp32-platformio` | `platformio.ini` (espressif32), `src/main.cpp`, `README.md` |

Every scaffold also writes `.roboagent/project.json` recording the selection.

---

## 7. Out of Scope (explicit follow-ups)

- **Deploy-to-target / remote device** execution (`env: target`) beyond recording the choice.
- **Flashing** (OpenOCD/esptool) and on-chip debugging (GDB over SWD/JTAG) — Blueprint Part 3 §8.
- Board/variant sub-selection within a family (future column in the Target Database).
- Auto-detecting connected hardware (ST-Link/ESP-PROG/J-Link).

These are captured so the data model (`framework`, `flashTool`, `debugAdapter`) already carries
the fields those slices will consume.

---

## 8. Acceptance Criteria

1. `RoboAgent: New Project` (command palette) and the walkthrough "Create your first project"
   step both launch the wizard.
2. Walking **High-Level → ROS2 → On Host** scaffolds a ROS2 ament starter, writes
   `.roboagent/project.json` with `controlLevel:"high", domain:"ros2", env:"host"`, opens the
   folder, and REQ-1 indexing runs.
3. Walking **Low-Level → STM32** scaffolds a PlatformIO STM32 starter, writes
   `.roboagent/project.json` with `controlLevel:"low", target:"stm32"`, and opens the folder.
4. The status bar reflects the recorded type (`$(circuit-board) STM32` / `ROS2: <distro>`).
5. With `colcon`/`platformio` absent, the wizard still scaffolds and shows a warning with
   install guidance — no crash, no blocked flow.
6. Adding a hypothetical third MCU to the Target Database makes it appear in the picker with no
   other code change.

---

## 9. Implementation Notes (WS8)

- **Target Database** — `extensions/roboagent-ros2/src/targets/targetDatabase.ts` (typed catalog).
- **Wizard** — `extensions/roboagent-ros2/src/newProject.ts`, command `roboagent.newProject`,
  using `createQuickPick`/`showQuickPick` for steps, `showInputBox`/`showOpenDialog` for
  name+location, `vscode.workspace.fs` to write files, and
  `vscode.commands.executeCommand('vscode.openFolder', uri)`.
- **Templates** — `extensions/roboagent-ros2/templates/*`.
- **Surface** — walkthrough step in WS5 (`command:roboagent.newProject`), optional fork
  getting-started entry.
- **Status bar** — WS2 (`browser/ros2StatusBar.ts`) reads `.roboagent/project.json` when present.

---

*This document follows the RoboAgent blueprint requirements style. It is the authoritative spec
for REQ-4; progress is tracked in `implementation_tasks.md` and detailed in `implementation.md`.*
