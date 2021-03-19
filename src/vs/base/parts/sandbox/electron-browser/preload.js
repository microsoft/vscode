/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
(function () {
	'use strict';

	const { ipcRenderer, webFrame, crashReporter, contextBridge } = require('electron');

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
		 *
		 * @type {import('../electron-sandbox/electronTypes').IpcRenderer}
		 */
		ipcRenderer: {

			/**
			 * @param {string} channel
			 * @param {any[]} args
			 */
			send(channel, ...args) {
				if (validateIPC(channel)) {
					ipcRenderer.send(channel, ...args);
				}
			},

			/**
			 * @param {string} channel
			 * @param {any[]} args
			 * @returns {Promise<any> | undefined}
			 */
			invoke(channel, ...args) {
				if (validateIPC(channel)) {
					return ipcRenderer.invoke(channel, ...args);
				}
			},

			/**
			 * @param {string} channel
			 * @param {(event: import('electron').IpcRendererEvent, ...args: any[]) => void} listener
			 * @returns {import('../electron-sandbox/electronTypes').IpcRenderer}
			 */
			on(channel, listener) {
				if (validateIPC(channel)) {
					ipcRenderer.on(channel, listener);

					return this;
				}
			},

			/**
			 * @param {string} channel
			 * @param {(event: import('electron').IpcRendererEvent, ...args: any[]) => void} listener
			 * @returns {import('../electron-sandbox/electronTypes').IpcRenderer}
			 */
			once(channel, listener) {
				if (validateIPC(channel)) {
					ipcRenderer.once(channel, listener);

					return this;
				}
			},

			/**
			 * @param {string} channel
			 * @param {(event: import('electron').IpcRendererEvent, ...args: any[]) => void} listener
			 * @returns {import('../electron-sandbox/electronTypes').IpcRenderer}
			 */
			removeListener(channel, listener) {
				if (validateIPC(channel)) {
					ipcRenderer.removeListener(channel, listener);

					return this;
				}
			}
		},

		/**
		 * @type {import('../electron-sandbox/globals').IpcMessagePort}
		 */
		ipcMessagePort: {

			/**
			 * @param {string} channelRequest
			 * @param {string} channelResponse
			 * @param {string} requestNonce
			 */
			connect(channelRequest, channelResponse, requestNonce) {
				if (validateIPC(channelRequest) && validateIPC(channelResponse)) {
					const responseListener = (/** @type {import('electron').IpcRendererEvent} */ e, /** @type {string} */ responseNonce) => {
						// validate that the nonce from the response is the same
						// as when requested. and if so, use `postMessage` to
						// send the `MessagePort` safely over, even when context
						// isolation is enabled
						if (requestNonce === responseNonce) {
							ipcRenderer.off(channelResponse, responseListener);
							window.postMessage(requestNonce, '*', e.ports);
						}
					};

					// request message port from main and await result
					ipcRenderer.on(channelResponse, responseListener);
					ipcRenderer.send(channelRequest, requestNonce);
				}
			}
		},

		/**
		 * Support for subset of methods of Electron's `webFrame` type.
		 *
		 * @type {import('../electron-sandbox/electronTypes').WebFrame}
		 */
		webFrame: {

			/**
			 * @param {number} level
			 */
			setZoomLevel(level) {
				if (typeof level === 'number') {
					webFrame.setZoomLevel(level);
				}
			}
		},

		/**
		 * Support for subset of methods of Electron's `crashReporter` type.
		 *
		 * @type {import('../electron-sandbox/electronTypes').CrashReporter}
		 */
		crashReporter: {

			/**
			 * @param {string} key
			 * @param {string} value
			 */
			addExtraParameter(key, value) {
				crashReporter.addExtraParameter(key, value);
			}
		},

		/**
		 * Support for a subset of access to node.js global `process`.
		 *
		 * Note: when `sandbox` is enabled, the only properties available
		 * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
		 *
		 * @type {import('../electron-sandbox/globals').ISandboxNodeProcess}
		 */
		process: {
			get platform() { return process.platform; },
			get arch() { return process.arch; },
			get env() { return process.env; },
			get versions() { return process.versions; },
			get type() { return 'renderer'; },
			get execPath() { return process.execPath; },
			get sandboxed() { return process.sandboxed; },

			/**
			 * @returns {string}
			 */
			cwd() {
				return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
			},

			/**
			 * @returns {Promise<typeof process.env>}
			 */
			getShellEnv() {
				return shellEnv;
			},

			/**
			 * @param {{[key: string]: string}} userEnv
			 * @returns {Promise<void>}
			 */
			resolveEnv(userEnv) {
				return resolveEnv(userEnv);
			},

			/**
			 * @returns {Promise<import('electron').ProcessMemoryInfo>}
			 */
			getProcessMemoryInfo() {
				return process.getProcessMemoryInfo();
			},

			/**
			 * @param {string} type
			 * @param {Function} callback
			 * @returns {import('../electron-sandbox/globals').ISandboxNodeProcess}
			 */
			on(type, callback) {
				if (validateProcessEventType(type)) {
					// @ts-ignore
					process.on(type, callback);

					return this;
				}
			}
		}
	};

	// Use `contextBridge` APIs to expose globals to VSCode
	// only if context isolation is enabled, otherwise just
	// add to the DOM global.
	let useContextBridge = process.argv.includes('--context-isolation');
	if (useContextBridge) {
		try {
			contextBridge.exposeInMainWorld('vscode', globals);
		} catch (error) {
			console.error(error);

			useContextBridge = false;
		}
	}

	if (!useContextBridge) {
		// @ts-ignore
		window.vscode = globals;
	}

	//#region Utilities

	/**
	 * @param {string} channel
	 * @returns {true | never}
	 */
	function validateIPC(channel) {
		if (!channel || !channel.startsWith('vscode:')) {
			throw new Error(`Unsupported event IPC channel '${channel}'`);
		}

		return true;
	}

	/**
	 * @param {string} type
	 * @returns {type is 'uncaughtException'}
	 */
	function validateProcessEventType(type) {
		if (type !== 'uncaughtException') {
			throw new Error(`Unsupported process event '${type}'`);
		}

		return true;
	}

	/** @type {Promise<typeof process.env> | undefined} */
	let shellEnv = undefined;

	/**
	 * If VSCode is not run from a terminal, we should resolve additional
	 * shell specific environment from the OS shell to ensure we are seeing
	 * all development related environment variables. We do this from the
	 * main process because it may involve spawning a shell.
	 *
	 * @param {{[key: string]: string}} userEnv
	 * @returns {Promise<void>}
	 */
	async function resolveEnv(userEnv) {
		if (!shellEnv) {

			// Apply `userEnv` directly
			Object.assign(process.env, userEnv);

			// Resolve `shellEnv` from the main side
			shellEnv = new Promise(function (resolve) {
				ipcRenderer.once('vscode:acceptShellEnv', function (event, shellEnvResult) {
					if (!process.env['VSCODE_SKIP_PROCESS_ENV_PATCHING'] /* TODO@bpasero for https://github.com/microsoft/vscode/issues/108804 */) {
						// Assign all keys of the shell environment to our process environment
						// But make sure that the user environment wins in the end over shell environment
						Object.assign(process.env, shellEnvResult, userEnv);
					}

					resolve({ ...process.env, ...shellEnvResult, ...userEnv });
				});

				ipcRenderer.send('vscode:fetchShellEnv');
			});
		}

		await shellEnv;
	}

	//#endregion
}());
