# BareCode

<p align="center">
  <strong>A clean, lightweight, distraction-free code editor.</strong>
</p>

<p align="center">
  A community-driven fork of <a href="https://github.com/microsoft/vscode">Visual Studio Code</a> focused on keeping the editor useful, fast, and free from unnecessary features.
</p>

---

## Why BareCode?

Visual Studio Code has grown far beyond its original purpose as a lightweight code editor.

BareCode takes the opposite approach:

> **Keep the editor. Remove the bloat.**

The goal is to provide a familiar VS Code-based development environment without features that aren't necessary for writing, navigating, building, and debugging code.

BareCode is intended for developers who want an editor that stays out of their way.

### What we're removing

Depending on the feature and its dependencies, BareCode aims to remove or disable things such as:

* AI/Copilot integrations
* AI-generated code features
* Microsoft-specific services
* Unnecessary telemetry and tracking
* Promotional content and product recommendations
* Cloud-first features
* Features that add complexity without improving the core editing experience
* Unused bundled extensions
* Other unnecessary background services

The exact list will evolve as the project develops.

### What we're keeping

BareCode isn't trying to reinvent the editor.

The core features that make VS Code useful remain the priority:

* Fast code editing
* Syntax highlighting
* IntelliSense
* Code navigation
* Find and replace
* Integrated terminal
* Git integration
* Debugging
* Extensions
* Tasks and build systems
* Language Server Protocol support
* Customizable themes and keybindings
* Cross-platform support

The goal is simple:

**A powerful editor without everything surrounding it.**

---

## Philosophy

BareCode follows a few simple principles:

### 1. The editor comes first

The primary purpose of an IDE/editor is to edit code.

Everything else should justify its existence.

### 2. No forced AI

AI tools should not be embedded into the editor simply because they are fashionable.

BareCode does not aim to push AI features into the development workflow.

If you want AI assistance, you should be able to choose and install it yourself.

### 3. Minimal background activity

An editor shouldn't constantly perform tasks unrelated to what you're currently doing.

BareCode aims to minimize unnecessary processes, network activity, and background services.

### 4. User control

The user should decide what belongs in their editor.

Features shouldn't be difficult to remove simply because they are bundled by default.

### 5. Open source

BareCode remains based on the open-source Code - OSS codebase and will continue to be developed transparently.

---

## Differences from Visual Studio Code

BareCode is based on Code - OSS, but it is **not intended to be a drop-in copy of Microsoft's Visual Studio Code distribution**.

The project modifies the upstream codebase to remove features and dependencies that aren't aligned with the project's goals.

| Feature                        | BareCode |
| ------------------------------ | :------: |
| VS Code editor core            |     ✅    |
| Extensions                     |     ✅    |
| Language servers               |     ✅    |
| Git                            |     ✅    |
| Integrated terminal            |     ✅    |
| Debugging                      |     ✅    |
| Themes                         |     ✅    |
| Custom keybindings             |     ✅    |
| AI/Copilot integration         |     ❌    |
| Microsoft product integrations |     ❌    |
| Promotional features           |     ❌    |
| Unnecessary bundled extensions |     ❌    |
| Unnecessary telemetry          |     ❌    |
| Cloud-dependent features       |     ❌    |

This table represents the project's intended direction and may change as development continues.

---

## Building

BareCode uses the Code - OSS build system.

### Requirements

See the upstream build documentation for the required development dependencies for your platform.

### Linux

```bash
git clone https://github.com/ItsJiro/vscode.git
cd vscode

yarn
yarn watch
```

For a production build, see the platform-specific build instructions in the repository.

---

## Extensions

BareCode maintains compatibility with the VS Code extension ecosystem where possible.

Extensions that depend on Microsoft-specific services or APIs may not work correctly.

The project intentionally avoids bundling large numbers of extensions by default.

Install only what you actually need.

---

## Contributing

Contributions are welcome.

If you're interested in helping make BareCode smaller, faster, and more focused, feel free to:

* Report bugs
* Suggest features
* Submit pull requests
* Remove unnecessary dependencies
* Improve performance
* Improve documentation
* Help maintain extensions and language support

When proposing a new feature, consider one question first:

> **Does this make the core editor better?**

If the answer is no, it probably doesn't belong in BareCode.

---

## Roadmap

The project is still evolving.

Some areas we're interested in:

* [ ] Remove remaining Microsoft-specific integrations
* [ ] Remove AI/Copilot-related functionality
* [ ] Reduce bundled extensions
* [ ] Reduce unnecessary dependencies
* [ ] Reduce startup time
* [ ] Reduce memory usage
* [ ] Reduce background processes
* [ ] Reduce network activity
* [ ] Audit telemetry
* [ ] Simplify the default UI
* [ ] Improve Linux experience
* [ ] Provide reproducible builds
* [ ] Provide official Linux packages
* [ ] Eventually provide Windows and macOS builds

---

## Credits

BareCode is based on the open-source [Code - OSS](https://github.com/microsoft/vscode) project.

Visual Studio Code and Code - OSS are developed by Microsoft and the open-source community.

BareCode is an independent project and is not affiliated with or endorsed by Microsoft.

---

## License

BareCode retains the licensing of the upstream components from which it is derived.

See [`LICENSE.txt`](LICENSE.txt) for the applicable license.

Additional third-party components may be distributed under their respective licenses.
