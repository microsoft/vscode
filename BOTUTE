# Code - OSS Development Container
Skip to content Visual Studio Code
Docs
Updates
Blog
API
Extensions
FAQ
Learn
Search Docs
Download VS CodeDownload
Version 1.73 is now available! Read about the new features and fixes from October.

Dismiss this update
Overview
SETUP
GET STARTED
USER GUIDE
SOURCE CONTROL
TERMINAL
LANGUAGES
NODE.JS / JAVASCRIPT
TYPESCRIPT
PYTHON
JAVA
C++
DOCKER
DATA SCIENCE
AZURE
REMOTE
DEV CONTAINERS
Thanks for downloading VS Code for Linux!
Download not starting? Try this direct download link.
Please take a few seconds and help us improve ... click to take survey.

Getting Started
Visual Studio Code is a lightweight but powerful source code editor which runs on your desktop and is available for Windows, macOS and Linux. It comes with built-in support for JavaScript, TypeScript and Node.js and has a rich ecosystem of extensions for other languages and runtimes (such as C++, C#, Java, Python, PHP, Go, .NET). Begin your journey with VS Code with these introductory videos.

Visual Studio Code in Action
Intelligent Code Completion
Code smarter with IntelliSense - completions for variables, methods, and imported modules.
    
Top Extensions
Enable additional languages, themes, debuggers, commands, and more. VS Code's growing community shares their secret sauce to improve your workflow.

Python
Python
70.7M
ms-python
IntelliSense (Pylance), Linting, Debugging (multi-threaded, remote), Jupyter Notebooks, code formatting, refactoring, unit tests, and more.
Jupyter
Jupyter
51.7M
ms-toolsai
Jupyter notebook support, interactive programming and computing that supports Intellisense, debugging and more.
Pylance
Pylance
43.8M
ms-python
A performant, feature-rich language server for Python in VS Code
C/C++
C/C++
39.4M
ms-vscode
C/C++ IntelliSense, debugging, and code browsing.
Jupyter Keymap
Jupyter Keymap
34.0M
ms-toolsai
Jupyter keymaps for notebooks
Jupyter Notebook Renderers
Jupyter Notebook Renderers
32.3M
ms-toolsai
Renderers for Jupyter Notebooks (with plotly, vega, gif, png, svg, jpeg and other such outputs)
Live Server
Live Server
28.3M
ritwickdey
Launch a development local Server with live reload feature for static & dynamic pages
Prettier - Code formatter
Prettier - Code formatter
26.7M
esbenp
Code formatter using prettier
See more in the Marketplace

First Steps
To get the most out of Visual Studio Code, start by reviewing a few introductory topics:

Intro Videos - Begin your journey with VS Code through these introductory videos.

Setup - Install VS Code for your platform and configure the tool set for your development needs.

User Interface - Introduction to the basic UI, commands, and features of the VS Code editor.

Settings - Customize VS Code for how you like to work.

Languages - Learn about VS Code's support for your favorite programming languages.

Node.js - This tutorial gets you quickly running and debugging a Node.js web app.

Tips and Tricks - Jump right in with Tips and Tricks to become a VS Code power user.

Azure - VS Code is great for deploying your web applications to the cloud.

Extension API - Learn how to write a VS Code extension.

Why VS Code? - Read about the design philosophy and architecture of VS Code.

Keyboard Shortcuts
Increase your productivity with VS Code's keyboard shortcuts.

Keyboard Shortcut Reference Sheet - Learn the commonly used keyboard shortcuts.

Keymap Extensions - Change VS Code's keyboard shortcuts to match another editor.

Customize Keyboard Shortcuts - Modify the default keyboard shortcuts.

Downloads
Download VS Code - Quickly find the appropriate install for your platform (Windows, macOS and Linux)

Privacy
By default, VS Code auto-updates to new versions, and collects usage data and crash report information. You may opt out of these defaults by disabling them as instructed below:

How do I disable auto update?

How do I disable crash reporting?

How do I disable usage reporting?
diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
index b96e077aa67ea..1b660e3831075 100644
--- a/CONTRIBUTING.md
+++ b/CONTRIBUTING.md
@@ -1,3 +1,136 @@
+Skip to content
+Search or jump to…
+Pull requests
+Issues
+Marketplace
+Explore
+ 
+@zakwarlord7 
+Your account has been flagged.
+Because of that, your profile is hidden from the public. If you believe this is a mistake, contact support to have your account status reviewed.
+zakwarlord7
+/
+vscode
+Public
+forked from microsoft/vscode
+Code
+Pull requests
+Actions
+Projects
+Wiki
+Security
+Insights
+Settings
+chore: update electron@19.0.12 (microsoft#158025)
+ main (microsoft/vscode#158025)
+@deepak1556
+deepak1556 committed on Aug 13 
+1 parent 99e0034 commit 1a582f7c079d1eb4c89d4f637da2fc2fcb688b31
+Show file tree Hide file tree
+Showing 5 changed files with 11 additions and 11 deletions.
+ 2  
+.yarnrc
+@@ -1,4 +1,4 @@
+disturl "https://electronjs.org/headers"
+target "19.0.11"
+target "19.0.12"
+runtime "electron"
+build_from_source "true"
+  4  
+cgmanifest.json
+@@ -60,12 +60,12 @@
+				"git": {
+					"name": "electron",
+					"repositoryUrl": "https://github.com/electron/electron",
+					"commitHash": "a5cafd174d2027529d0b251e5b8e58da2b364e5b"
+					"commitHash": "b05ccd812e3bb3de5b1546a313e298961653e942"
+				}
+			},
+			"isOnlyProductionDependency": true,
+			"license": "MIT",
+			"version": "19.0.11"
+			"version": "19.0.12"
+		},
+		{
+			"component": {
+  2  
+package.json
+@@ -137,7 +137,7 @@
+    "cssnano": "^4.1.11",
+    "debounce": "^1.0.0",
+    "deemon": "^1.4.0",
+    "electron": "19.0.11",
+    "electron": "19.0.12",
+    "eslint": "8.7.0",
+    "eslint-plugin-header": "3.1.1",
+    "eslint-plugin-jsdoc": "^39.3.2",
+  6  
+src/vs/platform/extensions/electron-main/extensionHostStarter.ts
+@@ -32,7 +32,7 @@ declare namespace UtilityProcessProposedApi {
+		constructor(modulePath: string, args?: string[] | undefined, options?: UtilityProcessOptions);
+		postMessage(channel: string, message: any, transfer?: Electron.MessagePortMain[]): void;
+		kill(signal?: number | string): boolean;
+		on(event: 'exit', listener: (code: number | undefined) => void): this;
+		on(event: 'exit', listener: (event: Electron.Event, code: number) => void): this;
+		on(event: 'spawn', listener: () => void): this;
+	}
+}
+@@ -338,8 +338,8 @@ class UtilityExtensionHostProcess extends Disposable {
+		this._register(Event.fromNodeEventEmitter<void>(this._process, 'spawn')(() => {
+			this._logService.info(`UtilityProcess<${this.id}>: received spawn event.`);
+		}));
+		this._register(Event.fromNodeEventEmitter<number | undefined>(this._process, 'exit')((code: number | undefined) => {
+			code = code || 0;
+		const onExit = Event.fromNodeEventEmitter<number>(this._process, 'exit', (_, code: number) => code);
+		this._register(onExit((code: number) => {
+			this._logService.info(`UtilityProcess<${this.id}>: received exit event with code ${code}.`);
+			this._hasExited = true;
+			this._onExit.fire({ pid: this._process!.pid!, code, signal: '' });
+  8  
+yarn.lock
+@@ -3708,10 +3708,10 @@ electron-to-chromium@^1.4.202:
+  resolved "https://registry.yarnpkg.com/electron-to-chromium/-/electron-to-chromium-1.4.207.tgz#9c3310ebace2952903d05dcaba8abe3a4ed44c01"
+  integrity sha512-piH7MJDJp4rJCduWbVvmUd59AUne1AFBJ8JaRQvk0KzNTSUnZrVXHCZc+eg+CGE4OujkcLJznhGKD6tuAshj5Q==
+
+electron@19.0.11:
+  version "19.0.11"
+  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.11.tgz#0c0a52abc08694fd38916d9270baf45bb7752a27"
+  integrity sha512-GPM6C1Ze17/gR4koTE171MxrI5unYfFRgXQdkMdpWM2Cd55LMUrVa0QHCsfKpsaloufv9T65lsOn0uZuzCw5UA==
+electron@19.0.12:
+  version "19.0.12"
+  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.12.tgz#73d11cc2a3e4dbcd61fdc1c39561e7a7911046e9"
+  integrity sha512-GOvG0t2NCeJYIfmC3g/dnEAQ71k3nQDbRVqQhpi2YbsYMury0asGJwqnVAv2uZQEwCwSx4XOwOQARTFEG/msWw==
+  dependencies:
+    "@electron/get" "^1.14.1"
+    "@types/node" "^16.11.26"
+0 comments on commit 1a582f7
+@zakwarlord7
+ diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
index b96e077aa67ea..1b660e3831075 100644
--- a/CONTRIBUTING.md
+++ b/CONTRIBUTING.md
@@ -1,3 +1,136 @@
+Skip to content
+Search or jump to…
+Pull requests
+Issues
+Marketplace
+Explore
+ 
+@zakwarlord7 
+Your account has been flagged.
+Because of that, your profile is hidden from the public. If you believe this is a mistake, contact support to have your account status reviewed.
+zakwarlord7
+/
+vscode
+Public
+forked from microsoft/vscode
+Code
+Pull requests
+Actions
+Projects
+Wiki
+Security
+Insights
+Settings
+chore: update electron@19.0.12 (microsoft#158025)
+ main (microsoft/vscode#158025)
+@deepak1556
+deepak1556 committed on Aug 13 
+1 parent 99e0034 commit 1a582f7c079d1eb4c89d4f637da2fc2fcb688b31
+Show file tree Hide file tree
+Showing 5 changed files with 11 additions and 11 deletions.
+ 2  
+.yarnrc
+@@ -1,4 +1,4 @@
+disturl "https://electronjs.org/headers"
+target "19.0.11"
+target "19.0.12"
+runtime "electron"
+build_from_source "true"
+  4  
+cgmanifest.json
+@@ -60,12 +60,12 @@
+				"git": {
+					"name": "electron",
+					"repositoryUrl": "https://github.com/electron/electron",
+					"commitHash": "a5cafd174d2027529d0b251e5b8e58da2b364e5b"
+					"commitHash": "b05ccd812e3bb3de5b1546a313e298961653e942"
+				}
+			},
+			"isOnlyProductionDependency": true,
+			"license": "MIT",
+			"version": "19.0.11"
+			"version": "19.0.12"
+		},
+		{
+			"component": {
+  2  
+package.json
+@@ -137,7 +137,7 @@
+    "cssnano": "^4.1.11",
+    "debounce": "^1.0.0",
+    "deemon": "^1.4.0",
+    "electron": "19.0.11",
+    "electron": "19.0.12",
+    "eslint": "8.7.0",
+    "eslint-plugin-header": "3.1.1",
+    "eslint-plugin-jsdoc": "^39.3.2",
+  6  
+src/vs/platform/extensions/electron-main/extensionHostStarter.ts
+@@ -32,7 +32,7 @@ declare namespace UtilityProcessProposedApi {
+		constructor(modulePath: string, args?: string[] | undefined, options?: UtilityProcessOptions);
+		postMessage(channel: string, message: any, transfer?: Electron.MessagePortMain[]): void;
+		kill(signal?: number | string): boolean;
+		on(event: 'exit', listener: (code: number | undefined) => void): this;
+		on(event: 'exit', listener: (event: Electron.Event, code: number) => void): this;
+		on(event: 'spawn', listener: () => void): this;
+	}
+}
+@@ -338,8 +338,8 @@ class UtilityExtensionHostProcess extends Disposable {
+		this._register(Event.fromNodeEventEmitter<void>(this._process, 'spawn')(() => {
+			this._logService.info(`UtilityProcess<${this.id}>: received spawn event.`);
+		}));
+		this._register(Event.fromNodeEventEmitter<number | undefined>(this._process, 'exit')((code: number | undefined) => {
+			code = code || 0;
+		const onExit = Event.fromNodeEventEmitter<number>(this._process, 'exit', (_, code: number) => code);
+		this._register(onExit((code: number) => {
+			this._logService.info(`UtilityProcess<${this.id}>: received exit event with code ${code}.`);
+			this._hasExited = true;
+			this._onExit.fire({ pid: this._process!.pid!, code, signal: '' });
+  8  
+yarn.lock
+@@ -3708,10 +3708,10 @@ electron-to-chromium@^1.4.202:
+  resolved "https://registry.yarnpkg.com/electron-to-chromium/-/electron-to-chromium-1.4.207.tgz#9c3310ebace2952903d05dcaba8abe3a4ed44c01"
+  integrity sha512-piH7MJDJp4rJCduWbVvmUd59AUne1AFBJ8JaRQvk0KzNTSUnZrVXHCZc+eg+CGE4OujkcLJznhGKD6tuAshj5Q==
+
+electron@19.0.11:
+  version "19.0.11"
+  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.11.tgz#0c0a52abc08694fd38916d9270baf45bb7752a27"
+  integrity sha512-GPM6C1Ze17/gR4koTE171MxrI5unYfFRgXQdkMdpWM2Cd55LMUrVa0QHCsfKpsaloufv9T65lsOn0uZuzCw5UA==
+electron@19.0.12:
+  version "19.0.12"
+  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.12.tgz#73d11cc2a3e4dbcd61fdc1c39561e7a7911046e9"
+  integrity sha512-GOvG0t2NCeJYIfmC3g/dnEAQ71k3nQDbRVqQhpi2YbsYMury0asGJwqnVAv2uZQEwCwSx4XOwOQARTFEG/msWw==
+  dependencies:
+    "@electron/get" "^1.14.1"
+    "@types/node" "^16.11.26"
+0 comments on commit 1a582f7
+@zakwarlord7
+ 
+Add heading textAdd bold text, <Ctrl+b>Add italic text, <Ctrl+i>
+Add a quote, <Ctrl+Shift+.>Add code, <Ctrl+e>Add a link, <Ctrl+k>
+Add a bulleted list, <Ctrl+Shift+8>Add a numbered list, <Ctrl+Shift+7>Add a task list, <Ctrl+Shift+l>
+Directly mention a user or team
+Reference an issue, pull request, or discussion
+Add saved reply
+Leave a comment
+No file chosen
+Attach files by dragging & dropping, selecting or pasting them.
+Styling with Markdown is supported
+ You’re not receiving notifications from this thread.
+Footer
+© 2022 GitHub, Inc.
+Footer navigation
+Terms
+Privacy
+Security
+Status
+Docs
+Contact GitHub
+Pricing
+API
+Training
+Blog
+About
 # Contributing to VS Code
 
 Welcome, and thank you for your interest in contributing to VS Code!SON

{
  "type": "ach",
  "amount": 2267700000000000,
  "direction": "credit",
  "currency": "USD",
  "originating_account_id": "<Internal Account ID>",
  "receiving_account_id": "<External Account ID>",
  "metadata": {
    "User ID": "123"
  }
}

+Add heading textAdd bold text, <Ctrl+b>Add italic text, <Ctrl+i>
+Add a quote, <Ctrl+Shift+.>Add code, <Ctrl+e>Add a link, <Ctrl+k>
+Add a bulleted list, <Ctrl+Shift+8>Add a numbered list, <Ctrl+Shift+7>Add a task list, <Ctrl+Shift+l>
+Directly mention a user or team
+Reference an issue, pull request, or discussion
+Add saved reply
+Leave a comment
+No file chosen
+Attach files by dragging & dropping, selecting or pasting them.
+Styling with Markdown is supported
+ You’re not receiving notifications from this thread.
+Footer
+© 2022 GitHub, Inc.
+Footer navigation
+Terms
+Privacy
+Security
+Status
+Docs
+Contact GitHub
+Pricing
+API
+Training
+Blog
+About
 # Contributing to VS Code
 
 Welcome, and thank you for your interest in contributing to VS Code!Was this documentation helpful?
Yes, this page was helpfulNo, this page was not helpful
GETTING STARTED
VS Code in Action
Top Extensions
First Steps
Keyboard Shortcuts
Downloads
Privacy
TwitterTweet this link
RSSSubscribe
StackoverflowAsk questions
TwitterFollow @code
GitHubRequest features
IssuesReport issues
YouTubeWatch videos
Hello from Seattle. Follow @code Support Privacy Terms of Use License 
Microsoft homepage© 2022 Microsoft
[![Open in Dev Containers](https://img.shields.io/static/v1?label=Dev%20Containers&message=Open&color=blue&logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode)

This repository includes configuration for a development container for working with Code - OSS in a local container or using [GitHub Codespaces](https://github.com/features/codespaces).

> **Tip:** The default VNC password is `vscode`. The VNC server runs on port `5901` and a web client is available on port `6080`.

## Quick start - local

If you already have VS Code and Docker installed, you can click the badge above or [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. Clicking these links will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.

1. Install Docker Desktop or Docker for Linux on your local machine. (See [docs](https://aka.ms/vscode-remote/containers/getting-started) for additional details.)

2. **Important**: Docker needs at least **4 Cores and 8 GB of RAM** to run a full build with **9 GB of RAM** being recommended. If you are on macOS, or are using the old Hyper-V engine for Windows, update these values for Docker Desktop by right-clicking on the Docker status bar item and going to **Preferences/Settings > Resources > Advanced**.

    > **Note:** The [Resource Monitor](https://marketplace.visualstudio.com/items?itemName=mutantdino.resourcemonitor) extension is included in the container so you can keep an eye on CPU/Memory in the status bar.

3. Install [Visual Studio Code Stable](https://code.visualstudio.com/) or [Insiders](https://code.visualstudio.com/insiders/) and the [Dev Containers](https://aka.ms/vscode-remote/download/containers) extension.

    ![Image of Dev Containers extension](https://microsoft.github.io/vscode-remote-release/images/dev-containers-extn.png)

    > **Note:** The Dev Containers extension requires the Visual Studio Code distribution of Code - OSS. See the [FAQ](https://aka.ms/vscode-remote/faq/license) for details.

4. Press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd> and select **Dev Containers: Clone Repository in Container Volume...**.

    > **Tip:** While you can use your local source tree instead, operations like `yarn install` can be slow on macOS or when using the Hyper-V engine on Windows. We recommend the "clone repository in container" approach instead since it uses "named volume" rather than the local filesystem.

5. Type `https://github.com/microsoft/vscode` (or a branch or PR URL) in the input box and press <kbd>Enter</kbd>.

6. After the container is running, open a web browser and go to [http://localhost:6080](http://localhost:6080), or use a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to `localhost:5901` and enter `vscode` as the password.

Anything you start in VS Code, or the integrated terminal, will appear here.

Next: **[Try it out!](#try-it)**

## Quick start - GitHub Codespaces

1. From the [microsoft/vscode GitHub repository](https://github.com/microsoft/vscode), click on the **Code** dropdown, select **Open with Codespaces**, and then click on **New codespace**. If prompted, select the **Standard** machine size (which is also the default).

   > **Note:** You will not see these options within GitHub if you are not in the Codespaces beta.

2. After the codespace is up and running in your browser, press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd> and select **Ports: Focus on Ports View**.

3. You should see **VNC web client (6080)** under in the list of ports. Select the line and click on the globe icon to open it in a browser tab.

    > **Tip:** If you do not see the port, <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd>, select **Forward a Port** and enter port `6080`.

4. In the new tab, you should see noVNC. Click **Connect** and enter `vscode` as the password.

Anything you start in VS Code, or the integrated terminal, will appear here.

Next: **[Try it out!](#try-it)**

### Using VS Code with GitHub Codespaces

You may see improved VNC responsiveness when accessing a codespace from VS Code client since you can use a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/). Here's how to do it.

1.  Install [Visual Studio Code Stable](https://code.visualstudio.com/) or [Insiders](https://code.visualstudio.com/insiders/) and the the [GitHub Codespaces extension](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces).

	> **Note:** The GitHub Codespaces extension requires the Visual Studio Code distribution of Code - OSS.

2. After the VS Code is up and running, press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> or <kbd>F1</kbd>, choose **Codespaces: Create New Codespace**, and use the following settings:
    - `microsoft/vscode` for the repository.
	- Select any branch (e.g. **main**) - you can select a different one later.
	- Choose **Standard** (4-core, 8GB) as the size.

4. After you have connected to the codespace, you can use a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to `localhost:5901` and enter `vscode` as the password.

    > **Tip:** You may also need change your VNC client's **Picture Quality** setting to **High** to get a full color desktop.

5. Anything you start in VS Code, or the integrated terminal, will appear here.

Next: **[Try it out!](#try-it)**

## Try it!

This container uses the [Fluxbox](http://fluxbox.org/) window manager to keep things lean. **Right-click on the desktop** to see menu options. It works with GNOME and GTK applications, so other tools can be installed if needed.

> **Note:** You can also set the resolution from the command line by typing `set-resolution`.

To start working with Code - OSS, follow these steps:

1. In your local VS Code client, open a terminal (<kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>\`</kbd>) and type the following commands:

    ```bash
    yarn install
    bash scripts/code.sh
    ```

2. After the build is complete, open a web browser or a [VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to the desktop environment as described in the quick start and enter `vscode` as the password.

3. You should now see Code - OSS!

Next, let's try debugging.

1. Shut down Code - OSS by clicking the box in the upper right corner of the Code - OSS window through your browser or VNC viewer.

2. Go to your local VS Code client, and use the **Run / Debug** view to launch the **VS Code** configuration. (Typically the default, so you can likely just press <kbd>F5</kbd>).

    > **Note:** If launching times out, you can increase the value of `timeout` in the "VS Code", "Attach Main Process", "Attach Extension Host", and "Attach to Shared Process" configurations in [launch.json](../.vscode/launch.json). However, running `scripts/code.sh` first will set up Electron which will usually solve timeout issues.

3. After a bit, Code - OSS will appear with the debugger attached!

Enjoy!
