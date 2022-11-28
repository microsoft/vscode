# This dockerfile is used to build up from a base image to create an image a cache.tar file containing the results of running "prepare.sh".
# Other image contents: https://github.com/microsoft/vscode-dev-containers/blob/master/repository-containers/images/github.com/microsoft/vscode/.devcontainer/base.Dockerfile

# This first stage generates cache.tar
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as cache
ARG USERNAME=node
ARG CACHE_FOLDER="/home/${USERNAME}/.devcontainer-cache"
COPY --chown=${USERNAME}:${USERNAME} . /repo-source-tmp/
RUN mkdir -p ${CACHE_FOLDER} && chown ${USERNAME} ${CACHE_FOLDER} /repo-source-tmp \
	&& su ${USERNAME} -c "\
		cd /repo-source-tmp \
		&& .devcontainer/cache/before-cache.sh . ${CACHE_FOLDER} \
		&& .devcontainer/prepare.sh . ${CACHE_FOLDER} \
		&& .devcontainer/cache/cache-diff.sh . ${CACHE_FOLDER}"

# This second stage starts fresh and just copies in cache.tar from the previous stage. The related
# devcontainer.json file is then setup to have postCreateCommand fire restore-diff.sh to expand it.
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as dev-container
ARG USERNAME=node
ARG CACHE_FOLDER="/home/${USERNAME}/.devcontainer-cache"
RUN mkdir -p "${CACHE_FOLDER}" \
	&& chown "${USERNAME}:${USERNAME}" "${CACHE_FOLDER}" \
	&& su ${USERNAME} -c "git config --global codespaces-theme.hide-status 1"
COPY --from=cache ${CACHE_FOLDER}/cache.tar ${CACHE_FOLDER}/
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
 
 Welcome, and thank you for your interest in contributing to VS Code!
