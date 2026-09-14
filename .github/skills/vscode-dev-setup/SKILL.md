---
name: vscode-dev-setup
description: Set up or repair a local Code - OSS development environment. Reuse or clone microsoft/vscode, save existing changes, create a working branch from main, then check prerequisites, install dependencies, build, launch, and test on macOS, Linux, or Windows.
---

<!-- Copyright (c) Microsoft Corporation. All rights reserved.
     Licensed under the MIT License. See License.txt in the project root for license information. -->

# VS Code Development Setup

- **Goal:** Set up a local Code - OSS development environment, including cloning the VS Code repository if the user does not have a checkout.
- **VS Code** is the installed editor where the user can invoke this skill.
- **Code - OSS** is the development application built from the source checkout. It does not replace the installed editor.
- **When invoked for setup:** Perform the steps below in order and reuse anything that already works.

## Before you start

- **Read the guide:** Follow [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute).
  - If the wiki fails to load, try its [raw version](https://raw.githubusercontent.com/wiki/microsoft/vscode/How-to-Contribute.md).
  - If neither is available, say so and use the checkout's documentation once the sources are available.
- **Use the selected checkout:**
  - Repository paths below are relative to that checkout's root, not the folder where this skill is installed.
- **Protect existing work:**
  - Save existing Git changes with a stash or a backup branch before creating a separate working branch from `main`, as described in Step 2.
  - Keep unrelated settings and running processes unchanged.
  - Never discard work with `git clean -xfd` or a hard reset.
- **Ask before making broader changes:**
  - Stashing changes, committing existing work, or publishing it to a remote.
  - Installing system tools, or editor extensions.
  - Changing saved settings.
  - Accepting licenses, granting workspace trust, or using administrator permissions.

## Step 1: Find or clone the repository

- **Check Git first:** Run `git --version`. If Git is missing, ask before installing it; cloning cannot proceed without it.
- **Look for an existing checkout:**
  - Use a checkout path supplied by the user, or clone the vscode repo.
- **If a suitable checkout exists:**
  - Reuse it.
  - Skip the cloning instructions below.
- **If no suitable checkout exists, or the user requests a new one:**
  - If you have not found a viable checkout, clone the repo.
  - Default to `https://github.com/microsoft/vscode.git` when cloning.
  - Use the user's fork or another source URL if they specify one. Do not create a fork automatically.
  - Ask for the destination folder. If not provided default to cloning to the Desktop.
- **Clone only after the destination is confirmed:**
  - Replace the example destination with the approved path, and replace the URL if the user chose a fork.
  - **macOS / Linux:**

    ```sh
    git clone https://github.com/microsoft/vscode.git "/absolute/path/to/vscode"
    ```

  - **Windows:**

    ```bat
    git clone https://github.com/microsoft/vscode.git "C:\path\to\vscode"
    ```

  - Wait for cloning to succeed. If it fails, report the error and stop early.
- **Before moving on:**
  - Verify the resulting VS Code checkout and record its absolute root, source URL, and branch.
  - Run `git status --short` there to record existing changes.
  - Read its repository instructions.
  - Run every later command from this root, and target this root in workspace task and test tools.

## Step 2: Save existing work and prepare a working branch

- **Inspect the Git state before changing it:**
  - Record the current branch, or detached-HEAD state, and its commit ID for backup and recovery.
  - Run `git status --short` and review staged, unstaged, and untracked changes.
  - If a merge, rebase, cherry-pick, or conflict resolution is in progress, stop and ask how to proceed.
- **Branch instructions:**
  - Use a random name for the branch.
  - Always base a new working branch on `main`, not the current feature branch or a backup commit.
- **If there are no local changes:** Skip saving. Proceed to creating the working branch.
- **If there are local changes:** Ask the user to choose one of these options before continuing:
  - **Stash locally:** Save staged, unstaged, and untracked changes without publishing anything.
  - **Commit and push a backup branch:** Save the changes in a separate branch and publish them to a user-approved remote.
  - Follow only the chosen option, then continue with creating the working branch.

### Option A: Stash locally

- Confirm that the user wants tracked and untracked changes saved.
- Create a named stash:

  ```sh
  git stash push --include-untracked -m "vscode-dev-setup: existing work"
  ```

- Verify that a new stash was created and contains the intended changes.
- Do not apply or drop the stash automatically on the new working branch.

### Option B: Commit and push a backup branch

- Confirm an unused backup branch name and the remote the user wants to publish to.
- Review the changes for secrets or private files before staging or uploading. If they cannot be published safely, use the local-stash option instead.

  ```sh
  git push --set-upstream "<approved-remote>" "<backup-branch>"
  ```

- Don't push to `main`.
- If committing or pushing fails, report what was saved locally and stop. Do not treat an unpushed backup as a successful push.

### Create the working branch

- Proceed only after the chosen save operation succeeds and `git status --short` is clean, or when there were no local changes to save.
- Create a separate branch from the recorded `main` commit, replacing the placeholders with the confirmed values:

  ```sh
  git switch -c "<working-branch>" main
  ```

## Step 3: Install development tools and project dependencies

- **This step installs two different things:**
  - **Machine tools:** Node.js, Python, and the platform's C/C++ build tools.
  - **Project packages:** VS Code's npm dependencies, installed by `npm install`.
  - Both are needed.
- **Run only the section for the detected OS:**
  - Use the selected checkout's root for all commands.
  - Check existing installations first and reuse compatible tools and packages.
  - Ask before installing missing tools. The package lists below show a first-time setup; on an existing machine, install only the missing packages.
  - Stop and resolve an installation error before continuing to the next action.
- **Select Node before following the OS instructions:**
  - Read `.nvmrc` and select that version with the user's existing version manager.
  - With an already configured `fnm`, run `fnm install` only if that version is missing, then `fnm use`.
  - Check `node --version`, `npm --version`, and `node -p "process.arch"`.
  - If no suitable Node installation or version manager exists, ask before installing one; use the version required by `.nvmrc`, not an arbitrary latest release.
- **Choose compatible tool versions:**
  - Read the [contribution guide's prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) and `build/npm/preinstall.ts`.
  - Resolve any disagreement between the guide and the selected checkout before installing tools. Do not bypass version checks.

### macOS: Xcode tools, Python, then npm packages

- **Check and install Xcode tools:**
  - Verify Xcode with `xcodebuild -version`.
  - Verify the command-line toolchain with `xcode-select -p` and `xcrun clang --version`.
  - If Command Line Tools are missing, run this after approval:

    ```sh
    xcode-select --install
    ```

  - Wait for the installer to finish. This does not install the full Xcode application; use the Xcode download linked in the guide if that application is missing.
- **Check and install Python:**
  - Check for a compatible Python with `python3 --version` or the user's configured interpreter.
  - If no compatible Python is installed and Homebrew is already available, install it after approval:

    ```sh
    brew install python@3.13
    ```

  - Without Homebrew, use the [official macOS Python installer](https://www.python.org/downloads/macos/). Do not install a new package manager without approval.
- **Select Python for native npm builds:**
  - For the Homebrew example, use its exact executable rather than relying on an unrelated `python3` on `PATH`:

    ```sh
    export npm_config_python="$(brew --prefix python@3.13)/bin/python3.13"
    "$npm_config_python" --version
    "$npm_config_python" -c "import setuptools"
    ```

  - If reusing a different Python installation, set `npm_config_python` to that interpreter's absolute path instead.
  - If the import reports that `setuptools` is missing, use an isolated build environment after approval:
    - Check `.build/dev-setup-python` first. Create it only at an unused path, or reuse a compatible environment belonging to this setup.
    - Skip the first command below when reusing that environment. Do not overwrite unrelated files.

    ```sh
    "$npm_config_python" -m venv .build/dev-setup-python
    .build/dev-setup-python/bin/python -m pip install setuptools
    export npm_config_python="$PWD/.build/dev-setup-python/bin/python"
    ```

  - Do not install into an externally managed Python with `--break-system-packages`.
- **Install VS Code's npm packages:**
  - Run `npm ls --depth=0` to check existing packages.
  - If packages are missing or invalid, or dependency manifests changed, run:

    ```sh
    npm install
    ```

  - Keep the selected Python environment in the shell that runs this command.

### Windows: Python, Visual Studio tools, then npm packages

- **Check and install Python:**
  - Check installed versions with `py --list-paths` or the user's configured Python executable.
  - If no compatible Python is installed, install it for the current user after approval:

    ```powershell
    winget install --id Python.Python.3.13 -e --source winget --scope user
    ```

  - If WinGet is unavailable, use the [official Windows Python installer](https://www.python.org/downloads/windows/) with the Python launcher enabled.
- **Choose compatible Visual Studio Build Tools:**
  - Use a version accepted by `build/npm/preinstall.ts`.
  - The guide uses `Microsoft.VisualStudio.BuildTools` for the current release.
  - For a checkout that requires Visual Studio 2022, use `Microsoft.VisualStudio.2022.BuildTools` from the [official WinGet manifests](https://github.com/microsoft/winget-pkgs/tree/master/manifests/m/Microsoft/VisualStudio/2022/BuildTools).
  - Replace the placeholder with the compatible package ID and inspect it. Set this variable in the same PowerShell terminal used for installation; elevate only with approval:

    ```powershell
    $buildToolsPackage = "<compatible-package-id>"
    winget show --id $buildToolsPackage -e --source winget
    ```

  - Do not install a newer release if the checkout rejects it.
- **Install the C++ compiler, Windows SDK, and Spectre libraries:**
  - For a new installation, run only the command matching the target architecture, after approval, in an elevated PowerShell terminal.
  - **x64:**

    ```powershell
    winget install --id $buildToolsPackage -e --source winget --override "--add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --add Microsoft.VisualStudio.Component.VC.ATL.Spectre --add Microsoft.VisualStudio.Component.VC.ATLMFC.Spectre"
    ```

  - **ARM64:**

    ```powershell
    winget install --id $buildToolsPackage -e --source winget --override "--add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.ARM64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.VisualStudio.Component.VC.Runtimes.ARM64.Spectre --add Microsoft.VisualStudio.Component.VC.ATL.ARM64.Spectre --add Microsoft.VisualStudio.Component.VC.MFC.ARM64.Spectre"
    ```

  - For an existing Visual Studio installation, add missing components to the instance selected by node-gyp using the Installer's **Modify** action or the guide's edition-specific command. Do not install a second instance just to repair the first.
- **Open a fresh, non-elevated PowerShell terminal:**
  - Return to the checkout root and select the required Node version again.
  - Select Python for native npm builds. For the Python 3.13 example:

    ```powershell
    $env:npm_config_python = (py -3.13 -c "import sys; print(sys.executable)")
    & $env:npm_config_python --version
    & $env:npm_config_python -c "import setuptools"
    ```

  - If reusing another supported Python, use its launcher version or absolute executable path instead.
  - If `setuptools` is missing, create an isolated build environment after approval, or reuse a compatible one owned by this setup:
    - Check `.build/dev-setup-python` before creating it; do not overwrite an unrelated existing environment.
    - Skip the first command below when reusing a verified compatible environment.

    ```powershell
    & $env:npm_config_python -m venv .build/dev-setup-python
    & ".\.build\dev-setup-python\Scripts\python.exe" -m pip install setuptools
    $env:npm_config_python = (Resolve-Path ".\.build\dev-setup-python\Scripts\python.exe").Path
    ```

- **Install VS Code's npm packages:**
  - Run `npm ls --depth=0` to check existing packages.
  - If packages are missing or invalid, or dependency manifests changed, run in the same non-elevated terminal:

    ```powershell
    npm install
    ```

### Linux: Python and compiler packages, then npm packages

- **Identify the distribution and check existing tools:**
  - Check `python3 --version`, `make --version`, `g++ --version`, and `pkg-config --version`.
  - Use only the package commands for this distribution.
- **Debian / Ubuntu: install missing tools and libraries after approval:**

  ```sh
  sudo apt-get install build-essential g++ pkg-config python3 python3-venv python3-pip python3-setuptools python-is-python3 libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev
  ```

- **Red Hat-based systems: install missing tools and libraries after approval:**

  ```sh
  sudo yum groupinstall "Development Tools"
  sudo yum install python3 python3-pip python3-setuptools pkgconf-pkg-config libX11-devel libxkbfile-devel libsecret-devel krb5-devel
  ```

- These lists combine the guide's native libraries with explicit Python and packaging dependencies. Package names without architecture suffixes select the native architecture.
- If the distribution's default Python is too old for the checkout, select a supported Python package before continuing.
- For other distributions, use equivalent packages. Do not install `fakeroot` or `rpm` unless the user needs to build distribution packages.

- **Select and check Python for native npm builds:**

  ```sh
  export npm_config_python="$(command -v python3)"
  "$npm_config_python" --version
  "$npm_config_python" -c "import setuptools"
  ```

  - Verify that this is the intended interpreter. If `PATH` selects another Python, set `npm_config_python` to the approved interpreter's absolute path instead.
  - The commands above install `setuptools` through the OS package manager; do not bypass an externally managed Python with `--break-system-packages`.
- **Install VS Code's npm packages:**
  - Run `npm ls --depth=0` to check existing packages.
  - If packages are missing or invalid, or dependency manifests changed, run without `sudo`:

    ```sh
    npm install
    ```

### WSL2: follow the Linux flow inside WSL

- Read the separate [WSL2 guide](https://github.com/microsoft/vscode/wiki/Selfhosting-on-Windows-WSL).
- Follow the Linux section above inside the WSL distribution, including Python, compiler packages, Node selection, and `npm install`.
- Do not run the Windows Build Tools commands inside WSL or mix Windows and Linux Node/Python installations.
- Follow the WSL guide for its platform-specific build and launch requirements.

## Step 4: Start the build watcher

- **Understand the watcher:** It rebuilds the code whenever files change and stays running while the user develops.
- **Start the watcher using one of these methods, not both:**
   - Open a terminal in the selected checkout's root and run **one** of the commands below.
   - **If using `fnm`:**

   ```sh
   fnm exec --using=.nvmrc npm run watch
   ```

   This reads the required Node version from `.nvmrc` and runs `npm run watch` with that version.
   - **If the required Node version is already active:**

   ```sh
   npm run watch
   ```

   - Both commands start the same watcher; `fnm exec` only handles Node version selection.
   - Leave the terminal running while developing.

- **Before moving on:**
  - Confirm core transpilation and core type checking finish without errors.
  - Confirm built-in extensions and Copilot, where present, finish without errors.
  - Verify the watcher is still running and record its task/session ID.
  - Do not treat the first completion message, or logs from a previous branch, as proof that every component finished.

## Step 5: Open Code - OSS

- **Use the selected Node and the actual checkout path:**
  - **macOS / Linux:**

    ```sh
    ./scripts/code.sh
    ```

  - **Windows:**

    ```bat
    .\scripts\code.bat
    ```
