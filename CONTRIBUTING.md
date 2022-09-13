Skip to content
Search or jump to…
Pull requests
Issues
Marketplace
Explore
 
@zakwarlord7 
Your account has been flagged.
Because of that, your profile is hidden from the public. If you believe this is a mistake, contact support to have your account status reviewed.
zakwarlord7
/
vscode
Public
forked from microsoft/vscode
Code
Pull requests
Actions
Projects
Wiki
Security
Insights
Settings
chore: update electron@19.0.12 (microsoft#158025)
 main (microsoft/vscode#158025)
@deepak1556
deepak1556 committed on Aug 13 
1 parent 99e0034 commit 1a582f7c079d1eb4c89d4f637da2fc2fcb688b31
Show file tree Hide file tree
Showing 5 changed files with 11 additions and 11 deletions.
 2  
.yarnrc
@@ -1,4 +1,4 @@
disturl "https://electronjs.org/headers"
target "19.0.11"
target "19.0.12"
runtime "electron"
build_from_source "true"
  4  
cgmanifest.json
@@ -60,12 +60,12 @@
				"git": {
					"name": "electron",
					"repositoryUrl": "https://github.com/electron/electron",
					"commitHash": "a5cafd174d2027529d0b251e5b8e58da2b364e5b"
					"commitHash": "b05ccd812e3bb3de5b1546a313e298961653e942"
				}
			},
			"isOnlyProductionDependency": true,
			"license": "MIT",
			"version": "19.0.11"
			"version": "19.0.12"
		},
		{
			"component": {
  2  
package.json
@@ -137,7 +137,7 @@
    "cssnano": "^4.1.11",
    "debounce": "^1.0.0",
    "deemon": "^1.4.0",
    "electron": "19.0.11",
    "electron": "19.0.12",
    "eslint": "8.7.0",
    "eslint-plugin-header": "3.1.1",
    "eslint-plugin-jsdoc": "^39.3.2",
  6  
src/vs/platform/extensions/electron-main/extensionHostStarter.ts
@@ -32,7 +32,7 @@ declare namespace UtilityProcessProposedApi {
		constructor(modulePath: string, args?: string[] | undefined, options?: UtilityProcessOptions);
		postMessage(channel: string, message: any, transfer?: Electron.MessagePortMain[]): void;
		kill(signal?: number | string): boolean;
		on(event: 'exit', listener: (code: number | undefined) => void): this;
		on(event: 'exit', listener: (event: Electron.Event, code: number) => void): this;
		on(event: 'spawn', listener: () => void): this;
	}
}
@@ -338,8 +338,8 @@ class UtilityExtensionHostProcess extends Disposable {
		this._register(Event.fromNodeEventEmitter<void>(this._process, 'spawn')(() => {
			this._logService.info(`UtilityProcess<${this.id}>: received spawn event.`);
		}));
		this._register(Event.fromNodeEventEmitter<number | undefined>(this._process, 'exit')((code: number | undefined) => {
			code = code || 0;
		const onExit = Event.fromNodeEventEmitter<number>(this._process, 'exit', (_, code: number) => code);
		this._register(onExit((code: number) => {
			this._logService.info(`UtilityProcess<${this.id}>: received exit event with code ${code}.`);
			this._hasExited = true;
			this._onExit.fire({ pid: this._process!.pid!, code, signal: '' });
  8  
yarn.lock
@@ -3708,10 +3708,10 @@ electron-to-chromium@^1.4.202:
  resolved "https://registry.yarnpkg.com/electron-to-chromium/-/electron-to-chromium-1.4.207.tgz#9c3310ebace2952903d05dcaba8abe3a4ed44c01"
  integrity sha512-piH7MJDJp4rJCduWbVvmUd59AUne1AFBJ8JaRQvk0KzNTSUnZrVXHCZc+eg+CGE4OujkcLJznhGKD6tuAshj5Q==

electron@19.0.11:
  version "19.0.11"
  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.11.tgz#0c0a52abc08694fd38916d9270baf45bb7752a27"
  integrity sha512-GPM6C1Ze17/gR4koTE171MxrI5unYfFRgXQdkMdpWM2Cd55LMUrVa0QHCsfKpsaloufv9T65lsOn0uZuzCw5UA==
electron@19.0.12:
  version "19.0.12"
  resolved "https://registry.yarnpkg.com/electron/-/electron-19.0.12.tgz#73d11cc2a3e4dbcd61fdc1c39561e7a7911046e9"
  integrity sha512-GOvG0t2NCeJYIfmC3g/dnEAQ71k3nQDbRVqQhpi2YbsYMury0asGJwqnVAv2uZQEwCwSx4XOwOQARTFEG/msWw==
  dependencies:
    "@electron/get" "^1.14.1"
    "@types/node" "^16.11.26"
0 comments on commit 1a582f7
@zakwarlord7
 
Add heading textAdd bold text, <Ctrl+b>Add italic text, <Ctrl+i>
Add a quote, <Ctrl+Shift+.>Add code, <Ctrl+e>Add a link, <Ctrl+k>
Add a bulleted list, <Ctrl+Shift+8>Add a numbered list, <Ctrl+Shift+7>Add a task list, <Ctrl+Shift+l>
Directly mention a user or team
Reference an issue, pull request, or discussion
Add saved reply
Leave a comment
No file chosen
Attach files by dragging & dropping, selecting or pasting them.
Styling with Markdown is supported
 You’re not receiving notifications from this thread.
Footer
© 2022 GitHub, Inc.
Footer navigation
Terms
Privacy
Security
Status
Docs
Contact GitHub
Pricing
API
Training
Blog
About
# Contributing to VS Code

Welcome, and thank you for your interest in contributing to VS Code!

There are many ways in which you can contribute, beyond writing code. The goal of this document is to provide a high-level overview of how you can get involved.

## Asking Questions

Have a question? Rather than opening an issue, please ask away on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode) using the tag `vscode`.

The active community will be eager to assist you. Your well-worded question will serve as a resource to others searching for help.

## Providing Feedback

Your comments and feedback are welcome, and the development team is available via a handful of different channels.

See the [Feedback Channels](https://github.com/microsoft/vscode/wiki/Feedback-Channels) wiki page for details on how to share your thoughts.

## Reporting Issues

Have you identified a reproducible problem in VS Code? Have a feature request? We want to hear about it! Here's how you can report your issue as effectively as possible.

### Identify Where to Report

The VS Code project is distributed across multiple repositories. Try to file the issue against the correct repository. Check the list of [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) if you aren't sure which repo is correct.

Can you recreate the issue even after [disabling all extensions](https://code.visualstudio.com/docs/editor/extension-gallery#_disable-an-extension)? If you find the issue is caused by an extension you have installed, please file an issue on the extension's repo directly.

### Look For an Existing Issue

Before you create a new issue, please do a search in [open issues](https://github.com/microsoft/vscode/issues) to see if the issue or feature request has already been filed.

Be sure to scan through the [most popular](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc) feature requests.

If you find your issue already exists, make relevant comments and add your [reaction](https://github.com/blog/2119-add-reactions-to-pull-requests-issues-and-comments). Use a reaction in place of a "+1" comment:

* 👍 - upvote
* 👎 - downvote

If you cannot find an existing issue that describes your bug or feature, create a new issue using the guidelines below.

### Writing Good Bug Reports and Feature Requests

File a single issue per problem and feature request. Do not enumerate multiple bugs or feature requests in the same issue.

Do not add your issue as a comment to an existing issue unless it's for the identical input. Many issues look similar but have different causes.

The more information you can provide, the more likely someone will be successful at reproducing the issue and finding a fix.

The built-in tool for reporting an issue, which you can access by using `Report Issue` in VS Code's Help menu, can help streamline this process by automatically providing the version of VS Code, all your installed extensions, and your system info. Additionally, the tool will search among existing issues to see if a similar issue already exists.

Please include the following with each issue:

* Version of VS Code

* Your operating system

* List of extensions that you have installed

* Reproducible steps (1... 2... 3...) that cause the issue

* What you expected to see, versus what you actually saw

* Images, animations, or a link to a video showing the issue occurring

* A code snippet that demonstrates the issue or a link to a code repository the developers can easily pull down to recreate the issue locally

  * **Note:** Because the developers need to copy and paste the code snippet, including a code snippet as a media file (i.e. .gif) is not sufficient.

* Errors from the Dev Tools Console (open from the menu: Help > Toggle Developer Tools)

### Creating Pull Requests

* Please refer to the article on [creating pull requests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests) and contributing to this project.

### Final Checklist

Please remember to do the following:

* [ ] Search the issue repository to ensure your report is a new issue

* [ ] Recreate the issue after disabling all extensions

* [ ] Simplify your code around the issue to better isolate the problem

Don't feel bad if the developers can't reproduce the issue right away. They will simply ask for more information!

### Follow Your Issue

Once submitted, your report will go into the [issue tracking](https://github.com/microsoft/vscode/wiki/Issue-Tracking) workflow. Be sure to understand what will happen next, so you know what to expect, and how to continue to assist throughout the process.

## Automated Issue Management

We use GitHub Actions to help us manage issues. These Actions and their descriptions can be [viewed here](https://github.com/microsoft/vscode-github-triage-actions). Some examples of what these Actions do are:

* Automatically closes any issue marked `needs-more-info` if there has been no response in the past 7 days.
* Automatically lock issues 45 days after they are closed.
* Automatically implement the VS Code [feature request pipeline](https://github.com/microsoft/vscode/wiki/Issues-Triaging#managing-feature-requests).

If you believe the bot got something wrong, please open a new issue and let us know.

## Contributing Fixes

If you are interested in writing code to fix issues,
please see [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) in the wiki.

# Thank You!

Your contributions to open source, large or small, make great projects like this possible. Thank you for taking the time to contribute.
