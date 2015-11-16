# Visual Studio Code - Open Source

VS Code is a new choice of tool that combines the simplicity of a code editor with what developers need for their core edit-build-debug cycle. It is the first editor and first cross platform tool in the Visual Studio family of products.

Code incorporates Visual Studio's world class editing and debugging experiences while integrating with your existing tool chain. A rich extensibility model and ecosystem provides support for a broad array of languages and tools that integrate seamlessly with Code.

The [`vscode`](https://github.com/microsoft/vscode) repository is where the Code team does development. We encourage you to follow along, take part in the discussion, submit issues, suggest a feature, or create a pull request!

Follow us [@code](https://twitter.com/code).

## Installation and Documentation
Download the latest build for your platform from the [Visual Studio Code](http://code.visualstudio.com) website. Once installed, Code will automatically update itself when we publish new releases.

Everything you need to know about using and extending Code can be found in our online [documentation](http://code.visualstudio.com/docs). Found a typo? Want to clarify something? Clone the [`vscode-docs`](https://github.com/microsoft/vscode-docs) repository and make a pull request.

## Contributing

There are many ways to contribute to the Code project. For example:

* [Submit bugs](https://github.com/microsoft/vscode/issues) and help us verify fixes as they are checked in
* Review [source code changes](https://github.com/microsoft/vscode/pulls)
* Engage with users and other developers on [Stack Overflow](http://go.microsoft.com/fwlink/?LinkID=536384)
* [Fix a bug and make a pull request](https://github.com/Microsoft/vscode/wiki/How-to-Contribute)
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to new content

Check out [How to Contribute](https://github.com/Microsoft/vscode/wiki) for more information.

## Build and Run From Source

If you want to understand how Code works or want to debug an issue, you'll want to get the source, build it, and run the tool locally.

### Installing Prerequisites

[Download the latest version](https://code.visualstudio.com/Download) of Visual Studio Code (you will use VS Code to edit Code!)

Code includes node module dependencies that require native compilation. To ensure the compilation is picking up the right version of header files from the Electron Shell, we have our own script to run the installation via npm.

**Tip!** In case you fail to build the native modules you can copy the node_modules folder of the VS Code installation into the `vscode` workspace node_modules folder. You will still need to run our unpm install to get all the development dependencies.

For native compilation, you will need python (version `v2.7` recommended, `v3.x.x` is __*not*__ supported) as well as a C/C++ compiler tool chain.

**Windows:**
* In addition to Python v2.7, make sure you have a PYTHON environment variable set to `drive:\path\to\python.exe`, not to a folder
* Visual Studio 2013 for Windows Desktop or [Visual Studio 2015](https://www.visualstudio.com/en-us/products/visual-studio-community-vs.aspx) , make sure to select the option to install all C++ tools and the Windows SDK

**OS X** Command line developer tools
* Python should be installed already
* [XCode](https://developer.apple.com/xcode/downloads/) and the Command Line Tools (XCode -> Preferences -> Downloads), which will install `gcc` and the related toolchain containing `make`

**Linux:**
* Python v2.7
* `make`
* A proper C/C++ compiler toolchain, for example [GCC](https://gcc.gnu.org)

After you have these tools installed, run the following commands to check out Code and install dependencies:

OS X

	git clone https://github.com/microsoft/vscode
	cd vscode && npm install -g mocha gulp
	./scripts/npm.sh install

Windows

	git clone https://github.com/microsoft/vscode
	cd vscode
	npm install -g mocha gulp
	scripts\npm install

Linux

	git clone https://github.com/microsoft/vscode
	cd vscode && npm install -g mocha gulp
	./scripts/npm.sh install --arch=x64
	# for 32bit Linux
	#./scripts/npm.sh install --arch=ia32

## Development Workflow

### Incremental Build
Open VS Code on the folder where you have cloned the `vscode` repository and press `CMD+SHIFT+B` (`CTRL+SHIFT+B` on Windows, Linux) to start the TypeScript builder. It will do an initial full build and then watch for file changes, compiling those changes *incrementally*. To view the build output open the Output stream by pressing `CMD+SHIFT+U`.

### Errors and Warnigns
Errors and warnings are indicated in the status bar at the bottom left. You can view the error list using `View | Errors and Warnings` or pressing `CMD+P` and then `!`. Please note, if you start the TypeScript builder from a terminal using `gulp watch`, errors and warnings will only show in the console and not in Code.

**Tip!** You do not need to stop and restart the development version after each change, you can just execute `Reload Window` from the command palette.

### Validate your changes
To test the changes you launch a development version of VS Code on the workspace `vscode`, which you are currently editing.

OS X and Linux

	./scripts/code.sh

Windows

	.\scripts\code.bat

You can identify the development version of Code by the Electron icon in the Dock or Taskbar.

**Tip!** If you receive an error stating that the app is not a valid Electron app, it probably means you didn't run `gulp watch` first.

### Debugging
Code has a multi-process architecture and your code is executed in different processes.

The **render** process runs the UI code inside the Shell window. To debug code running in the **renderer** you can either use VS Code or the Chrome Developer Tools.

#### Using VSCode
* Install the [Debugger for Chrome](https://marketplace.visualstudio.com/items/msjsdiag.debugger-for-chrome) extension. This extension will let you attach to and debug client side code running in Chrome.
* Launch the development version of Code with the following command line option:

OSX and Linux
``` bash
./scripts/code.sh --remote-debugging-port=9222
```
Windows
``` bash
scripts\code --remote-debugging-port=9222
```

* Choose the `Attach to VSCode` launch configuration from the launch dropdown in the Debug viewlet and press `F5`.


#### Using the Chrome Developers Tools

* Run the `Developer: Toggle Developer Tools` command from the Command Palette in your development instance of Code to launch the Chrome tools.

The **extension host** process runs code implemented by a plugin. To debug extensions (including those packaged with Code) which run in the extension host process, you can use VS Code itself. Switch to the Debug viewlet, choose the `Attach to Extension Host` configuration, and press `F5`.

### Unit Testing
Press `CMD+SHIFT+T` (`CTRL+SHIFT+T` on Windows) to start the unit tests or run the tests directly from a terminal by running `./test/run.sh` from the `vscode` folder (`test\run` on Windows). The [test README](/test/README.md) has complete details on how to run and debug tests, as well as how to produce coverage reports.
