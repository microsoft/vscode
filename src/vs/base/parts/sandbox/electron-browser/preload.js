/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __assign = (this && this.__assign) || function () {
	__assign = Object.assign || function (t) {
		for (var s, i = 1, n = arguments.length; i < n; i++) {
			s = arguments[i];
			for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
				t[p] = s[p];
		}
		return t;
	};
	return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
	function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	return new (P || (P = Promise))(function (resolve, reject) {
		function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
		function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
		function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
};
var __generator = (this && this.__generator) || function (thisArg, body) {
	var _ = { label: 0, sent: function () { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
	return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
	function verb(n) { return function (v) { return step([n, v]); }; }
	function step(op) {
		if (f) throw new TypeError("Generator is already executing.");
		while (g && (g = 0, op[0] && (_ = 0)), _) try {
			if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
			if (y = 0, t) op = [op[0] & 2, t.value];
			switch (op[0]) {
				case 0: case 1: t = op; break;
				case 4: _.label++; return { value: op[1], done: false };
				case 5: _.label++; y = op[1]; op = [0]; continue;
				case 7: op = _.ops.pop(); _.trys.pop(); continue;
				default:
					if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
					if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
					if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
					if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
					if (t[2]) _.ops.pop();
					_.trys.pop(); continue;
			}
			op = body.call(thisArg, _);
		} catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
		if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
	}
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
	if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
		if (ar || !(i in from)) {
			if (!ar) ar = Array.prototype.slice.call(from, 0, i);
			ar[i] = from[i];
		}
	}
	return to.concat(ar || Array.prototype.slice.call(from));
};
/* eslint-disable no-restricted-globals */
(function () {
	var _this = this;
	var _a = require('electron'), ipcRenderer = _a.ipcRenderer, webFrame = _a.webFrame, contextBridge = _a.contextBridge, webUtils = _a.webUtils;
	//#region Utilities
	function validateIPC(channel) {
		if (!channel || !channel.startsWith('vscode:')) {
			throw new Error("Unsupported event IPC channel '".concat(channel, "'"));
		}
		return true;
	}
	function parseArgv(key) {
		for (var _i = 0, _a = process.argv; _i < _a.length; _i++) {
			var arg = _a[_i];
			if (arg.indexOf("--".concat(key, "=")) === 0) {
				return arg.split('=')[1];
			}
		}
		return undefined;
	}
	//#endregion
	//#region Resolve Configuration
	var configuration = undefined;
	var resolveConfiguration = (function () {
		return __awaiter(_this, void 0, void 0, function () {
			var windowConfigIpcChannel, resolvedConfiguration, error_1;
			var _a;
			return __generator(this, function (_b) {
				switch (_b.label) {
					case 0:
						windowConfigIpcChannel = parseArgv('vscode-window-config');
						if (!windowConfigIpcChannel) {
							throw new Error('Preload: did not find expected vscode-window-config in renderer process arguments list.');
						}
						_b.label = 1;
					case 1:
						_b.trys.push([1, 3, , 4]);
						validateIPC(windowConfigIpcChannel);
						return [4 /*yield*/, ipcRenderer.invoke(windowConfigIpcChannel)];
					case 2:
						resolvedConfiguration = configuration = _b.sent();
						// Apply `userEnv` directly
						Object.assign(process.env, resolvedConfiguration.userEnv);
						// Apply zoom level early before even building the
						// window DOM elements to avoid UI flicker. We always
						// have to set the zoom level from within the window
						// because Chrome has it's own way of remembering zoom
						// settings per origin (if vscode-file:// is used) and
						// we want to ensure that the user configuration wins.
						webFrame.setZoomLevel((_a = resolvedConfiguration.zoomLevel) !== null && _a !== void 0 ? _a : 0);
						return [2 /*return*/, resolvedConfiguration];
					case 3:
						error_1 = _b.sent();
						throw new Error("Preload: unable to fetch vscode-window-config: ".concat(error_1));
					case 4: return [2 /*return*/];
				}
			});
		});
	})();
	//#endregion
	//#region Resolve Shell Environment
	/**
	 * If VSCode is not run from a terminal, we should resolve additional
	 * shell specific environment from the OS shell to ensure we are seeing
	 * all development related environment variables. We do this from the
	 * main process because it may involve spawning a shell.
	 */
	var resolveShellEnv = (function () {
		return __awaiter(_this, void 0, void 0, function () {
			var _a, userEnv, shellEnv;
			var _this = this;
			return __generator(this, function (_b) {
				switch (_b.label) {
					case 0: return [4 /*yield*/, Promise.all([
						(function () {
							return __awaiter(_this, void 0, void 0, function () {
								return __generator(this, function (_a) {
									switch (_a.label) {
										case 0: return [4 /*yield*/, resolveConfiguration];
										case 1: return [2 /*return*/, (_a.sent()).userEnv];
									}
								});
							});
						})(),
						ipcRenderer.invoke('vscode:fetchShellEnv')
					])];
					case 1:
						_a = _b.sent(), userEnv = _a[0], shellEnv = _a[1];
						return [2 /*return*/, __assign(__assign(__assign({}, process.env), shellEnv), userEnv)];
				}
			});
		});
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
	var globals = {
		/**
		 * A minimal set of methods exposed from Electron's `ipcRenderer`
		 * to support communication to main process.
		 */
		ipcRenderer: {
			send: function (channel) {
				var args = [];
				for (var _i = 1; _i < arguments.length; _i++) {
					args[_i - 1] = arguments[_i];
				}
				if (validateIPC(channel)) {
					ipcRenderer.send.apply(ipcRenderer, __spreadArray([channel], args, false));
				}
			},
			invoke: function (channel) {
				var args = [];
				for (var _i = 1; _i < arguments.length; _i++) {
					args[_i - 1] = arguments[_i];
				}
				validateIPC(channel);
				return ipcRenderer.invoke.apply(ipcRenderer, __spreadArray([channel], args, false));
			},
			on: function (channel, listener) {
				validateIPC(channel);
				ipcRenderer.on(channel, listener);
				return this;
			},
			once: function (channel, listener) {
				validateIPC(channel);
				ipcRenderer.once(channel, listener);
				return this;
			},
			removeListener: function (channel, listener) {
				validateIPC(channel);
				ipcRenderer.removeListener(channel, listener);
				return this;
			}
		},
		ipcMessagePort: {
			acquire: function (responseChannel, nonce) {
				if (validateIPC(responseChannel)) {
					var responseListener_1 = function (e, responseNonce) {
						// validate that the nonce from the response is the same
						// as when requested. and if so, use `postMessage` to
						// send the `MessagePort` safely over, even when context
						// isolation is enabled
						if (nonce === responseNonce) {
							ipcRenderer.off(responseChannel, responseListener_1);
							window.postMessage(nonce, '*', e.ports);
						}
					};
					// handle reply from main
					ipcRenderer.on(responseChannel, responseListener_1);
				}
			}
		},
		/**
		 * Support for subset of methods of Electron's `webFrame` type.
		 */
		webFrame: {
			setZoomLevel: function (level) {
				if (typeof level === 'number') {
					webFrame.setZoomLevel(level);
				}
			}
		},
		/**
		 * Support for subset of Electron's `webUtils` type.
		 */
		webUtils: {
			getPathForFile: function (file) {
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
			get env() { return __assign({}, process.env); },
			get versions() { return process.versions; },
			get type() { return 'renderer'; },
			get execPath() { return process.execPath; },
			cwd: function () {
				return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
			},
			shellEnv: function () {
				return resolveShellEnv;
			},
			getProcessMemoryInfo: function () {
				return process.getProcessMemoryInfo();
			},
			on: function (type, callback) {
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
			configuration: function () {
				return configuration;
			},
			/**
			 * Allows to await the resolution of the configuration object.
			 */
			resolveConfiguration: function () {
				return __awaiter(this, void 0, void 0, function () {
					return __generator(this, function (_a) {
						return [2 /*return*/, resolveConfiguration];
					});
				});
			}
		}
	};
	try {
		// Use `contextBridge` APIs to expose globals to VSCode
		contextBridge.exposeInMainWorld('vscode', globals);
	}
	catch (error) {
		console.error(error);
	}
}());
