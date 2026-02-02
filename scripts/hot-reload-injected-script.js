/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
/// <reference path='debugger-scripts-api.d.ts' />

const path = require('path');
const fsPromise = require('fs/promises');
const parcelWatcher = require('@parcel/watcher');

// This file is loaded by the vscode-diagnostic-tools extension and injected into the debugger.

/** @type {RunFunction} */
module.exports.run = async function (debugSession) {
	const watcher = await DirWatcher.watchRecursively(path.join(__dirname, '../out/'));

	const sub = watcher.onDidChange(changes => {
		const supportedChanges = changes.filter(c => c.path.endsWith('.js') || c.path.endsWith('.css'));
		debugSession.evalJs(function (changes, debugSessionName) {
			// This function is stringified and injected into the debuggee.

			/** @type {{ count: number; originalWindowTitle: any; timeout: any; shouldReload: boolean }} */
			const hotReloadData = globalThis.$hotReloadData || (globalThis.$hotReloadData = { count: 0, messageHideTimeout: undefined, shouldReload: false });

			/**
			 * @param {string} path
			 * @param {string} newSrc
			 */
			function handleChange(path, newSrc) {
				const relativePath = path.replace(/\\/g, '/').split('/out/')[1];
				if (relativePath.endsWith('.css')) {
					handleCssChange(relativePath);
				} else if (relativePath.endsWith('.js')) {
					handleJsChange(relativePath, newSrc);
				}
			}

			/**
			 * @param {string} relativePath
			 */
			function handleCssChange(relativePath) {
				if (typeof document === 'undefined') {
					return;
				}

				const styleSheet = (/** @type {HTMLLinkElement[]} */ ([...document.querySelectorAll(`link[rel='stylesheet']`)]))
					.find(l => new URL(l.href, document.location.href).pathname.endsWith(relativePath));
				if (styleSheet) {
					setMessage(`reload ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					console.log(debugSessionName, 'css reloaded', relativePath);
					styleSheet.href = styleSheet.href.replace(/\?.*/, '') + '?' + Date.now();
				} else {
					setMessage(`could not reload ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					console.log(debugSessionName, 'ignoring css change, as stylesheet is not loaded', relativePath);
				}
			}

			/**
			 * @param {string} relativePath
			 * @param {string} newSrc
			 */
			function handleJsChange(relativePath, newSrc) {
				const moduleIdStr = trimEnd(relativePath, '.js');

				/** @type {any} */
				const requireFn = globalThis.require;
				const moduleManager = requireFn.moduleManager;
				if (!moduleManager) {
					console.log(debugSessionName, 'ignoring js change, as moduleManager is not available', relativePath);
					return;
				}

				const moduleId = moduleManager._moduleIdProvider.getModuleId(moduleIdStr);
				const oldModule = moduleManager._modules2[moduleId];

				if (!oldModule) {
					console.log(debugSessionName, 'ignoring js change, as module is not loaded', relativePath);
					return;
				}

				// Check if we can reload
				const g = /** @type {GlobalThisAddition} */ (globalThis);

				// A frozen copy of the previous exports
				const oldExports = Object.freeze({ ...oldModule.exports });
				const reloadFn = g.$hotReload_applyNewExports?.(oldExports);

				if (!reloadFn) {
					console.log(debugSessionName, 'ignoring js change, as module does not support hot-reload', relativePath);
					hotReloadData.shouldReload = true;
					setMessage(`hot reload not supported for ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					return;
				}

				const newScript = new Function('define', newSrc); // CodeQL [SM01632] This code is only executed during development. It is required for the hot-reload functionality.

				newScript(/* define */ function (deps, callback) {
					// Evaluating the new code was successful.

					// Redefine the module
					delete moduleManager._modules2[moduleId];
					moduleManager.defineModule(moduleIdStr, deps, callback);
					const newModule = moduleManager._modules2[moduleId];


					// Patch the exports of the old module, so that modules using the old module get the new exports
					Object.assign(oldModule.exports, newModule.exports);
					// We override the exports so that future reloads still patch the initial exports.
					newModule.exports = oldModule.exports;

					const successful = reloadFn(newModule.exports);
					if (!successful) {
						hotReloadData.shouldReload = true;
						setMessage(`hot reload failed ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
						console.log(debugSessionName, 'hot reload was not successful', relativePath);
						return;
					}

					console.log(debugSessionName, 'hot reloaded', moduleIdStr);
					setMessage(`successfully reloaded ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
				});
			}

			/**
			 * @param {string} message
			 */
			function setMessage(message) {
				const domElem = /** @type {HTMLDivElement | undefined} */ (document.querySelector('.titlebar-center .window-title'));
				if (!domElem) { return; }
				if (!hotReloadData.timeout) {
					hotReloadData.originalWindowTitle = domElem.innerText;
				} else {
					clearTimeout(hotReloadData.timeout);
				}
				if (hotReloadData.shouldReload) {
					message += ' (manual reload required)';
				}

				domElem.innerText = message;
				hotReloadData.timeout = setTimeout(() => {
					hotReloadData.timeout = undefined;
					// If wanted, we can restore the previous title message
					// domElem.replaceChildren(hotReloadData.originalWindowTitle);
				}, 5000);
			}

			/**
			 * @param {string} path
			 * @returns {string}
			 */
			function formatPath(path) {
				const parts = path.split('/');
				parts.reverse();
				let result = parts[0];
				parts.shift();
				for (const p of parts) {
					if (result.length + p.length > 40) {
						break;
					}
					result = p + '/' + result;
					if (result.length > 20) {
						break;
					}
				}
				return result;
			}

			function trimEnd(str, suffix) {
				if (str.endsWith(suffix)) {
					return str.substring(0, str.length - suffix.length);
				}
				return str;
			}

			for (const change of changes) {
				handleChange(change.path, change.newContent);
			}

		}, supportedChanges, debugSession.name.substring(0, 25));
	});

	return {
		dispose() {
			sub.dispose();
			watcher.dispose();
		}
	};
};

class DirWatcher {
	/**
	 *
	 * @param {string} dir
	 * @returns {Promise<DirWatcher>}
	 */
	static async watchRecursively(dir) {
		/** @type {((changes: { path: string, newContent: string }[]) => void)[]} */
		const listeners = [];
		/** @type {Map<string, string> } */
		const fileContents = new Map();
		/** @type {Map<string, { path: string, newContent: string }>} */
		const changes = new Map();
		/** @type {(handler: (changes: { path: string, newContent: string }[]) => void) => IDisposable} */
		const event = (handler) => {
			listeners.push(handler);
			return {
				dispose: () => {
					const idx = listeners.indexOf(handler);
					if (idx >= 0) {
						listeners.splice(idx, 1);
					}
				}
			};
		};
		const r = parcelWatcher.subscribe(dir, async (err, events) => {
			for (const e of events) {
				if (e.type === 'update') {
					const newContent = await fsPromise.readFile(e.path, 'utf8');
					if (fileContents.get(e.path) !== newContent) {
						fileContents.set(e.path, newContent);
						changes.set(e.path, { path: e.path, newContent });
					}
				}
			}
			if (changes.size > 0) {
				debounce(() => {
					const uniqueChanges = Array.from(changes.values());
					changes.clear();
					listeners.forEach(l => l(uniqueChanges));
				})();
			}
		});
		const result = await r;
		return new DirWatcher(event, () => result.unsubscribe());
	}

	/**
	 * @param {(handler: (changes: { path: string, newContent: string }[]) => void) => IDisposable} onDidChange
	 * @param {() => void} unsub
	 */
	constructor(onDidChange, unsub) {
		this.onDidChange = onDidChange;
		this.unsub = unsub;
	}

	dispose() {
		this.unsub();
	}
}

/**
 * Debounce function calls
 * @param {() => void} fn
 * @param {number} delay
 */
function debounce(fn, delay = 50) {
	let timeoutId;
	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			fn.apply(this, args);
		}, delay);
	};
}

