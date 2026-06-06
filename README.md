<p align="center">
  <img alt="RoboAgent logo" src="resources/server/code-512.png" width="120">
</p>

<h1 align="center">RoboAgent — AI Robotics IDE</h1>

<p align="center">
  <em>The operating system for AI-assisted robotics development.</em>
</p>

<p align="center">
  <a href="https://github.com/Mohamedsaied8/RoboAgent/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Mohamedsaied8/RoboAgent.svg"></a>
  <a href="LICENSE.txt"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-blue.svg">
  <img alt="Status: early access" src="https://img.shields.io/badge/status-early%20access-orange.svg">
</p>

---

## What is RoboAgent?

RoboAgent is a **desktop-native, AI-powered IDE purpose-built for robotics, embedded, and autonomous systems engineering**. It is not a generic code editor with AI bolted on — it deeply understands ROS2 workspaces, robot architectures, sensor pipelines, simulation environments, and deployment workflows.

Generic AI coding assistants understand code *syntax* but not robotics *semantics*. They can't reason about TF trees, diagnose DDS QoS mismatches, explain why a Nav2 planner is failing, or correlate sensor timing issues across a distributed ROS2 graph. **RoboAgent closes that gap.**

## Why RoboAgent?

| Pain | RoboAgent |
|---|---|
| **ROS2 complexity** — launch files, QoS, DDS, lifecycle nodes are error-prone | AI that understands ROS2 architecture and generates correct configurations |
| **Debugging distributed systems** across dozens of terminals | Unified debugging dashboard with AI-driven root cause analysis |
| **URDF/Xacro authoring** — XML with no validation until runtime | AI-assisted generation with real-time 3D preview and validation |
| **Bag file analysis** — visualization but no anomaly detection | AI detects timing issues, sensor drift, and communication failures |
| **Nav2 / SLAM tuning** — trial-and-error parameter guessing | Parameter recommendations based on your hardware and environment |
| **Embedded ↔ ROS2 gap** — separate toolchains | A unified workspace spanning STM32/ESP32 firmware through ROS2 nodes |

## Platform support

> ⚠️ **RoboAgent currently ships for Linux only.** Windows and macOS builds are not yet available.

| Platform | Status |
|---|---|
| **Linux** (x64, Debian/Ubuntu `.deb`) | ✅ Available |
| Windows | ⏳ Planned |
| macOS | ⏳ Planned |

## Install (Linux)

Download the latest `.deb` from the [Releases](https://github.com/Mohamedsaied8/RoboAgent/releases) page, then:

```bash
sudo apt install ./roboagent_*_amd64.deb
# launch it
roboagent
```

RoboAgent registers the `roboagent` command, the `roboagent://` URL handler, and stores its user data under `~/.roboagent`.

## Build from source

RoboAgent is built on the [Code - OSS](https://github.com/microsoft/vscode) foundation, so the standard toolchain applies.

```bash
# Node version is pinned in .nvmrc (use nvm)
nvm use
npm install
npm run watch       # in one terminal — incremental compile
./scripts/code.sh   # in another — run RoboAgent from source
```

To build the Linux `.deb` package, use the gulp packaging tasks (see `build/`). A full build wants at least **4 cores and 8 GB RAM**.

## Contributing

This project lives at [github.com/Mohamedsaied8/RoboAgent](https://github.com/Mohamedsaied8/RoboAgent).

* [Open an issue](https://github.com/Mohamedsaied8/RoboAgent/issues) for bugs and feature requests
* Submit pull requests against `main`
* See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines

## Built on VS Code (Code - OSS)

RoboAgent is a downstream distribution of Microsoft's open-source [`Code - OSS`](https://github.com/microsoft/vscode) repository, with robotics-specific customizations and branding. We are grateful to Microsoft and the VS Code community for the foundation. Their original [MIT license](LICENSE.txt) applies to the upstream code, and RoboAgent inherits VS Code's rich extension ecosystem and editor capabilities.

This is an independent project and is **not affiliated with, endorsed by, or sponsored by Microsoft**.

## License

Licensed under the [MIT](LICENSE.txt) license.

RoboAgent branding, logos, and robotics-specific components © the RoboAgent project.
Upstream editor code © Microsoft Corporation, used under the MIT license.
