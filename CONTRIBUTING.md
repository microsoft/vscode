# 🎉 Contributing to PearAI

## Table of Contents
- [🎉 Contributing to PearAI](#-contributing-to-pearai)
- [🚀 Getting Started](#-getting-started)
- [🛠 Prerequisites](#-prerequisites)
- [🌟 Contributing Workflow](#-contributing-workflow)
- [💻 Automated Testing](#-automated-testing)
- [🔍 Linting](#-linting)
- [🌿 Work Branches](#-work-branches)
- [📜 Pull Requests](#-pull-requests)
- [🐛 Creating Issues](#-creating-issues)
- [⚙️ Packaging](#-packaging)

Welcome to the PearAI app! PearAI is a fork of VSCode (and Continue), with most of the functionality in `extension/pearai-submodule`. Follow the guide below to contribute effectively and have fun while doing it! 😄

## 🚀 Getting Started

After cloning and building the repo, check out our [issues list](https://github.com/trypear/pearai-app/issues). For first-time contributors, issues labeled [`good first issue`](https://github.com/trypear/pearai-app/issues?q=is%3Aissue+is%3Aopen+label%3A%22Good+First+Issue%22) are great starting points. If you're contributing significant changes, or if the issue is already assigned to a specific milestone, please discuss with the assignee first on [Discord](https://discord.gg/7QMraJUsQt).

### IMPORTANT ‼️
If you are using mac, you WONT BE able to run the submodule in normal pearai, due to some notarization BS. You have to use a dev version: https://drive.google.com/drive/u/0/folders/13Tnz9cL7AAUuB_eyc5n-4wJQmhN3mPWt

## 🛠 Prerequisites

Ensure you have the following tools installed:

- 🦀 [Rust/Cargo](https://www.rust-lang.org/tools/install)
- 🐙 [Git](https://git-scm.com)
- 🌐 [Node.JS](https://nodejs.org/en/), **x64**, version `=20.18.0` (other versions have not been tested)
- 📦 [Npm](https://www.npmjs.com/), version `=10.8.2` (other versions have not been tested)
- 📦 [Yarn 1](https://classic.yarnpkg.com/en/), version `>=1.10.1 and <2`
- 🐍 [Python](https://www.python.org/downloads/), version `=3.11.X` (required for node-gyp)
- ⚙️ A C/C++ compiler toolchain for your platform:
  - **Windows**: Install the Windows Build Tools (through Visual Studio Installer) with the following components
    - Desktop development with C++ (Workload)
    - C++ MFC for v143 build tools with Spectre Mitigations (Individual Component)
    - MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Individual Component)
  - **macOS**: Install Xcode and Command Line Tools with `xcode-select --install`.
  - **Linux**: Install the necessary development tools as described in the instructions.

## 🌟 Contributing Workflow

### 1️⃣ Fork and Clone

1. Go to the [pearai-app repository](https://github.com/trypear/pearai-app.git).
2. Click on the "Fork" button at the top right of the page to create a copy of the repository under your own GitHub account.
3. Once forked, clone the repository to your local machine using the following command in your terminal:

   ```bash
   git clone https://github.com/<your-username>/pearai-app.git
   ```

### 2️⃣ Setup Environment

First time setup:

- **macOS and Linux**:
  ```bash
  ./scripts/pearai/setup-environment.sh
  ```
- **Windows**:
  ```bat
  .\scripts\pearai/setup-environment.ps1
  ```

To rebuild the app after initial setup:

- **macOS and Linux**:
  ```bash
  ./scripts/pearai/install-dependencies.sh
  ```
- **Windows**:
  ```bat
  yarn
  ```

# PearAI Development Setup Guide

## Project Overview

PearAI consists of several components:

- **[pearai-app](https://github.com/trypear/pearai-app)**: VSCode fork and parent repository for PearAI. Most contributions will NOT end up here.
- **[./extensions/pearai-submodule](https://github.com/trypear/pearai-submodule)**: Nearly all of PearAI's functionality, packaged as a built-in VSCode/PearAI extension. It is a fork of Continue, and is a git submodule of pearai-app. **Most contributions will end up here!**
- **[./extensions/PearAI-Roo-Code](https://github.com/trypear/PearAI-Roo-Code)**: A Roo extension for PearAI.

## Setup Instructions

### 1. PearAI App (code.sh)

1. Run in a terminal:
   ```bash
   yarn watch
   ```
   Wait for it to compile everything (approximately 2 minutes) until it shows:
   ```bash
   [watch-extensions] [17:45:16] Finished compilation extensions with 0 errors after 24750 ms
   [watch-client    ] [17:45:43] Finished compilation with 0 errors after 51228 ms
   ```
      Keep this terminal running.

2. Open another terminal to run the app:

   **macOS and Linux**:
   ```bash
   ./scripts/code.sh
   ```

   **Windows**:
   - First time installation:
     ```bat
     .\scripts\code.bat
     ```
   - Subsequent runs (using Git Bash):
     ```bash
     ./scripts/code.sh
     ```

   > **Note**: Windows requires running `code.bat` for the first run to create the necessary symlinks. For subsequent runs, the symlinks will already exist, allowing you to use the faster `code.sh` script through Git Bash.

### 2. PearAI Submodule / Extensions

1. Open the directory `extensions/pearai-submodule` in PearAI Dev or VSCode.
2. Configure your development environment:
   - Update the paths in `.vscode/launch.json` to point to the correct locations for other PearAI Extensions.
3. Install dependencies and build:
   - Open the command palette (`Cmd/Ctrl+Shift+P`).
   - Select `Tasks: Run Task` and then `install-and-build`.
4. Start debugging:
   - Switch to Run and Debug view.
   - Select `Extension (VS Code)` from the dropdown.
   - Click the play button to launch.
   - A new VSCode/PearAI window will open with your extension installed (with your local changes).
   - The window title will display "Extension Development Host".
5. View logs:
   - Open the command palette (`Cmd/Ctrl+Shift+P`).
   - Select `Developer: Open Webview Developer Tools`.
6. Make text changes to extensions to see them reflected in the PearAI sidebar.

### 3. PearAI Roo Code

#### A) Standalone Development

1. Download esbuild problem matchers:
   - Install from [PearAI Marketplace](https://market.trypear.ai/items?itemName=connor4312.esbuild-problem-matchers).
2. Install dependencies:
   ```
   npm run install:all
   ```
3. Watch the extension:
   ```
   npm run watch
   ```
4. Run dev on the extension:
   ```
   npm run dev
   ```
   This will start Vite with PearAI-Roo-Code on port 5174.
5. Launch for debugging:
   - Switch to Run and Debug view.
   - Select `Extension (VS Code)` from the dropdown.
   - Click the play button to launch.
   - A new VSCode/PearAI window will open with your extension installed (with your local changes).
   - The window title will display "Extension Development Host".
6. View logs:
   - Open the command palette (`Cmd/Ctrl+Shift+P`).
   - Select `Developer: Open Webview Developer Tools`.
7. Make text changes to see them reflected in the PearAI window.

#### B) From pearai-submodule (for changes to both components)

If you want to develop both pearai-submodule and PearAI-Roo-Code simultaneously:

1. Update the paths in `pearai-submodule/.vscode/launch.json` to point to the correct locations for PearAI Roo Code.
2. Follow the steps to run Extension Development Host in PearAI submodule (Section 2 above).
3. In PearAI-Roo-Code directory, run:
   ```
   npm run watch
   ```
4. In another terminal, run:
   ```
   npm run dev
   ```
   This will start PearAI-Roo-Code on port 5174, which the extension development host will connect to.
5. Make text changes to see them reflected in the PearAI sidebar.

## 🪳 Debugging environment issues

Sometimes PearAI will not work as expected and this can be for a variety of reasons, if you're stuck try to:
 - Make sure you're running all the right versions of node, npm and yarn
 - Make sure your npm and yarn cache is cleared
 - Remove and re-clone the PearAI repo to clear all `node_modules` and build files

## 💻 Automated Testing

Run the unit tests directly from a terminal by running `./scripts/test.sh` from the `pearai-app` folder (`scripts	est` on Windows).

We also have automated UI tests. The [smoke test README](https://github.com/trypear/pearai-app/blob/main/test/smoke/README.md) has all the details.

## 🔍 Linting

We use [eslint](https://eslint.org/) for linting our sources. You can run eslint across the sources by calling `yarn eslint` from a terminal or command prompt. You can also run `yarn eslint` as a VS Code task by pressing `Ctrl+P` (`CMD+P` on macOS) and entering `task eslint`.

To lint the source as you make changes you can install the [eslint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

## 🌿 Work Branches

Even if you have push rights on the `trypear/pearai-app` repository, you should create a personal fork and create feature branches (`yourname/branch-name`, e.g. `pan/open-chat-shortcut`) there when you need them. This keeps the main repository clean and your personal workflow cruft out of sight.

## 📜 Pull Requests

Before we can accept a pull request from you, you'll need to sign a [Contributor License Agreement (CLA)](https://github.com/trypear/pearai-app/blob/main/CONTRIBUTING.md#contributor-license-agreement). It is an automated process and you only need to do it once.

To enable us to quickly review and accept your pull requests, always create one pull request per issue and [link the issue in the pull request](https://github.com/blog/957-introducing-issue-mentions). Never merge multiple requests in one unless they have the same root cause. Be sure to follow our [Coding Guidelines](https://github.com/trypear/pearai-app/blob/main/CONTRIBUTING.md#coding-guidelines) and keep code changes as small as possible. Avoid pure formatting changes to code that has not been modified...

## 🐛 Creating Issues

Before you submit an issue, please do a search in [open issues](https://github.com/trypear/pearai/issues) to see if the issue or feature request has already been filed.
Use the provided issue template when creating a new issue. Fill in the template with as much detail as possible. The more detail you provide, the more likely that someone can help you.
Alternatively, you can use Pear to create a ticket for the problem first. Simply describe the issue or feature request, and Pear will create a ticket for it. This can help you understand the problem better and guide you in manually solving it.
You can also directly ping the maintainers or admins in the [Discord](https://discord.gg/7QMraJUsQt).

## ⚙️ Packaging

This section outlines how to  the app for a new release/distribution. This process is a bit manual currently.

### Step 1:  PearAI App

PearAI can be d for the following platforms: `win32-ia32 | win32-x64 | darwin-x64 | darwin-arm64 | linux-ia32 | linux-x64 | linux-arm`.

These `gulp` tasks are available:

- `vscode-[platform]`: Builds a d version for `[platform]`.
- `vscode-[platform]-min`: Builds a d and minified version for `[platform]`.

1. If you have not already, run `./scripts/pearai/setup-environment.[sh,ps1]`.
2. If already ran that upon your first install, run `./scripts/pearai/install-dependencies.[sh,ps1]`.
3. Run `yarn gulp vscode-[platform]`. For example `yarn gulp vscode-linux-x64`.

This will generate the new PearAI app and takes around 1 hour.

### Step 2: Package PearAI Extension

`pearai-submodule` also needs to be packaged and integrated into the overall PearAI app.

1. `cd` into `extensions/pearai-submodule`.
2. Run `./scripts/install-and-build.sh`.
3. `cd` into `extensions/vscode` (Full path is now `extensions/pearai-submodule/extensions/vscode/`).
4. Run `npm run package`.
5. This will create the `.vsix` extension within `extensions/pearai-submodule/extensions/vscode/build`.
6. Right-click the `.vsix` in VSCode or PearAI and select `Install vsix as Extension`.

### Step 3: Integrate the Extension

1. Copy the generated `pearai.pearai-1.x.x` folder under `~/.vscode/extensions` to the `extensions` folder of the packaged PearAI App (right click on packaged app -> Show Package Contents).
2. Delete any existing `pearai-submodule` folder in the `extensions/` folder of the packaged PearAI app.
3. Double-click your overall PearAI app, and the extension should be built-in.
 - On MacOS for example (Using VScode for .vsix installation)
   1. `cp -r ~/.vscode/extensions/pearai.pearai-{PEARAI_VERSION} {PATH_TO_PearAI.app}/Contents/Resources/app/extension`
   2. `rm -rf {PATH_TO_PearAI.app}/Contents/Resources/app/extensions/pearai-submodule `
   3. Double-click your overall PearAI app, and the extension should be built-in.


### Step 4: Signing and Turn Into Installer

Admin must sign the app on certain OS's, like MacOS. Admin should follow these [manuals](https://docs.google.com/document/d/1hZahz2UNrtZOgHZkquqNO7Jfoe0Pd0OA7Ud16ts_AKs).
