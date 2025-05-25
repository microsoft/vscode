/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(function () {

	const { ipcRenderer, webFrame, contextBridge, webUtils } = require('electron');

	type ISandboxConfiguration = import('../common/sandboxTypes.js').ISandboxConfiguration;

	//#region Utilities

	function validateIPC(channel: string): true | never {
		if (!channel || !channel.startsWith('vscode:')) {
			throw new Error(`Unsupported event IPC channel '${channel}'`);
		}

		return true;
	}

	function parseArgv(key: string): string | undefined {
		for (const arg of process.argv) {
			if (arg.indexOf(`--${key}=`) === 0) {
				return arg.split('=')[1];
			}
		}

		return undefined;
	}

	//#endregion

	//#region Resolve Configuration

	let configuration: ISandboxConfiguration | undefined = undefined;

	const resolveConfiguration: Promise<ISandboxConfiguration> = (async () => {
		const windowConfigIpcChannel = parseArgv('vscode-window-config');
		if (!windowConfigIpcChannel) {
			throw new Error('Preload: did not find expected vscode-window-config in renderer process arguments list.');
		}

		try {
			validateIPC(windowConfigIpcChannel);

			// Resolve configuration from electron-main
			const resolvedConfiguration: ISandboxConfiguration = configuration = await ipcRenderer.invoke(windowConfigIpcChannel);

			// Apply `userEnv` directly
			Object.assign(process.env, resolvedConfiguration.userEnv);

			// Apply zoom level early before even building the
			// window DOM elements to avoid UI flicker. We always
			// have to set the zoom level from within the window
			// because Chrome has it's own way of remembering zoom
			// settings per origin (if vscode-file:// is used) and
			// we want to ensure that the user configuration wins.
			webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);

			return resolvedConfiguration;
		} catch (error) {
			throw new Error(`Preload: unable to fetch vscode-window-config: ${error}`);
		}
	})();

	//#endregion

	//#region Resolve Shell Environment

	/**
	 * If VSCode is not run from a terminal, we should resolve additional
	 * shell specific environment from the OS shell to ensure we are seeing
	 * all development related environment variables. We do this from the
	 * main process because it may involve spawning a shell.
	 */
	const resolveShellEnv: Promise<typeof process.env> = (async () => {

		// Resolve `userEnv` from configuration and
		// `shellEnv` from the main side
		const [userEnv, shellEnv] = await Promise.all([
			(async () => (await resolveConfiguration).userEnv)(),
			ipcRenderer.invoke('vscode:fetchShellEnv')
		]);

		return { ...process.env, ...shellEnv, ...userEnv };
	})();

	//#endregion

	//#region Globals Definition

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
	// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/electron/electron/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	const globals = {

		/**
		 * A minimal set of methods exposed from Electron's `ipcRenderer`
		 * to support communication to main process.
		 */

		ipcRenderer: {

			send(channel: string, ...args: any[]): void {
				if (validateIPC(channel)) {
					ipcRenderer.send(channel, ...args);
				}
			},

			invoke(channel: string, ...args: any[]): Promise<any> {
				validateIPC(channel);

				return ipcRenderer.invoke(channel, ...args);
			},

			on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) {
				validateIPC(channel);

				ipcRenderer.on(channel, listener);

				return this;
			},

			once(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) {
				validateIPC(channel);

				ipcRenderer.once(channel, listener);

				return this;
			},

			removeListener(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) {
				validateIPC(channel);

				ipcRenderer.removeListener(channel, listener);

				return this;
			}
		},

		ipcMessagePort: {

			acquire(responseChannel: string, nonce: string) {
				if (validateIPC(responseChannel)) {
					const responseListener = (e: Electron.IpcRendererEvent, responseNonce: string) => {
						// validate that the nonce from the response is the same
						// as when requested. and if so, use `postMessage` to
						// send the `MessagePort` safely over, even when context
						// isolation is enabled
						if (nonce === responseNonce) {
							ipcRenderer.off(responseChannel, responseListener);
							window.postMessage(nonce, '*', e.ports);
						}
					};

					// handle reply from main
					ipcRenderer.on(responseChannel, responseListener);
				}
			}
		},

		/**
		 * Support for subset of methods of Electron's `webFrame` type.
		 */
		webFrame: {

			setZoomLevel(level: number): void {
				if (typeof level === 'number') {
					webFrame.setZoomLevel(level);
				}
			}
		},

		/**
		 * Support for subset of Electron's `webUtils` type.
		 */
		webUtils: {

			getPathForFile(file: File): string {
				return webUtils.getPathForFile(file);
			}
		},

		/**
		 * Support for a subset of access to node.js global `process`.
		 *
		 * Note: when `sandbox` is enabled, the only properties available
		 * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
		 */
		process: {
			get platform() { return process.platform; },
			get arch() { return process.arch; },
			get env() { return { ...process.env }; },
			get versions() { return process.versions; },
			get type() { return 'renderer'; },
			get execPath() { return process.execPath; },

			cwd(): string {
				return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
			},

			shellEnv(): Promise<typeof process.env> {
				return resolveShellEnv;
			},

			getProcessMemoryInfo(): Promise<Electron.ProcessMemoryInfo> {
				return process.getProcessMemoryInfo();
			},

			on(type: string, callback: (...args: any[]) => void): void {
				process.on(type, callback);
			}
		},

		/**
		 * Some information about the context we are running in.
		 */
		context: {

			/**
			 * A configuration object made accessible from the main side
			 * to configure the sandbox browser window.
			 *
			 * Note: intentionally not using a getter here because the
			 * actual value will be set after `resolveConfiguration`
			 * has finished.
			 */
			configuration(): ISandboxConfiguration | undefined {
				return configuration;
			},

			/**
			 * Allows to await the resolution of the configuration object.
			 */
			async resolveConfiguration(): Promise<ISandboxConfiguration> {
				return resolveConfiguration;
			}
		}
	};

	// Use `contextBridge` APIs to expose globals to VSCode
	// only if context isolation is enabled, otherwise just
	// add to the DOM global.
	if (process.contextIsolated) {
		try {
			contextBridge.exposeInMainWorld('vscode', globals);
		} catch (error) {
			console.error(error);
		}
	} else {
		(window as any).vscode = globals;
	}
}());
