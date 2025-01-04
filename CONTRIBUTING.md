# Contributing to Pear AI

This is the main app for PearAI. The bulk of the functionality is within `extension/pearai-submodule`. Almost all the contributions should be in this subdirectory.

PearAI is a fork of VSCode (and Continue), so simply follow VSCode's guide for running the app.

The extension can be run in two ways:

RECOMMENDED: Internally within the main PearAI application: https://github.com/trypear/pearai/. This guide is for running it internally.

Standalone as an extension. For running it standalone, you will want to `cd` into `extensions/pearai-extension` and visit [Contributing to pearai-extension](extensions/pearai-extension/CONTRIBUTING.md)

After cloning and building the repo, check out the [issues list](https://github.com/trypear/pearai-app/issues). Issues labeled [`good first issue`](https://github.com/trypear/pearai-app/issues?q=is%3Aissue+is%3Aopen+label%3A%22Good+First+Issue%22) are great candidates to pick up if you are in the code for the first time. If you are contributing significant changes, or if the issue is already assigned to a specific month milestone, please discuss with the assignee of the issue first before starting to work on the issue.

## Prerequisites

In order to download necessary tools, clone the repository, and install dependencies via `yarn`, you need network access.

You'll need the following tools:

- [Git](https://git-scm.com)
- [Node.JS](https://nodejs.org/en/), **x64**, version `>=20`
- [Yarn 1](https://classic.yarnpkg.com/en/), version `>=1.10.1 and <2`, follow the [installation guide](https://classic.yarnpkg.com/en/docs/install)
- [Python](https://www.python.org/downloads/) (required for node-gyp; check the [node-gyp readme](https://github.com/nodejs/node-gyp#installation) for the currently supported Python versions)
  - **Note:** Python will be automatically installed for Windows users through installing `windows-build-tools` npm module (see below)
- A C/C++ compiler tool chain for your platform:
  - **Windows 10/11**
    - Install the Windows Build Tools:
      - if you install Node on your system using the Node installer from the [Node.JS](https://nodejs.org/en/download/) page then ensure that you have installed the 'Tools for Native Modules'. Everything should work out of the box then.
      - if you use a node version manager like [nvm](https://github.com/coreybutler/nvm-windows) or [nvs](https://github.com/jasongin/nvs) then follow these steps:
        - Install the current version of Python using the [Microsoft Store Package](https://docs.python.org/3/using/windows.html#the-microsoft-store-package).
        - Install the Visual C++ Build Environment by either installing the [Visual Studio Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools) or the [Visual Studio Community Edition](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=Community) (note: you should only have one of these installed).
        	- Make sure to then install the two options below (the MSVC option is in the "Individual Components" tab). e.g.:
        ```
         [1] Desktop development with C++
         [2] MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (v14.39-17.9)
        ```
    - **Warning:** Make sure your profile path only contains ASCII letters, e.g. *John*, otherwise, it can lead to [node-gyp usage problems (nodejs/node-gyp/issues#297)](https://github.com/nodejs/node-gyp/issues/297)
    - **Note**: Building and debugging via the Windows subsystem for Linux (WSL) is currently not supported.
  - **Windows WSL2**: <https://github.com/microsoft/vscode/wiki/Selfhosting-on-Windows-WSL>
  - **macOS**
    - [Xcode](https://developer.apple.com/xcode/resources/) and the Command Line Tools, which will install `gcc` and the related toolchain containing `make`
      - Run `xcode-select --install` to install the Command Line Tools
  - **Linux**
    - On Debian-based Linux: `sudo apt-get install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev python-is-python3`
    - On Red Hat-based Linux: `sudo yum groupinstall "Development Tools" && sudo yum install libX11-devel.x86_64 libxkbfile-devel.x86_64 libsecret-devel krb5-devel # or .i686`.
    - Others:
      - `make`
      - [pkg-config](https://www.freedesktop.org/wiki/Software/pkg-config/)
      - [GCC](https://gcc.gnu.org) or another compile toolchain
    - Building deb and rpm packages requires `fakeroot` and `rpm`; run: `sudo apt-get install fakeroot rpm`

## Build and Run

The first time you clone the repo, you can:

In PearAI or VSCode, `Command Palette` and type `Run Task` then select `setup-environment`

You can also:

##### macOS and Linux

```
 ./scripts/pearai/setup-environment.sh
```

##### Windows

```bat
.\scripts\pearai/setup-environment.ps1
```

### (If not first time running) Update dependencies

##### macOS and Linux

```bash
./scripts/pearai/install-dependencies.sh
```

##### Windows
```
yarn
```

### Run

Running on Electron with extensions run in NodeJS:

##### macOS and Linux

```bash
./scripts/code.sh
```

##### Windows
- If first time installing, run
```
.\scripts\code.bat
```
- On consecutive runs, we recommned downloading Git Bash, and running the same command as linux/mac to run the app (`./scripts/code.sh`), because it is faster.

*Info: the reason is because the symlinking must be performed within the `code.bat` file on Windows on the first run. But on consecutive runs the symlink will already be created, so you can use the faster script which is `code.sh`

👉 **Tip!** If you receive an error stating that the app is not a valid Electron app, it probably means you didn't run `yarn watch` first.

**Troubleshooting:**

In case of issues, try deleting the contents of `~/.node-gyp` (alternatively `~/.cache/node-gyp` for Linux, `~/Library/Caches/node-gyp/` for macOS, or `%USERPROFILE%\AppData\Local\node-gyp` for Windows) first and then run `yarn cache clean` and then try again.

> If you are on Windows or Linux 64 bit systems and would like to compile to 32 bit, you'll need to set the `npm_config_arch` environment variable to `ia32` before running `yarn`. This will compile all native node modules for a 32 bit architecture. Similarly, when cross-compiling for ARM, set `npm_config_arch` to `arm`.

> **Note:** For more information on how to install NPM modules globally on UNIX systems without resorting to `sudo`, refer to [this guide](http://www.johnpapa.net/how-to-use-npm-global-without-sudo-on-osx/).

> If you have Visual Studio 2019 installed, you may face issues when using the default version of node-gyp. If you have Visual Studio 2019 installed, you may need to follow the solutions [here](https://github.com/nodejs/node-gyp/issues/1747).

- **Windows:** If you have installed Visual Studio 2017 as your build tool, you need to open **x64 Native Tools Command Prompt for VS 2017**. Do not confuse it with *VS2015 x64 Native Tools Command Prompt*, if installed.
- **Linux:** You may hit a ENOSPC error when running the build. To get around this follow instructions in the [Common Questions](https://code.visualstudio.com/docs/setup/linux#_common-questions).

If the build step fails, or if the built version fails to run (see next section), run `git clean -xfd` in your `vscode` folder, then re-run `yarn`.

#### Errors and Warnings
Errors and warnings will show in the console while developing VS Code. If you use VS Code to develop VS Code, errors and warnings are shown in the status bar at the bottom left of the editor. You can view the error list using `View | Errors and Warnings` or pressing <kbd>Ctrl</kbd>+<kbd>P</kbd> and then <kbd>!</kbd> (<kbd>CMD</kbd>+<kbd>P</kbd> and <kbd>!</kbd> on macOS).

👉 **Tip!** You don't need to stop and restart the development version of VS Code after each change. You can just execute `Reload Window` from the command palette. We like to assign the keyboard shortcut <kbd>Ctrl</kbd>+<kbd>R</kbd> (<kbd>CMD</kbd>+<kbd>R</kbd> on macOS) to this command.

### Automated Testing
Run the unit tests directly from a terminal by running `./scripts/test.sh` from the `pearai-app` folder (`scripts\test` on Windows).

We also have automated UI tests. The [smoke test README](https://github.com/trypear/pearai-app/blob/main/test/smoke/README.md) has all the details.

### Unit Testing

Run the tests directly from a terminal by running `./scripts/test.sh` from the `pearai-app` folder (`scripts\test` on Windows). The [test README](https://github.com/trypear/pearai-app/blob/main/test/README.md) has complete details on how to run and debug tests, as well as how to produce coverage reports.

### Linting

We use [eslint](https://eslint.org/) for linting our sources. You can run eslint across the sources by calling `yarn eslint` from a terminal or command prompt. You can also run `yarn eslint` as a task by pressing <kbd>Ctrl</kbd>+<kbd>P</kbd> (<kbd>CMD</kbd>+<kbd>P</kbd> on macOS) and entering `task eslint`.

To lint the source as you make changes you can install the [eslint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

### Extensions

The Visual Studio Marketplace is not available from the `pearai-app` open source builds. If you need to use or debug an extension you can check to see if the extension author publishes builds in their repository (check the `Builds` page) or if it is open source you can clone and build the extension locally. Once you have the .VSIX, you can "side load" the extension either through the command line or using **Install from VSIX** command in the Extensions View command drop-down ([see more](https://code.visualstudio.com/docs/editor/extension-gallery#_command-line-extension-management) on command line extension management).

## Work Branches

Even if you have push rights on the trypear/pearai-app repository, you should create a personal fork and create feature branches there when you need them. This keeps the main repository clean and your personal workflow cruft out of sight.

## Pull Requests

Before we can accept a pull request from you, you'll need to sign a [[Contributor License Agreement (CLA)|Contributor-License-Agreement]]. It is an automated process and you only need to do it once.

To enable us to quickly review and accept your pull requests, always create one pull request per issue and [link the issue in the pull request](https://github.com/blog/957-introducing-issue-mentions). Never merge multiple requests in one unless they have the same root cause. Be sure to follow our [[Coding Guidelines|Coding-Guidelines]] and keep code changes as small as possible. Avoid pure formatting changes to code that has not been modified otherwise. Pull requests should contain tests whenever possible.

## Creating Issues

Before you submit an issue, please do a search in [open issues](https://github.com/trypear/pearai/issues) to see if the issue or feature request has already been filed.
Use the provided issue template when creating a new issue. Fill in the template with as much detail as possible. The more detail you provide, the more likely that someone can help you.
Alternatively, you can use Pear to create a ticket for the problem first. Simply describe the issue or feature request, and Pear will create a ticket for it. This can help you understand the problem better and guide you in manually solving it.
You can also use Pear to create tickets. Simply describe the issue or feature request, and Pear will create a ticket for it.

## Submitting Pull Requests

If you're working on an existing issue, respond to the issue and express interest in working on it. This helps other people know that the issue is active, and hopefully prevents duplicated efforts.

To submit a pull request, follow the following steps:

1. Clone the repository.
2. Create a new branch from `main`.
3. Make your changes.
4. Push your branch and submit a pull request to the `main` branch.
5. Await review. Respond to any comments or requests made by reviewers.

## Important Notes

1. Please do not edit the structure of the repo. Pear is constantly changing, and we want to make sure that we can easily integrate your changes into our codebase.

## Coding Standards

Please ensure your code adheres to the coding standards used throughout the project. This includes proper indentation, accurate comments, and clear, concise code.

## Community

Please be respectful and considerate of others. We're all here to learn and grow, so constructive, respectful communication is encouraged.

## Packaging

This section outlines how to package the app for a new release / distribution. This process is a bit manual currently.

PearAI can be packaged for the following platforms: `win32-ia32 | win32-x64 | darwin-x64 | darwin-arm64 | linux-ia32 | linux-x64 | linux-arm`

These `gulp` tasks are available:

* `vscode-[platform]`: Builds a packaged version for `[platform]`.
* `vscode-[platform]-min`: Builds a packaged and minified version for `[platform]`.

👉 **Tip!** Run `gulp` via `yarn` to avoid potential out of memory issues, for example `yarn gulp vscode-linux-x64`

This will generate the new PearAI app and takes around 1 hour.

Then, `pearai-submodule` also needs to be packaged and integrated into the overall PearAI app.

To do this, follow these steps. Some are manual.

1. `cd` into `extensions/pearai-submodule/extensions/vscode`
2. Run `npm run package'.
3. This will create the `.vsix` extension within `extensions/pearai-submodule/extensions/vscode/build`
4. Right-click the .vsix in VSCode or PearAI and select `Install vsix as Extension`. ![select](assets/pearai-install-vsix.png)

5. This will install the extension as a compatible dist for your system:

If you are using VSCode it will be:
- Windows %USERPROFILE%\.vscode\extensions
- macOS ~/.vscode/extensions
- Linux ~/.vscode/extensions

If you are using PearAI it will be:
- Windows %USERPROFILE%\.pearai\extensions
- macOS ~/.pearai/extensions
- Linux ~/.pearai/extensions

6. Copy the contents of the generated `extensions` folder into the `extensions/pearai` folder of the packaged PearAI App. For example, on MacOS, it is:

`cp -r ~/.vscode/extensions/pearai.pearai-0.9.156 {path_to_PearAI.app}/Contents/Resources/app/extensions`

7. Double-click your overall PearAI app, and the extension should be built-in.
8. Distribute application.

## Known or Common Errors
Below describes a set of known or common errors that can occur when developing with PearAI and the steps that can resolve such issues.

#### No main.js found
The following issue can occur after the build process.
```
[Error: ENOENT: no such file or directory, open '/pearai/out/vs/code/electron-main/main.js'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: '/code/pearai/out/vs/code/electron-main/main.js',
  phase: 'loading',
  moduleId: 'vs/code/electron-main/main',
  neededBy: [ '===anonymous1===' ]
}
```
To resolve this, follow the below steps:
 1. Remove the build `rm -rf out`
 2. Re-run the app: `./scripts/code.sh`
 3. If this persists please reach out via the communication channels listed in the [Contact](#contact) section
