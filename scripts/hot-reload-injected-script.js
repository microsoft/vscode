/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
/// <reference path='../src/vscode-dts/vscode.d.ts' />
/// <reference path='debugger-scripts-api.d.ts' />

const path = require('path');
const fsPromise = require('fs/promises');
const parcelWatcher = require('@parcel/watcher');

// This file is loaded by the vscode-diagnostic-tools extension and injected into the debugger.


/**
 * Represents a lazy evaluation container.
 * @template T
 * @template TArg
 */
class Lazy {
	/**
	 * Creates a new instance of the Lazy class.
	 * @param {(arg: TArg) => T} _fn - The function to be lazily evaluated.
	 */
	constructor(_fn) {
		this._fn = _fn;
		this._value = undefined;
	}

	/**
	 * Gets the lazily evaluated value.
	 * @param {TArg} arg - The argument passed in to the evaluation function.
	 * @return {T}
	 */
	getValue(arg) {
		if (!this._value) {
			this._value = this._fn(arg);
		}
		return this._value;
	}
}

/**
 * @param {Context['vscode']} vscode
 */
function setupGlobals(vscode) {
	/** @type {DisposableStore} */
	const store = globalThis['hot-reload-injected-script-disposables'] ?? (globalThis['hot-reload-injected-script-disposables'] = new DisposableStore());
	store.clear();

	function getConfig() {
		const config = vscode.workspace.getConfiguration('vscode-diagnostic-tools').get('debuggerScriptsConfig', {
			'hotReload.sources': {}
		});
		if (!config['hotReload.sources']) {
			config['hotReload.sources'] = {};
		}
		return config;
	}

	/**
	 * @type {Map<string, Set<() => void>>}
	 */
	const enabledRelativePaths = new Map();
	const api = {
		/**
		 * @param {string} relativePath
		 * @param {() => void} forceReloadFn
		 */
		reloadFailed: (relativePath, forceReloadFn) => {
			const set = enabledRelativePaths.get(relativePath) ?? new Set();
			set.add(forceReloadFn);
			enabledRelativePaths.set(relativePath, set);

			update();
		},

		/**
		 * @param {string} relativePath
		 * @returns {HotReloadConfig}
		 */
		getConfig: (relativePath) => {
			const config = getConfig();
			return { mode: config['hotReload.sources'][relativePath] === 'patch-prototype' ? 'patch-prototype' : undefined };
		}
	};

	const item = store.add(vscode.window.createStatusBarItem(undefined, 10000));

	function update() {
		item.hide();
		const e = vscode.window.activeTextEditor;
		if (!e) { return; }

		const part = e.document.fileName.replace(/\\/g, '/').replace(/\.ts/, '.js').split('/src/')[1];
		if (!part) { return; }

		const isEnabled = api.getConfig(part)?.mode === 'patch-prototype';

		if (!enabledRelativePaths.has(part) && !isEnabled) {
			return;
		}

		if (!isEnabled) {
			item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			item.text = '$(sync-ignored) hot reload disabled';
		} else {
			item.backgroundColor = undefined;
			item.text = '$(sync) hot reload enabled';
		}

		item.command = {
			command: 'vscode-diagnostic-tools.hotReload.toggle',
			title: 'Toggle hot reload',
			arguments: [part],
			tooltip: 'Toggle hot reload'
		};
		item.tooltip = 'Toggle hot reload';
		item.show();
	}

	store.add(vscode.window.onDidChangeActiveTextEditor(e => {
		update();
	}));

	store.add(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('vscode-diagnostic-tools.debuggerScriptsConfig')) {
			update();
		}
	}));

	update();

	store.add(vscode.commands.registerCommand('vscode-diagnostic-tools.hotReload.toggle', async (relativePath) => {
		let config = getConfig();
		const current = config['hotReload.sources'][relativePath];
		const newValue = current === 'patch-prototype' ? undefined : 'patch-prototype';
		config = { ...config, 'hotReload.sources': { ...config['hotReload.sources'], [relativePath]: newValue } };

		await vscode.workspace.getConfiguration('vscode-diagnostic-tools').update('debuggerScriptsConfig', config, vscode.ConfigurationTarget.Global);

		if (newValue === 'patch-prototype') {
			const reloadFns = enabledRelativePaths.get(relativePath);
			console.log(reloadFns);
			if (reloadFns) {
				for (const fn of reloadFns) {
					fn();
				}
			}
		}
	}));

	return api;
}

const g = new Lazy(setupGlobals);

/** @type {RunFunction} */
module.exports.run = async function (debugSession, ctx) {
	const store = new DisposableStore();

	const global = ctx.vscode ? g.getValue(ctx.vscode) : undefined;

	const watcher = store.add(await DirWatcher.watchRecursively(path.join(__dirname, '../out/')));

	/**
	 * So that the same file always gets the same reload fn.
	 * @type {Map<string, () => void>}
	 */
	const reloadFns = new Map();

	store.add(watcher.onDidChange(async changes => {
		const supportedChanges = changes
			.filter(c => c.path.endsWith('.js') || c.path.endsWith('.css'))
			.map(c => {
				const relativePath = c.path.replace(/\\/g, '/').split('/out/')[1];
				return { ...c, relativePath, config: global?.getConfig(relativePath) };
			});

		const result = await debugSession.evalJs(function (changes, debugSessionName) {
			// This function is stringified and injected into the debuggee.

			/** @type {{ count: number; originalWindowTitle: any; timeout: any; shouldReload: boolean }} */
			const hotReloadData = globalThis.$hotReloadData || (globalThis.$hotReloadData = { count: 0, messageHideTimeout: undefined, shouldReload: false });

			/** @type {{ relativePath: string, path: string }[]} */
			const reloadFailedJsFiles = [];

			for (const change of changes) {
				handleChange(change.relativePath, change.path, change.newContent, change.config);
			}

			return { reloadFailedJsFiles };

			/**
			 * @param {string} relativePath
			 * @param {string} path
			 * @param {string} newSrc
			 * @param {HotReloadConfig | undefined} config
			 */
			function handleChange(relativePath, path, newSrc, config) {
				if (relativePath.endsWith('.css')) {
					handleCssChange(relativePath);
				} else if (relativePath.endsWith('.js')) {
					handleJsChange(relativePath, path, newSrc, config);
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
			 * @param {HotReloadConfig | undefined} config
			 */
			function handleJsChange(relativePath, path, newSrc, config) {
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
				const reloadFn = g.$hotReload_applyNewExports?.({ oldExports, newSrc, config });

				if (!reloadFn) {
					console.log(debugSessionName, 'ignoring js change, as module does not support hot-reload', relativePath);
					hotReloadData.shouldReload = true;

					reloadFailedJsFiles.push({ relativePath, path });

					setMessage(`hot reload not supported for ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					return;
				}

				// Eval maintains source maps
				function newScript(/* this parameter is used by newSrc */ define) {
					// eslint-disable-next-line no-eval
					eval(newSrc); // CodeQL [SM01632] This code is only executed during development. It is required for the hot-reload functionality.
				}

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

		}, supportedChanges, debugSession.name.substring(0, 25));

		for (const failedFile of result.reloadFailedJsFiles) {
			const reloadFn = reloadFns.get(failedFile.relativePath) ?? (() => {
				console.log('force change');
				watcher.forceChange(failedFile.path);
			});
			reloadFns.set(failedFile.relativePath, reloadFn);
			global?.reloadFailed(failedFile.relativePath, reloadFn);
		}
	}));

	return store;
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
		return new DirWatcher(event, () => result.unsubscribe(), path => {
			const content = fileContents.get(path);
			if (content !== undefined) {
				listeners.forEach(l => l([{ path: path, newContent: content }]));
			}
		});
	}

	/**
	 * @param {(handler: (changes: { path: string, newContent: string }[]) => void) => IDisposable} onDidChange
	 * @param {() => void} unsub
	 * @param {(path: string) => void} forceChange
	 */
	constructor(onDidChange, unsub, forceChange) {
		this.onDidChange = onDidChange;
		this.unsub = unsub;
		this.forceChange = forceChange;
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

class DisposableStore {
	constructor() {
		this._toDispose = new Set();
		this._isDisposed = false;
	}


	/**
	 * Adds an item to the collection.
	 *
	 * @template T
	 * @param {T} t - The item to add.
	 * @returns {T} The added item.
	 */
	add(t) {
		this._toDispose.add(t);
		return t;
	}
	dispose() {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this.clear();
	}
	clear() {
		this._toDispose.forEach(item => item.dispose());
		this._toDispose.clear();
	}
}
