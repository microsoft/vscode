/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 * Please make sure to make edits in the .ts file at https://github.com/microsoft/vscode-loader/
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *--------------------------------------------------------------------------------------------*/
const _amdLoaderGlobal = this;
const _commonjsGlobal = typeof global === 'object' ? global : {};
var AMDLoader;
(function (AMDLoader) {
	AMDLoader.global = _amdLoaderGlobal;
	class Environment {
		get isWindows() {
			this._detect();
			return this._isWindows;
		}
		get isNode() {
			this._detect();
			return this._isNode;
		}
		get isElectronRenderer() {
			this._detect();
			return this._isElectronRenderer;
		}
		get isWebWorker() {
			this._detect();
			return this._isWebWorker;
		}
		get isElectronNodeIntegrationWebWorker() {
			this._detect();
			return this._isElectronNodeIntegrationWebWorker;
		}
		constructor() {
			this._detected = false;
			this._isWindows = false;
			this._isNode = false;
			this._isElectronRenderer = false;
			this._isWebWorker = false;
			this._isElectronNodeIntegrationWebWorker = false;
		}
		_detect() {
			if (this._detected) {
				return;
			}
			this._detected = true;
			this._isWindows = Environment._isWindows();
			this._isNode = (typeof module !== 'undefined' && !!module.exports);
			this._isElectronRenderer = (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions.electron !== 'undefined' && process.type === 'renderer');
			this._isWebWorker = (typeof AMDLoader.global.importScripts === 'function');
			this._isElectronNodeIntegrationWebWorker = this._isWebWorker && (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions.electron !== 'undefined' && process.type === 'worker');
		}
		static _isWindows() {
			if (typeof navigator !== 'undefined') {
				if (navigator.userAgent && navigator.userAgent.indexOf('Windows') >= 0) {
					return true;
				}
			}
			if (typeof process !== 'undefined') {
				return (process.platform === 'win32');
			}
			return false;
		}
	}
	AMDLoader.Environment = Environment;
})(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
(function (AMDLoader) {
	class LoaderEvent {
		constructor(type, detail, timestamp) {
			this.type = type;
			this.detail = detail;
			this.timestamp = timestamp;
		}
	}
	AMDLoader.LoaderEvent = LoaderEvent;
	class LoaderEventRecorder {
		constructor(loaderAvailableTimestamp) {
			this._events = [new LoaderEvent(1 /* LoaderEventType.LoaderAvailable */, '', loaderAvailableTimestamp)];
		}
		record(type, detail) {
			this._events.push(new LoaderEvent(type, detail, AMDLoader.Utilities.getHighPerformanceTimestamp()));
		}
		getEvents() {
			return this._events;
		}
	}
	AMDLoader.LoaderEventRecorder = LoaderEventRecorder;
	class NullLoaderEventRecorder {
		record(type, detail) {
			// Nothing to do
		}
		getEvents() {
			return [];
		}
	}
	NullLoaderEventRecorder.INSTANCE = new NullLoaderEventRecorder();
	AMDLoader.NullLoaderEventRecorder = NullLoaderEventRecorder;
})(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
(function (AMDLoader) {
	class Utilities {
		/**
		 * This method does not take care of / vs \
		 */
		static fileUriToFilePath(isWindows, uri) {
			uri = decodeURI(uri).replace(/%23/g, '#');
			if (isWindows) {
				if (/^file:\/\/\//.test(uri)) {
					// This is a URI without a hostname => return only the path segment
					return uri.substr(8);
				}
				if (/^file:\/\//.test(uri)) {
					return uri.substr(5);
				}
			}
			else {
				if (/^file:\/\//.test(uri)) {
					return uri.substr(7);
				}
			}
			// Not sure...
			return uri;
		}
		static startsWith(haystack, needle) {
			return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
		}
		static endsWith(haystack, needle) {
			return haystack.length >= needle.length && haystack.substr(haystack.length - needle.length) === needle;
		}
		// only check for "?" before "#" to ensure that there is a real Query-String
		static containsQueryString(url) {
			return /^[^\#]*\?/gi.test(url);
		}
		/**
		 * Does `url` start with http:// or https:// or file:// or / ?
		 */
		static isAbsolutePath(url) {
			return /^((http:\/\/)|(https:\/\/)|(file:\/\/)|(\/))/.test(url);
		}
		static forEachProperty(obj, callback) {
			if (obj) {
				let key;
				for (key in obj) {
					if (obj.hasOwnProperty(key)) {
						callback(key, obj[key]);
					}
				}
			}
		}
		static isEmpty(obj) {
			let isEmpty = true;
			Utilities.forEachProperty(obj, () => {
				isEmpty = false;
			});
			return isEmpty;
		}
		static recursiveClone(obj) {
			if (!obj || typeof obj !== 'object' || obj instanceof RegExp) {
				return obj;
			}
			if (!Array.isArray(obj) && Object.getPrototypeOf(obj) !== Object.prototype) {
				// only clone "simple" objects
				return obj;
			}
			let result = Array.isArray(obj) ? [] : {};
			Utilities.forEachProperty(obj, (key, value) => {
				if (value && typeof value === 'object') {
					result[key] = Utilities.recursiveClone(value);
				}
				else {
					result[key] = value;
				}
			});
			return result;
		}
		static generateAnonymousModule() {
			return '===anonymous' + (Utilities.NEXT_ANONYMOUS_ID++) + '===';
		}
		static isAnonymousModule(id) {
			return Utilities.startsWith(id, '===anonymous');
		}
		static getHighPerformanceTimestamp() {
			if (!this.PERFORMANCE_NOW_PROBED) {
				this.PERFORMANCE_NOW_PROBED = true;
				this.HAS_PERFORMANCE_NOW = (AMDLoader.global.performance && typeof AMDLoader.global.performance.now === 'function');
			}
			return (this.HAS_PERFORMANCE_NOW ? AMDLoader.global.performance.now() : Date.now());
		}
	}
	Utilities.NEXT_ANONYMOUS_ID = 1;
	Utilities.PERFORMANCE_NOW_PROBED = false;
	Utilities.HAS_PERFORMANCE_NOW = false;
	AMDLoader.Utilities = Utilities;
})(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
(function (AMDLoader) {
	function ensureError(err) {
		if (err instanceof Error) {
			return err;
		}
		const result = new Error(err.message || String(err) || 'Unknown Error');
		if (err.stack) {
			result.stack = err.stack;
		}
		return result;
	}
	AMDLoader.ensureError = ensureError;
	;
	class ConfigurationOptionsUtil {
		/**
		 * Ensure configuration options make sense
		 */
		static validateConfigurationOptions(options) {
			function defaultOnError(err) {
				if (err.phase === 'loading') {
					console.error('Loading "' + err.moduleId + '" failed');
					console.error(err);
					console.error('Here are the modules that depend on it:');
					console.error(err.neededBy);
					return;
				}
				if (err.phase === 'factory') {
					console.error('The factory function of "' + err.moduleId + '" has thrown an exception');
					console.error(err);
					console.error('Here are the modules that depend on it:');
					console.error(err.neededBy);
					return;
				}
			}
			options = options || {};
			if (typeof options.baseUrl !== 'string') {
				options.baseUrl = '';
			}
			if (typeof options.isBuild !== 'boolean') {
				options.isBuild = false;
			}
			if (typeof options.paths !== 'object') {
				options.paths = {};
			}
			if (typeof options.config !== 'object') {
				options.config = {};
			}
			if (typeof options.catchError === 'undefined') {
				options.catchError = false;
			}
			if (typeof options.recordStats === 'undefined') {
				options.recordStats = false;
			}
			if (typeof options.urlArgs !== 'string') {
				options.urlArgs = '';
			}
			if (typeof options.onError !== 'function') {
				options.onError = defaultOnError;
			}
			if (!Array.isArray(options.ignoreDuplicateModules)) {
				options.ignoreDuplicateModules = [];
			}
			if (options.baseUrl.length > 0) {
				if (!AMDLoader.Utilities.endsWith(options.baseUrl, '/')) {
					options.baseUrl += '/';
				}
			}
			if (typeof options.cspNonce !== 'string') {
				options.cspNonce = '';
			}
			if (typeof options.preferScriptTags === 'undefined') {
				options.preferScriptTags = false;
			}
			if (options.nodeCachedData && typeof options.nodeCachedData === 'object') {
				if (typeof options.nodeCachedData.seed !== 'string') {
					options.nodeCachedData.seed = 'seed';
				}
				if (typeof options.nodeCachedData.writeDelay !== 'number' || options.nodeCachedData.writeDelay < 0) {
					options.nodeCachedData.writeDelay = 1000 * 7;
				}
				if (!options.nodeCachedData.path || typeof options.nodeCachedData.path !== 'string') {
					const err = ensureError(new Error('INVALID cached data configuration, \'path\' MUST be set'));
					err.phase = 'configuration';
					options.onError(err);
					options.nodeCachedData = undefined;
				}
			}
			return options;
		}
		static mergeConfigurationOptions(overwrite = null, base = null) {
			let result = AMDLoader.Utilities.recursiveClone(base || {});
			// Merge known properties and overwrite the unknown ones
			AMDLoader.Utilities.forEachProperty(overwrite, (key, value) => {
				if (key === 'ignoreDuplicateModules' && typeof result.ignoreDuplicateModules !== 'undefined') {
					result.ignoreDuplicateModules = result.ignoreDuplicateModules.concat(value);
				}
				else if (key === 'paths' && typeof result.paths !== 'undefined') {
					AMDLoader.Utilities.forEachProperty(value, (key2, value2) => result.paths[key2] = value2);
				}
				else if (key === 'config' && typeof result.config !== 'undefined') {
					AMDLoader.Utilities.forEachProperty(value, (key2, value2) => result.config[key2] = value2);
				}
				else {
					result[key] = AMDLoader.Utilities.recursiveClone(value);
				}
			});
			return ConfigurationOptionsUtil.validateConfigurationOptions(result);
		}
	}
	AMDLoader.ConfigurationOptionsUtil = ConfigurationOptionsUtil;
	class Configuration {
		constructor(env, options) {
			this._env = env;
			this.options = ConfigurationOptionsUtil.mergeConfigurationOptions(options);
			this._createIgnoreDuplicateModulesMap();
			this._createSortedPathsRules();
			if (this.options.baseUrl === '') {
				if (this.options.nodeRequire && this.options.nodeRequire.main && this.options.nodeRequire.main.filename && this._env.isNode) {
					let nodeMain = this.options.nodeRequire.main.filename;
					let dirnameIndex = Math.max(nodeMain.lastIndexOf('/'), nodeMain.lastIndexOf('\\'));
					this.options.baseUrl = nodeMain.substring(0, dirnameIndex + 1);
				}
			}
		}
		_createIgnoreDuplicateModulesMap() {
			// Build a map out of the ignoreDuplicateModules array
			this.ignoreDuplicateModulesMap = {};
			for (let i = 0; i < this.options.ignoreDuplicateModules.length; i++) {
				this.ignoreDuplicateModulesMap[this.options.ignoreDuplicateModules[i]] = true;
			}
		}
		_createSortedPathsRules() {
			// Create an array our of the paths rules, sorted descending by length to
			// result in a more specific -> less specific order
			this.sortedPathsRules = [];
			AMDLoader.Utilities.forEachProperty(this.options.paths, (from, to) => {
				if (!Array.isArray(to)) {
					this.sortedPathsRules.push({
						from: from,
						to: [to]
					});
				}
				else {
					this.sortedPathsRules.push({
						from: from,
						to: to
					});
				}
			});
			this.sortedPathsRules.sort((a, b) => {
				return b.from.length - a.from.length;
			});
		}
		/**
		 * Clone current configuration and overwrite options selectively.
		 * @param options The selective options to overwrite with.
		 * @result A new configuration
		 */
		cloneAndMerge(options) {
			return new Configuration(this._env, ConfigurationOptionsUtil.mergeConfigurationOptions(options, this.options));
		}
		/**
		 * Get current options bag. Useful for passing it forward to plugins.
		 */
		getOptionsLiteral() {
			return this.options;
		}
		_applyPaths(moduleId) {
			let pathRule;
			for (let i = 0, len = this.sortedPathsRules.length; i < len; i++) {
				pathRule = this.sortedPathsRules[i];
				if (AMDLoader.Utilities.startsWith(moduleId, pathRule.from)) {
					let result = [];
					for (let j = 0, lenJ = pathRule.to.length; j < lenJ; j++) {
						result.push(pathRule.to[j] + moduleId.substr(pathRule.from.length));
					}
					return result;
				}
			}
			return [moduleId];
		}
		_addUrlArgsToUrl(url) {
			if (AMDLoader.Utilities.containsQueryString(url)) {
				return url + '&' + this.options.urlArgs;
			}
			else {
				return url + '?' + this.options.urlArgs;
			}
		}
		_addUrlArgsIfNecessaryToUrl(url) {
			if (this.options.urlArgs) {
				return this._addUrlArgsToUrl(url);
			}
			return url;
		}
		_addUrlArgsIfNecessaryToUrls(urls) {
			if (this.options.urlArgs) {
				for (let i = 0, len = urls.length; i < len; i++) {
					urls[i] = this._addUrlArgsToUrl(urls[i]);
				}
			}
			return urls;
		}
		/**
		 * Transform a module id to a location. Appends .js to module ids
		 */
		moduleIdToPaths(moduleId) {
			if (this._env.isNode) {
				const isNodeModule = (this.options.amdModulesPattern instanceof RegExp
					&& !this.options.amdModulesPattern.test(moduleId));
				if (isNodeModule) {
					// This is a node module...
					if (this.isBuild()) {
						// ...and we are at build time, drop it
						return ['empty:'];
					}
					else {
						// ...and at runtime we create a `shortcut`-path
						return ['node|' + moduleId];
					}
				}
			}
			let result = moduleId;
			let results;
			if (!AMDLoader.Utilities.endsWith(result, '.js') && !AMDLoader.Utilities.isAbsolutePath(result)) {
				results = this._applyPaths(result);
				for (let i = 0, len = results.length; i < len; i++) {
					if (this.isBuild() && results[i] === 'empty:') {
						continue;
					}
					if (!AMDLoader.Utilities.isAbsolutePath(results[i])) {
						results[i] = this.options.baseUrl + results[i];
					}
					if (!AMDLoader.Utilities.endsWith(results[i], '.js') && !AMDLoader.Utilities.containsQueryString(results[i])) {
						results[i] = results[i] + '.js';
					}
				}
			}
			else {
				if (!AMDLoader.Utilities.endsWith(result, '.js') && !AMDLoader.Utilities.containsQueryString(result)) {
					result = result + '.js';
				}
				results = [result];
			}
			return this._addUrlArgsIfNecessaryToUrls(results);
		}
		/**
		 * Transform a module id or url to a location.
		 */
		requireToUrl(url) {
			let result = url;
			if (!AMDLoader.Utilities.isAbsolutePath(result)) {
				result = this._applyPaths(result)[0];
				if (!AMDLoader.Utilities.isAbsolutePath(result)) {
					result = this.options.baseUrl + result;
				}
			}
			return this._addUrlArgsIfNecessaryToUrl(result);
		}
		/**
		 * Flag to indicate if current execution is as part of a build.
		 */
		isBuild() {
			return this.options.isBuild;
		}
		shouldInvokeFactory(strModuleId) {
			if (!this.options.isBuild) {
				// outside of a build, all factories should be invoked
				return true;
			}
			// during a build, only explicitly marked or anonymous modules get their factories invoked
			if (AMDLoader.Utilities.isAnonymousModule(strModuleId)) {
				return true;
			}
			if (this.options.buildForceInvokeFactory && this.options.buildForceInvokeFactory[strModuleId]) {
				return true;
			}
			return false;
		}
		/**
		 * Test if module `moduleId` is expected to be defined multiple times
		 */
		isDuplicateMessageIgnoredFor(moduleId) {
			return this.ignoreDuplicateModulesMap.hasOwnProperty(moduleId);
		}
		/**
		 * Get the configuration settings for the provided module id
		 */
		getConfigForModule(moduleId) {
			if (this.options.config) {
				return this.options.config[moduleId];
			}
		}
		/**
		 * Should errors be caught when executing module factories?
		 */
		shouldCatchError() {
			return this.options.catchError;
		}
		/**
		 * Should statistics be recorded?
		 */
		shouldRecordStats() {
			return this.options.recordStats;
		}
		/**
		 * Forward an error to the error handler.
		 */
		onError(err) {
			this.options.onError(err);
		}
	}
	AMDLoader.Configuration = Configuration;
})(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
(function (AMDLoader) {
	/**
	 * Load `scriptSrc` only once (avoid multiple <script> tags)
	 */
	class OnlyOnceScriptLoader {
		constructor(env) {
			this._env = env;
			this._scriptLoader = null;
			this._callbackMap = {};
		}
		load(moduleManager, scriptSrc, callback, errorback) {
			if (!this._scriptLoader) {
				if (this._env.isWebWorker) {
					this._scriptLoader = new WorkerScriptLoader();
				}
				else if (this._env.isElectronRenderer) {
					const { preferScriptTags } = moduleManager.getConfig().getOptionsLiteral();
					if (preferScriptTags) {
						this._scriptLoader = new BrowserScriptLoader();
					}
					else {
						this._scriptLoader = new NodeScriptLoader(this._env);
					}
				}
				else if (this._env.isNode) {
					this._scriptLoader = new NodeScriptLoader(this._env);
				}
				else {
					this._scriptLoader = new BrowserScriptLoader();
				}
			}
			let scriptCallbacks = {
				callback: callback,
				errorback: errorback
			};
			if (this._callbackMap.hasOwnProperty(scriptSrc)) {
				this._callbackMap[scriptSrc].push(scriptCallbacks);
				return;
			}
			this._callbackMap[scriptSrc] = [scriptCallbacks];
			this._scriptLoader.load(moduleManager, scriptSrc, () => this.triggerCallback(scriptSrc), (err) => this.triggerErrorback(scriptSrc, err));
		}
		triggerCallback(scriptSrc) {
			let scriptCallbacks = this._callbackMap[scriptSrc];
			delete this._callbackMap[scriptSrc];
			for (let i = 0; i < scriptCallbacks.length; i++) {
				scriptCallbacks[i].callback();
			}
		}
		triggerErrorback(scriptSrc, err) {
			let scriptCallbacks = this._callbackMap[scriptSrc];
			delete this._callbackMap[scriptSrc];
			for (let i = 0; i < scriptCallbacks.length; i++) {
				scriptCallbacks[i].errorback(err);
			}
		}
	}
	class BrowserScriptLoader {
		/**
		 * Attach load / error listeners to a script element and remove them when either one has fired.
		 * Implemented for browsers supporting HTML5 standard 'load' and 'error' events.
		 */
		attachListeners(script, callback, errorback) {
			let unbind = () => {
				script.removeEventListener('load', loadEventListener);
				script.removeEventListener('error', errorEventListener);
			};
			let loadEventListener = (e) => {
				unbind();
				callback();
			};
			let errorEventListener = (e) => {
				unbind();
				errorback(e);
			};
			script.addEventListener('load', loadEventListener);
			script.addEventListener('error', errorEventListener);
		}
		load(moduleManager, scriptSrc, callback, errorback) {
			if (/^node\|/.test(scriptSrc)) {
				let opts = moduleManager.getConfig().getOptionsLiteral();
				let nodeRequire = ensureRecordedNodeRequire(moduleManager.getRecorder(), (opts.nodeRequire || AMDLoader.global.nodeRequire));
				let pieces = scriptSrc.split('|');
				let moduleExports = null;
				try {
					moduleExports = nodeRequire(pieces[1]);
				}
				catch (err) {
					errorback(err);
					return;
				}
				moduleManager.enqueueDefineAnonymousModule([], () => moduleExports);
				callback();
			}
			else {
				let script = document.createElement('script');
				script.setAttribute('async', 'async');
				script.setAttribute('type', 'text/javascript');
				this.attachListeners(script, callback, errorback);
				const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiteral();
				if (trustedTypesPolicy) {
					scriptSrc = trustedTypesPolicy.createScriptURL(scriptSrc);
				}
				script.setAttribute('src', scriptSrc);
				// Propagate CSP nonce to dynamically created script tag.
				const { cspNonce } = moduleManager.getConfig().getOptionsLiteral();
				if (cspNonce) {
					script.setAttribute('nonce', cspNonce);
				}
				document.getElementsByTagName('head')[0].appendChild(script);
			}
		}
	}
	function canUseEval(moduleManager) {
		const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiteral();
		try {
			const func = (trustedTypesPolicy
				? self.eval(trustedTypesPolicy.createScript('', 'true')) // CodeQL [SM01632] the loader is responsible with loading code, fetch + eval is used on the web worker instead of importScripts if possible because importScripts is synchronous and we observed deadlocks on Safari
				: new Function('true') // CodeQL [SM01632] the loader is responsible with loading code, fetch + eval is used on the web worker instead of importScripts if possible because importScripts is synchronous and we observed deadlocks on Safari
			);
			func.call(self);
			return true;
		}
		catch (err) {
			return false;
		}
	}
	class WorkerScriptLoader {
		constructor() {
			this._cachedCanUseEval = null;
		}
		_canUseEval(moduleManager) {
			if (this._cachedCanUseEval === null) {
				this._cachedCanUseEval = canUseEval(moduleManager);
			}
			return this._cachedCanUseEval;
		}
		load(moduleManager, scriptSrc, callback, errorback) {
			if (/^node\|/.test(scriptSrc)) {
				const opts = moduleManager.getConfig().getOptionsLiteral();
				const nodeRequire = ensureRecordedNodeRequire(moduleManager.getRecorder(), (opts.nodeRequire || AMDLoader.global.nodeRequire));
				const pieces = scriptSrc.split('|');
				let moduleExports = null;
				try {
					moduleExports = nodeRequire(pieces[1]);
				}
				catch (err) {
					errorback(err);
					return;
				}
				moduleManager.enqueueDefineAnonymousModule([], function () { return moduleExports; });
				callback();
			}
			else {
				const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiteral();
				const isCrossOrigin = (/^((http:)|(https:)|(file:))/.test(scriptSrc) && scriptSrc.substring(0, self.origin.length) !== self.origin);
				if (!isCrossOrigin && this._canUseEval(moduleManager)) {
					// use `fetch` if possible because `importScripts`
					// is synchronous and can lead to deadlocks on Safari
					fetch(scriptSrc).then((response) => {
						if (response.status !== 200) {
							throw new Error(response.statusText);
						}
						return response.text();
					}).then((text) => {
						text = `${text}\n//# sourceURL=${scriptSrc}`;
						const func = (trustedTypesPolicy
							? self.eval(trustedTypesPolicy.createScript('', text))
							: new Function(text) // CodeQL [SM01632] the loader is responsible with loading code, fetch + eval is used on the web worker instead of importScripts if possible because importScripts is synchronous and we observed deadlocks on Safari
						);
						func.call(self);
						callback();
					}).then(undefined, errorback);
					return;
				}
				try {
					if (trustedTypesPolicy) {
						scriptSrc = trustedTypesPolicy.createScriptURL(scriptSrc);
					}
					importScripts(scriptSrc);
					callback();
				}
				catch (e) {
					errorback(e);
				}
			}
		}
	}
	class NodeScriptLoader {
		constructor(env) {
			this._env = env;
			this._didInitialize = false;
			this._didPatchNodeRequire = false;
		}
		_init(nodeRequire) {
			if (this._didInitialize) {
				return;
			}
			this._didInitialize = true;
			// capture node modules
			this._fs = nodeRequire('fs');
			this._vm = nodeRequire('vm');
			this._path = nodeRequire('path');
			this._crypto = nodeRequire('crypto');
		}
		// patch require-function of nodejs such that we can manually create a script
		// from cached data. this is done by overriding the `Module._compile` function
		_initNodeRequire(nodeRequire, moduleManager) {
			// It is important to check for `nodeCachedData` first and then set `_didPatchNodeRequire`.
			// That's because `nodeCachedData` is set _after_ calling this for the first time...
			const { nodeCachedData } = moduleManager.getConfig().getOptionsLiteral();
			if (!nodeCachedData) {
				return;
			}
			if (this._didPatchNodeRequire) {
				return;
			}
			this._didPatchNodeRequire = true;
			const that = this;
			const Module = nodeRequire('module');
			function makeRequireFunction(mod) {
				const Module = mod.constructor;
				let require = function require(path) {
					try {
						return mod.require(path);
					}
					finally {
						// nothing
					}
				};
				require.resolve = function resolve(request, options) {
					return Module._resolveFilename(request, mod, false, options);
				};
				require.resolve.paths = function paths(request) {
					return Module._resolveLookupPaths(request, mod);
				};
				require.main = process.mainModule;
				require.extensions = Module._extensions;
				require.cache = Module._cache;
				return require;
			}
			Module.prototype._compile = function (content, filename) {
				// remove shebang and create wrapper function
				const scriptSource = Module.wrap(content.replace(/^#!.*/, ''));
				// create script
				const recorder = moduleManager.getRecorder();
				const cachedDataPath = that._getCachedDataPath(nodeCachedData, filename);
				const options = { filename };
				let hashData;
				try {
					const data = that._fs.readFileSync(cachedDataPath);
					hashData = data.slice(0, 16);
					options.cachedData = data.slice(16);
					recorder.record(60 /* LoaderEventType.CachedDataFound */, cachedDataPath);
				}
				catch (_e) {
					recorder.record(61 /* LoaderEventType.CachedDataMissed */, cachedDataPath);
				}
				const script = new that._vm.Script(scriptSource, options);
				const compileWrapper = script.runInThisContext(options);
				// run script
				const dirname = that._path.dirname(filename);
				const require = makeRequireFunction(this);
				const args = [this.exports, require, this, filename, dirname, process, _commonjsGlobal, Buffer];
				const result = compileWrapper.apply(this.exports, args);
				// cached data aftermath
				that._handleCachedData(script, scriptSource, cachedDataPath, !options.cachedData, moduleManager);
				that._verifyCachedData(script, scriptSource, cachedDataPath, hashData, moduleManager);
				return result;
			};
		}
		load(moduleManager, scriptSrc, callback, errorback) {
			const opts = moduleManager.getConfig().getOptionsLiteral();
			const nodeRequire = ensureRecordedNodeRequire(moduleManager.getRecorder(), (opts.nodeRequire || AMDLoader.global.nodeRequire));
			const nodeInstrumenter = (opts.nodeInstrumenter || function (c) { return c; });
			this._init(nodeRequire);
			this._initNodeRequire(nodeRequire, moduleManager);
			let recorder = moduleManager.getRecorder();
			if (/^node\|/.test(scriptSrc)) {
				let pieces = scriptSrc.split('|');
				let moduleExports = null;
				try {
					moduleExports = nodeRequire(pieces[1]);
				}
				catch (err) {
					errorback(err);
					return;
				}
				moduleManager.enqueueDefineAnonymousModule([], () => moduleExports);
				callback();
			}
			else {
				scriptSrc = AMDLoader.Utilities.fileUriToFilePath(this._env.isWindows, scriptSrc);
				const normalizedScriptSrc = this._path.normalize(scriptSrc);
				const vmScriptPathOrUri = this._getElectronRendererScriptPathOrUri(normalizedScriptSrc);
				const wantsCachedData = Boolean(opts.nodeCachedData);
				const cachedDataPath = wantsCachedData ? this._getCachedDataPath(opts.nodeCachedData, scriptSrc) : undefined;
				this._readSourceAndCachedData(normalizedScriptSrc, cachedDataPath, recorder, (err, data, cachedData, hashData) => {
					if (err) {
						errorback(err);
						return;
					}
					let scriptSource;
					if (data.charCodeAt(0) === NodeScriptLoader._BOM) {
						scriptSource = NodeScriptLoader._PREFIX + data.substring(1) + NodeScriptLoader._SUFFIX;
					}
					else {
						scriptSource = NodeScriptLoader._PREFIX + data + NodeScriptLoader._SUFFIX;
					}
					scriptSource = nodeInstrumenter(scriptSource, normalizedScriptSrc);
					const scriptOpts = { filename: vmScriptPathOrUri, cachedData };
					const script = this._createAndEvalScript(moduleManager, scriptSource, scriptOpts, callback, errorback);
					this._handleCachedData(script, scriptSource, cachedDataPath, wantsCachedData && !cachedData, moduleManager);
					this._verifyCachedData(script, scriptSource, cachedDataPath, hashData, moduleManager);
				});
			}
		}
		_createAndEvalScript(moduleManager, contents, options, callback, errorback) {
			const recorder = moduleManager.getRecorder();
			recorder.record(31 /* LoaderEventType.NodeBeginEvaluatingScript */, options.filename);
			const script = new this._vm.Script(contents, options);
			const ret = script.runInThisContext(options);
			const globalDefineFunc = moduleManager.getGlobalAMDDefineFunc();
			let receivedDefineCall = false;
			const localDefineFunc = function () {
				receivedDefineCall = true;
				return globalDefineFunc.apply(null, arguments);
			};
			localDefineFunc.amd = globalDefineFunc.amd;
			ret.call(AMDLoader.global, moduleManager.getGlobalAMDRequireFunc(), localDefineFunc, options.filename, this._path.dirname(options.filename));
			recorder.record(32 /* LoaderEventType.NodeEndEvaluatingScript */, options.filename);
			if (receivedDefineCall) {
				callback();
			}
			else {
				errorback(new Error(`Didn't receive define call in ${options.filename}!`));
			}
			return script;
		}
		_getElectronRendererScriptPathOrUri(path) {
			if (!this._env.isElectronRenderer) {
				return path;
			}
			let driveLetterMatch = path.match(/^([a-z])\:(.*)/i);
			if (driveLetterMatch) {
				// windows
				return `file:///${(driveLetterMatch[1].toUpperCase() + ':' + driveLetterMatch[2]).replace(/\\/g, '/')}`;
			}
			else {
				// nix
				return `file://${path}`;
			}
		}
		_getCachedDataPath(config, filename) {
			const hash = this._crypto.createHash('md5').update(filename, 'utf8').update(config.seed, 'utf8').update(process.arch, '').digest('hex');
			const basename = this._path.basename(filename).replace(/\.js$/, '');
			return this._path.join(config.path, `${basename}-${hash}.code`);
		}
		_handleCachedData(script, scriptSource, cachedDataPath, createCachedData, moduleManager) {
			if (script.cachedDataRejected) {
				// cached data got rejected -> delete and re-create
				this._fs.unlink(cachedDataPath, err => {
					moduleManager.getRecorder().record(62 /* LoaderEventType.CachedDataRejected */, cachedDataPath);
					this._createAndWriteCachedData(script, scriptSource, cachedDataPath, moduleManager);
					if (err) {
						moduleManager.getConfig().onError(err);
					}
				});
			}
			else if (createCachedData) {
				// no cached data, but wanted
				this._createAndWriteCachedData(script, scriptSource, cachedDataPath, moduleManager);
			}
		}
		// Cached data format: | SOURCE_HASH | V8_CACHED_DATA |
		// -SOURCE_HASH is the md5 hash of the JS source (always 16 bytes)
		// -V8_CACHED_DATA is what v8 produces
		_createAndWriteCachedData(script, scriptSource, cachedDataPath, moduleManager) {
			let timeout = Math.ceil(moduleManager.getConfig().getOptionsLiteral().nodeCachedData.writeDelay * (1 + Math.random()));
			let lastSize = -1;
			let iteration = 0;
			let hashData = undefined;
			const createLoop = () => {
				setTimeout(() => {
					if (!hashData) {
						hashData = this._crypto.createHash('md5').update(scriptSource, 'utf8').digest();
					}
					const cachedData = script.createCachedData();
					if (cachedData.length === 0 || cachedData.length === lastSize || iteration >= 5) {
						// done
						return;
					}
					if (cachedData.length < lastSize) {
						// less data than before: skip, try again next round
						createLoop();
						return;
					}
					lastSize = cachedData.length;
					this._fs.writeFile(cachedDataPath, Buffer.concat([hashData, cachedData]), err => {
						if (err) {
							moduleManager.getConfig().onError(err);
						}
						moduleManager.getRecorder().record(63 /* LoaderEventType.CachedDataCreated */, cachedDataPath);
						createLoop();
					});
				}, timeout * (Math.pow(4, iteration++)));
			};
			// with some delay (`timeout`) create cached data
			// and repeat that (with backoff delay) until the
			// data seems to be not changing anymore
			createLoop();
		}
		_readSourceAndCachedData(sourcePath, cachedDataPath, recorder, callback) {
			if (!cachedDataPath) {
				// no cached data case
				this._fs.readFile(sourcePath, { encoding: 'utf8' }, callback);
			}
			else {
				// cached data case: read both files in parallel
				let source = undefined;
				let cachedData = undefined;
				let hashData = undefined;
				let steps = 2;
				const step = (err) => {
					if (err) {
						callback(err);
					}
					else if (--steps === 0) {
						callback(undefined, source, cachedData, hashData);
					}
				};
				this._fs.readFile(sourcePath, { encoding: 'utf8' }, (err, data) => {
					source = data;
					step(err);
				});
				this._fs.readFile(cachedDataPath, (err, data) => {
					if (!err && data && data.length > 0) {
						hashData = data.slice(0, 16);
						cachedData = data.slice(16);
						recorder.record(60 /* LoaderEventType.CachedDataFound */, cachedDataPath);
					}
					else {
						recorder.record(61 /* LoaderEventType.CachedDataMissed */, cachedDataPath);
					}
					step(); // ignored: cached data is optional
				});
			}
		}
		_verifyCachedData(script, scriptSource, cachedDataPath, hashData, moduleManager) {
			if (!hashData) {
				// nothing to do
				return;
			}
			if (script.cachedDataRejected) {
				// invalid anyways
				return;
			}
			setTimeout(() => {
				// check source hash - the contract is that file paths change when file content
				// change (e.g use the commit or version id as cache path). this check is
				// for violations of this contract.
				const hashDataNow = this._crypto.createHash('md5').update(scriptSource, 'utf8').digest();
				if (!hashData.equals(hashDataNow)) {
					moduleManager.getConfig().onError(new Error(`FAILED TO VERIFY CACHED DATA, deleting stale '${cachedDataPath}' now, but a RESTART IS REQUIRED`));
					this._fs.unlink(cachedDataPath, err => {
						if (err) {
							moduleManager.getConfig().onError(err);
						}
					});
				}
			}, Math.ceil(5000 * (1 + Math.random())));
		}
	}
	NodeScriptLoader._BOM = 0xFEFF;
	NodeScriptLoader._PREFIX = '(function (require, define, __filename, __dirname) { ';
	NodeScriptLoader._SUFFIX = '\n});';
	function ensureRecordedNodeRequire(recorder, _nodeRequire) {
		if (_nodeRequire.__$__isRecorded) {
			// it is already recorded
			return _nodeRequire;
		}
		const nodeRequire = function nodeRequire(what) {
			recorder.record(33 /* LoaderEventType.NodeBeginNativeRequire */, what);
			try {
				return _nodeRequire(what);
			}
			finally {
				recorder.record(34 /* LoaderEventType.NodeEndNativeRequire */, what);
			}
		};
		nodeRequire.__$__isRecorded = true;
		return nodeRequire;
	}
	AMDLoader.ensureRecordedNodeRequire = ensureRecordedNodeRequire;
	function createScriptLoader(env) {
		return new OnlyOnceScriptLoader(env);
	}
	AMDLoader.createScriptLoader = createScriptLoader;
})(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
(function (AMDLoader) {
	// ------------------------------------------------------------------------
	// ModuleIdResolver
	class ModuleIdResolver {
		constructor(fromModuleId) {
			let lastSlash = fromModuleId.lastIndexOf('/');
			if (lastSlash !== -1) {
				this.fromModulePath = fromModuleId.substr(0, lastSlash + 1);
			}
			else {
				this.fromModulePath = '';
			}
		}
		/**
		 * Normalize 'a/../name' to 'name', etc.
		 */
		static _normalizeModuleId(moduleId) {
			let r = moduleId, pattern;
			// replace /./ => /
			pattern = /\/\.\//;
			while (pattern.test(r)) {
				r = r.replace(pattern, '/');
			}
			// replace ^./ => nothing
			r = r.replace(/^\.\//g, '');
			// replace /aa/../ => / (BUT IGNORE /../../)
			pattern = /\/(([^\/])|([^\/][^\/\.])|([^\/\.][^\/])|([^\/][^\/][^\/]+))\/\.\.\//;
			while (pattern.test(r)) {
				r = r.replace(pattern, '/');
			}
			// replace ^aa/../ => nothing (BUT IGNORE ../../)
			r = r.replace(/^(([^\/])|([^\/][^\/\.])|([^\/\.][^\/])|([^\/][^\/][^\/]+))\/\.\.\//, '');
			return r;
		}
		/**
		 * Resolve relative module ids
		 */
		resolveModule(moduleId) {
			let result = moduleId;
			if (!AMDLoader.Utilities.isAbsolutePath(result)) {
				if (AMDLoader.Utilities.startsWith(result, './') || AMDLoader.Utilities.startsWith(result, '../')) {
					result = ModuleIdResolver._normalizeModuleId(this.fromModulePath + result);
				}
			}
			return result;
		}
	}
	ModuleIdResolver.ROOT = new ModuleIdResolver('');
	AMDLoader.ModuleIdResolver = ModuleIdResolver;
	// ------------------------------------------------------------------------
	// Module
	class Module {
		constructor(id, strId, dependencies, callback, errorback, moduleIdResolver) {
			this.id = id;
			this.strId = strId;
			this.dependencies = dependencies;
			this._callback = callback;
			this._errorback = errorback;
			this.moduleIdResolver = moduleIdResolver;
			this.exports = {};
			this.error = null;
			this.exportsPassedIn = false;
			this.unresolvedDependenciesCount = this.dependencies.length;
			this._isComplete = false;
		}
		static _safeInvokeFunction(callback, args) {
			try {
				return {
					returnedValue: callback.apply(AMDLoader.global, args),
					producedError: null
				};
			}
			catch (e) {
				return {
					returnedValue: null,
					producedError: e
				};
			}
		}
		static _invokeFactory(config, strModuleId, callback, dependenciesValues) {
			if (!config.shouldInvokeFactory(strModuleId)) {
				return {
					returnedValue: null,
					producedError: null
				};
			}
			if (config.shouldCatchError()) {
				return this._safeInvokeFunction(callback, dependenciesValues);
			}
			return {
				returnedValue: callback.apply(AMDLoader.global, dependenciesValues),
				producedError: null
			};
		}
		complete(recorder, config, dependenciesValues, inversedependenciesProvider) {
			this._isComplete = true;
			let producedError = null;
			if (this._callback) {
				if (typeof this._callback === 'function') {
					recorder.record(21 /* LoaderEventType.BeginInvokeFactory */, this.strId);
					let r = Module._invokeFactory(config, this.strId, this._callback, dependenciesValues);
					producedError = r.producedError;
					recorder.record(22 /* LoaderEventType.EndInvokeFactory */, this.strId);
					if (!producedError && typeof r.returnedValue !== 'undefined' && (!this.exportsPassedIn || AMDLoader.Utilities.isEmpty(this.exports))) {
						this.exports = r.returnedValue;
					}
				}
				else {
					this.exports = this._callback;
				}
			}
			if (producedError) {
				let err = AMDLoader.ensureError(producedError);
				err.phase = 'factory';
				err.moduleId = this.strId;
				err.neededBy = inversedependenciesProvider(this.id);
				this.error = err;
				config.onError(err);
			}
			this.dependencies = null;
			this._callback = null;
			this._errorback = null;
			this.moduleIdResolver = null;
		}
		/**
		 * One of the direct dependencies or a transitive dependency has failed to load.
		 */
		onDependencyError(err) {
			this._isComplete = true;
			this.error = err;
			if (this._errorback) {
				this._errorback(err);
				return true;
			}
			return false;
		}
		/**
		 * Is the current module complete?
		 */
		isComplete() {
			return this._isComplete;
		}
	}
	AMDLoader.Module = Module;
	class ModuleIdProvider {
		constructor() {
			this._nextId = 0;
			this._strModuleIdToIntModuleId = new Map();
			this._intModuleIdToStrModuleId = [];
			// Ensure values 0, 1, 2 are assigned accordingly with ModuleId
			this.getModuleId('exports');
			this.getModuleId('module');
			this.getModuleId('require');
		}
		getMaxModuleId() {
			return this._nextId;
		}
		getModuleId(strModuleId) {
			let id = this._strModuleIdToIntModuleId.get(strModuleId);
			if (typeof id === 'undefined') {
				id = this._nextId++;
				this._strModuleIdToIntModuleId.set(strModuleId, id);
				this._intModuleIdToStrModuleId[id] = strModuleId;
			}
			return id;
		}
		getStrModuleId(moduleId) {
			return this._intModuleIdToStrModuleId[moduleId];
		}
	}
	class RegularDependency {
		constructor(id) {
			this.id = id;
		}
	}
	RegularDependency.EXPORTS = new RegularDependency(0 /* ModuleId.EXPORTS */);
	RegularDependency.MODULE = new RegularDependency(1 /* ModuleId.MODULE */);
	RegularDependency.REQUIRE = new RegularDependency(2 /* ModuleId.REQUIRE */);
	AMDLoader.RegularDependency = RegularDependency;
	class PluginDependency {
		constructor(id, pluginId, pluginParam) {
			this.id = id;
			this.pluginId = pluginId;
			this.pluginParam = pluginParam;
		}
	}
	AMDLoader.PluginDependency = PluginDependency;
	class ModuleManager {
		constructor(env, scriptLoader, defineFunc, requireFunc, loaderAvailableTimestamp = 0) {
			this._env = env;
			this._scriptLoader = scriptLoader;
			this._loaderAvailableTimestamp = loaderAvailableTimestamp;
			this._defineFunc = defineFunc;
			this._requireFunc = requireFunc;
			this._moduleIdProvider = new ModuleIdProvider();
			this._config = new AMDLoader.Configuration(this._env);
			this._hasDependencyCycle = false;
			this._modules2 = [];
			this._knownModules2 = [];
			this._inverseDependencies2 = [];
			this._inversePluginDependencies2 = new Map();
			this._currentAnonymousDefineCall = null;
			this._recorder = null;
			this._buildInfoPath = [];
			this._buildInfoDefineStack = [];
			this._buildInfoDependencies = [];
			this._requireFunc.moduleManager = this;
		}
		reset() {
			return new ModuleManager(this._env, this._scriptLoader, this._defineFunc, this._requireFunc, this._loaderAvailableTimestamp);
		}
		getGlobalAMDDefineFunc() {
			return this._defineFunc;
		}
		getGlobalAMDRequireFunc() {
			return this._requireFunc;
		}
		static _findRelevantLocationInStack(needle, stack) {
			let normalize = (str) => str.replace(/\\/g, '/');
			let normalizedPath = normalize(needle);
			let stackPieces = stack.split(/\n/);
			for (let i = 0; i < stackPieces.length; i++) {
				let m = stackPieces[i].match(/(.*):(\d+):(\d+)\)?$/);
				if (m) {
					let stackPath = m[1];
					let stackLine = m[2];
					let stackColumn = m[3];
					let trimPathOffset = Math.max(stackPath.lastIndexOf(' ') + 1, stackPath.lastIndexOf('(') + 1);
					stackPath = stackPath.substr(trimPathOffset);
					stackPath = normalize(stackPath);
					if (stackPath === normalizedPath) {
						let r = {
							line: parseInt(stackLine, 10),
							col: parseInt(stackColumn, 10)
						};
						if (r.line === 1) {
							r.col -= '(function (require, define, __filename, __dirname) { '.length;
						}
						return r;
					}
				}
			}
			throw new Error('Could not correlate define call site for needle ' + needle);
		}
		getBuildInfo() {
			if (!this._config.isBuild()) {
				return null;
			}
			let result = [], resultLen = 0;
			for (let i = 0, len = this._modules2.length; i < len; i++) {
				let m = this._modules2[i];
				if (!m) {
					continue;
				}
				let location = this._buildInfoPath[m.id] || null;
				let defineStack = this._buildInfoDefineStack[m.id] || null;
				let dependencies = this._buildInfoDependencies[m.id];
				result[resultLen++] = {
					id: m.strId,
					path: location,
					defineLocation: (location && defineStack ? ModuleManager._findRelevantLocationInStack(location, defineStack) : null),
					dependencies: dependencies,
					shim: null,
					exports: m.exports
				};
			}
			return result;
		}
		getRecorder() {
			if (!this._recorder) {
				if (this._config.shouldRecordStats()) {
					this._recorder = new AMDLoader.LoaderEventRecorder(this._loaderAvailableTimestamp);
				}
				else {
					this._recorder = AMDLoader.NullLoaderEventRecorder.INSTANCE;
				}
			}
			return this._recorder;
		}
		getLoaderEvents() {
			return this.getRecorder().getEvents();
		}
		/**
		 * Defines an anonymous module (without an id). Its name will be resolved as we receive a callback from the scriptLoader.
		 * @param dependencies @see defineModule
		 * @param callback @see defineModule
		 */
		enqueueDefineAnonymousModule(dependencies, callback) {
			if (this._currentAnonymousDefineCall !== null) {
				throw new Error('Can only have one anonymous define call per script file');
			}
			let stack = null;
			if (this._config.isBuild()) {
				stack = new Error('StackLocation').stack || null;
			}
			this._currentAnonymousDefineCall = {
				stack: stack,
				dependencies: dependencies,
				callback: callback
			};
		}
		/**
		 * Creates a module and stores it in _modules. The manager will immediately begin resolving its dependencies.
		 * @param strModuleId An unique and absolute id of the module. This must not collide with another module's id
		 * @param dependencies An array with the dependencies of the module. Special keys are: "require", "exports" and "module"
		 * @param callback if callback is a function, it will be called with the resolved dependencies. if callback is an object, it will be considered as the exports of the module.
		 */
		defineModule(strModuleId, dependencies, callback, errorback, stack, moduleIdResolver = new ModuleIdResolver(strModuleId)) {
			let moduleId = this._moduleIdProvider.getModuleId(strModuleId);
			if (this._modules2[moduleId]) {
				if (!this._config.isDuplicateMessageIgnoredFor(strModuleId)) {
					console.warn('Duplicate definition of module \'' + strModuleId + '\'');
				}
				// Super important! Completely ignore duplicate module definition
				return;
			}
			let m = new Module(moduleId, strModuleId, this._normalizeDependencies(dependencies, moduleIdResolver), callback, errorback, moduleIdResolver);
			this._modules2[moduleId] = m;
			if (this._config.isBuild()) {
				this._buildInfoDefineStack[moduleId] = stack;
				this._buildInfoDependencies[moduleId] = (m.dependencies || []).map(dep => this._moduleIdProvider.getStrModuleId(dep.id));
			}
			// Resolving of dependencies is immediate (not in a timeout). If there's a need to support a packer that concatenates in an
			// unordered manner, in order to finish processing the file, execute the following method in a timeout
			this._resolve(m);
		}
		_normalizeDependency(dependency, moduleIdResolver) {
			if (dependency === 'exports') {
				return RegularDependency.EXPORTS;
			}
			if (dependency === 'module') {
				return RegularDependency.MODULE;
			}
			if (dependency === 'require') {
				return RegularDependency.REQUIRE;
			}
			// Normalize dependency and then request it from the manager
			let bangIndex = dependency.indexOf('!');
			if (bangIndex >= 0) {
				let strPluginId = moduleIdResolver.resolveModule(dependency.substr(0, bangIndex));
				let pluginParam = moduleIdResolver.resolveModule(dependency.substr(bangIndex + 1));
				let dependencyId = this._moduleIdProvider.getModuleId(strPluginId + '!' + pluginParam);
				let pluginId = this._moduleIdProvider.getModuleId(strPluginId);
				return new PluginDependency(dependencyId, pluginId, pluginParam);
			}
			return new RegularDependency(this._moduleIdProvider.getModuleId(moduleIdResolver.resolveModule(dependency)));
		}
		_normalizeDependencies(dependencies, moduleIdResolver) {
			let result = [], resultLen = 0;
			for (let i = 0, len = dependencies.length; i < len; i++) {
				result[resultLen++] = this._normalizeDependency(dependencies[i], moduleIdResolver);
			}
			return result;
		}
		_relativeRequire(moduleIdResolver, dependencies, callback, errorback) {
			if (typeof dependencies === 'string') {
				return this.synchronousRequire(dependencies, moduleIdResolver);
			}
			this.defineModule(AMDLoader.Utilities.generateAnonymousModule(), dependencies, callback, errorback, null, moduleIdResolver);
		}
		/**
		 * Require synchronously a module by its absolute id. If the module is not loaded, an exception will be thrown.
		 * @param id The unique and absolute id of the required module
		 * @return The exports of module 'id'
		 */
		synchronousRequire(_strModuleId, moduleIdResolver = new ModuleIdResolver(_strModuleId)) {
			let dependency = this._normalizeDependency(_strModuleId, moduleIdResolver);
			let m = this._modules2[dependency.id];
			if (!m) {
				throw new Error('Check dependency list! Synchronous require cannot resolve module \'' + _strModuleId + '\'. This is the first mention of this module!');
			}
			if (!m.isComplete()) {
				throw new Error('Check dependency list! Synchronous require cannot resolve module \'' + _strModuleId + '\'. This module has not been resolved completely yet.');
			}
			if (m.error) {
				throw m.error;
			}
			return m.exports;
		}
		configure(params, shouldOverwrite) {
			let oldShouldRecordStats = this._config.shouldRecordStats();
			if (shouldOverwrite) {
				this._config = new AMDLoader.Configuration(this._env, params);
			}
			else {
				this._config = this._config.cloneAndMerge(params);
			}
			if (this._config.shouldRecordStats() && !oldShouldRecordStats) {
				this._recorder = null;
			}
		}
		getConfig() {
			return this._config;
		}
		/**
		 * Callback from the scriptLoader when a module has been loaded.
		 * This means its code is available and has been executed.
		 */
		_onLoad(moduleId) {
			if (this._currentAnonymousDefineCall !== null) {
				let defineCall = this._currentAnonymousDefineCall;
				this._currentAnonymousDefineCall = null;
				// Hit an anonymous define call
				this.defineModule(this._moduleIdProvider.getStrModuleId(moduleId), defineCall.dependencies, defineCall.callback, null, defineCall.stack);
			}
		}
		_createLoadError(moduleId, _err) {
			let strModuleId = this._moduleIdProvider.getStrModuleId(moduleId);
			let neededBy = (this._inverseDependencies2[moduleId] || []).map((intModuleId) => this._moduleIdProvider.getStrModuleId(intModuleId));
			const err = AMDLoader.ensureError(_err);
			err.phase = 'loading';
			err.moduleId = strModuleId;
			err.neededBy = neededBy;
			return err;
		}
		/**
		 * Callback from the scriptLoader when a module hasn't been loaded.
		 * This means that the script was not found (e.g. 404) or there was an error in the script.
		 */
		_onLoadError(moduleId, err) {
			const error = this._createLoadError(moduleId, err);
			if (!this._modules2[moduleId]) {
				this._modules2[moduleId] = new Module(moduleId, this._moduleIdProvider.getStrModuleId(moduleId), [], () => { }, null, null);
			}
			// Find any 'local' error handlers, walk the entire chain of inverse dependencies if necessary.
			let seenModuleId = [];
			for (let i = 0, len = this._moduleIdProvider.getMaxModuleId(); i < len; i++) {
				seenModuleId[i] = false;
			}
			let someoneNotified = false;
			let queue = [];
			queue.push(moduleId);
			seenModuleId[moduleId] = true;
			while (queue.length > 0) {
				let queueElement = queue.shift();
				let m = this._modules2[queueElement];
				if (m) {
					someoneNotified = m.onDependencyError(error) || someoneNotified;
				}
				let inverseDeps = this._inverseDependencies2[queueElement];
				if (inverseDeps) {
					for (let i = 0, len = inverseDeps.length; i < len; i++) {
						let inverseDep = inverseDeps[i];
						if (!seenModuleId[inverseDep]) {
							queue.push(inverseDep);
							seenModuleId[inverseDep] = true;
						}
					}
				}
			}
			if (!someoneNotified) {
				this._config.onError(error);
			}
		}
		/**
		 * Walks (recursively) the dependencies of 'from' in search of 'to'.
		 * Returns true if there is such a path or false otherwise.
		 * @param from Module id to start at
		 * @param to Module id to look for
		 */
		_hasDependencyPath(fromId, toId) {
			let from = this._modules2[fromId];
			if (!from) {
				return false;
			}
			let inQueue = [];
			for (let i = 0, len = this._moduleIdProvider.getMaxModuleId(); i < len; i++) {
				inQueue[i] = false;
			}
			let queue = [];
			// Insert 'from' in queue
			queue.push(from);
			inQueue[fromId] = true;
			while (queue.length > 0) {
				// Pop first inserted element of queue
				let element = queue.shift();
				let dependencies = element.dependencies;
				if (dependencies) {
					// Walk the element's dependencies
					for (let i = 0, len = dependencies.length; i < len; i++) {
						let dependency = dependencies[i];
						if (dependency.id === toId) {
							// There is a path to 'to'
							return true;
						}
						let dependencyModule = this._modules2[dependency.id];
						if (dependencyModule && !inQueue[dependency.id]) {
							// Insert 'dependency' in queue
							inQueue[dependency.id] = true;
							queue.push(dependencyModule);
						}
					}
				}
			}
			// There is no path to 'to'
			return false;
		}
		/**
		 * Walks (recursively) the dependencies of 'from' in search of 'to'.
		 * Returns cycle as array.
		 * @param from Module id to start at
		 * @param to Module id to look for
		 */
		_findCyclePath(fromId, toId, depth) {
			if (fromId === toId || depth === 50) {
				return [fromId];
			}
			let from = this._modules2[fromId];
			if (!from) {
				return null;
			}
			// Walk the element's dependencies
			let dependencies = from.dependencies;
			if (dependencies) {
				for (let i = 0, len = dependencies.length; i < len; i++) {
					let path = this._findCyclePath(dependencies[i].id, toId, depth + 1);
					if (path !== null) {
						path.push(fromId);
						return path;
					}
				}
			}
			return null;
		}
		/**
		 * Create the local 'require' that is passed into modules
		 */
		_createRequire(moduleIdResolver) {
			let result = ((dependencies, callback, errorback) => {
				return this._relativeRequire(moduleIdResolver, dependencies, callback, errorback);
			});
			result.toUrl = (id) => {
				return this._config.requireToUrl(moduleIdResolver.resolveModule(id));
			};
			result.getStats = () => {
				return this.getLoaderEvents();
			};
			result.hasDependencyCycle = () => {
				return this._hasDependencyCycle;
			};
			result.config = (params, shouldOverwrite = false) => {
				this.configure(params, shouldOverwrite);
			};
			result.__$__nodeRequire = AMDLoader.global.nodeRequire;
			return result;
		}
		_loadModule(moduleId) {
			if (this._modules2[moduleId] || this._knownModules2[moduleId]) {
				// known module
				return;
			}
			this._knownModules2[moduleId] = true;
			let strModuleId = this._moduleIdProvider.getStrModuleId(moduleId);
			let paths = this._config.moduleIdToPaths(strModuleId);
			let scopedPackageRegex = /^@[^\/]+\/[^\/]+$/; // matches @scope/package-name
			if (this._env.isNode && (strModuleId.indexOf('/') === -1 || scopedPackageRegex.test(strModuleId))) {
				paths.push('node|' + strModuleId);
			}
			let lastPathIndex = -1;
			let loadNextPath = (err) => {
				lastPathIndex++;
				if (lastPathIndex >= paths.length) {
					// No more paths to try
					this._onLoadError(moduleId, err);
				}
				else {
					let currentPath = paths[lastPathIndex];
					let recorder = this.getRecorder();
					if (this._config.isBuild() && currentPath === 'empty:') {
						this._buildInfoPath[moduleId] = currentPath;
						this.defineModule(this._moduleIdProvider.getStrModuleId(moduleId), [], null, null, null);
						this._onLoad(moduleId);
						return;
					}
					recorder.record(10 /* LoaderEventType.BeginLoadingScript */, currentPath);
					this._scriptLoader.load(this, currentPath, () => {
						if (this._config.isBuild()) {
							this._buildInfoPath[moduleId] = currentPath;
						}
						recorder.record(11 /* LoaderEventType.EndLoadingScriptOK */, currentPath);
						this._onLoad(moduleId);
					}, (err) => {
						recorder.record(12 /* LoaderEventType.EndLoadingScriptError */, currentPath);
						loadNextPath(err);
					});
				}
			};
			loadNextPath(null);
		}
		/**
		 * Resolve a plugin dependency with the plugin loaded & complete
		 * @param module The module that has this dependency
		 * @param pluginDependency The semi-normalized dependency that appears in the module. e.g. 'vs/css!./mycssfile'. Only the plugin part (before !) is normalized
		 * @param plugin The plugin (what the plugin exports)
		 */
		_loadPluginDependency(plugin, pluginDependency) {
			if (this._modules2[pluginDependency.id] || this._knownModules2[pluginDependency.id]) {
				// known module
				return;
			}
			this._knownModules2[pluginDependency.id] = true;
			// Delegate the loading of the resource to the plugin
			let load = ((value) => {
				this.defineModule(this._moduleIdProvider.getStrModuleId(pluginDependency.id), [], value, null, null);
			});
			load.error = (err) => {
				this._config.onError(this._createLoadError(pluginDependency.id, err));
			};
			plugin.load(pluginDependency.pluginParam, this._createRequire(ModuleIdResolver.ROOT), load, this._config.getOptionsLiteral());
		}
		/**
		 * Examine the dependencies of module 'module' and resolve them as needed.
		 */
		_resolve(module) {
			let dependencies = module.dependencies;
			if (dependencies) {
				for (let i = 0, len = dependencies.length; i < len; i++) {
					let dependency = dependencies[i];
					if (dependency === RegularDependency.EXPORTS) {
						module.exportsPassedIn = true;
						module.unresolvedDependenciesCount--;
						continue;
					}
					if (dependency === RegularDependency.MODULE) {
						module.unresolvedDependenciesCount--;
						continue;
					}
					if (dependency === RegularDependency.REQUIRE) {
						module.unresolvedDependenciesCount--;
						continue;
					}
					let dependencyModule = this._modules2[dependency.id];
					if (dependencyModule && dependencyModule.isComplete()) {
						if (dependencyModule.error) {
							module.onDependencyError(dependencyModule.error);
							return;
						}
						module.unresolvedDependenciesCount--;
						continue;
					}
					if (this._hasDependencyPath(dependency.id, module.id)) {
						this._hasDependencyCycle = true;
						console.warn('There is a dependency cycle between \'' + this._moduleIdProvider.getStrModuleId(dependency.id) + '\' and \'' + this._moduleIdProvider.getStrModuleId(module.id) + '\'. The cyclic path follows:');
						let cyclePath = this._findCyclePath(dependency.id, module.id, 0) || [];
						cyclePath.reverse();
						cyclePath.push(dependency.id);
						console.warn(cyclePath.map(id => this._moduleIdProvider.getStrModuleId(id)).join(' => \n'));
						// Break the cycle
						module.unresolvedDependenciesCount--;
						continue;
					}
					// record inverse dependency
					this._inverseDependencies2[dependency.id] = this._inverseDependencies2[dependency.id] || [];
					this._inverseDependencies2[dependency.id].push(module.id);
					if (dependency instanceof PluginDependency) {
						let plugin = this._modules2[dependency.pluginId];
						if (plugin && plugin.isComplete()) {
							this._loadPluginDependency(plugin.exports, dependency);
							continue;
						}
						// Record dependency for when the plugin gets loaded
						let inversePluginDeps = this._inversePluginDependencies2.get(dependency.pluginId);
						if (!inversePluginDeps) {
							inversePluginDeps = [];
							this._inversePluginDependencies2.set(dependency.pluginId, inversePluginDeps);
						}
						inversePluginDeps.push(dependency);
						this._loadModule(dependency.pluginId);
						continue;
					}
					this._loadModule(dependency.id);
				}
			}
			if (module.unresolvedDependenciesCount === 0) {
				this._onModuleComplete(module);
			}
		}
		_onModuleComplete(module) {
			let recorder = this.getRecorder();
			if (module.isComplete()) {
				// already done
				return;
			}
			let dependencies = module.dependencies;
			let dependenciesValues = [];
			if (dependencies) {
				for (let i = 0, len = dependencies.length; i < len; i++) {
					let dependency = dependencies[i];
					if (dependency === RegularDependency.EXPORTS) {
						dependenciesValues[i] = module.exports;
						continue;
					}
					if (dependency === RegularDependency.MODULE) {
						dependenciesValues[i] = {
							id: module.strId,
							config: () => {
								return this._config.getConfigForModule(module.strId);
							}
						};
						continue;
					}
					if (dependency === RegularDependency.REQUIRE) {
						dependenciesValues[i] = this._createRequire(module.moduleIdResolver);
						continue;
					}
					let dependencyModule = this._modules2[dependency.id];
					if (dependencyModule) {
						dependenciesValues[i] = dependencyModule.exports;
						continue;
					}
					dependenciesValues[i] = null;
				}
			}
			const inversedependenciesProvider = (moduleId) => {
				return (this._inverseDependencies2[moduleId] || []).map((intModuleId) => this._moduleIdProvider.getStrModuleId(intModuleId));
			};
			module.complete(recorder, this._config, dependenciesValues, inversedependenciesProvider);
			// Fetch and clear inverse dependencies
			let inverseDeps = this._inverseDependencies2[module.id];
			this._inverseDependencies2[module.id] = null;
			if (inverseDeps) {
				// Resolve one inverse dependency at a time, always
				// on the lookout for a completed module.
				for (let i = 0, len = inverseDeps.length; i < len; i++) {
					let inverseDependencyId = inverseDeps[i];
					let inverseDependency = this._modules2[inverseDependencyId];
					inverseDependency.unresolvedDependenciesCount--;
					if (inverseDependency.unresolvedDependenciesCount === 0) {
						this._onModuleComplete(inverseDependency);
					}
				}
			}
			let inversePluginDeps = this._inversePluginDependencies2.get(module.id);
			if (inversePluginDeps) {
				// This module is used as a plugin at least once
				// Fetch and clear these inverse plugin dependencies
				this._inversePluginDependencies2.delete(module.id);
				// Resolve plugin dependencies one at a time
				for (let i = 0, len = inversePluginDeps.length; i < len; i++) {
					this._loadPluginDependency(module.exports, inversePluginDeps[i]);
				}
			}
		}
	}
	AMDLoader.ModuleManager = ModuleManager;
})(AMDLoader || (AMDLoader = {}));
var define;
var AMDLoader;
(function (AMDLoader) {
	const env = new AMDLoader.Environment();
	let moduleManager = null;
	const DefineFunc = function (id, dependencies, callback) {
		if (typeof id !== 'string') {
			callback = dependencies;
			dependencies = id;
			id = null;
		}
		if (typeof dependencies !== 'object' || !Array.isArray(dependencies)) {
			callback = dependencies;
			dependencies = null;
		}
		if (!dependencies) {
			dependencies = ['require', 'exports', 'module'];
		}
		if (id) {
			moduleManager.defineModule(id, dependencies, callback, null, null);
		}
		else {
			moduleManager.enqueueDefineAnonymousModule(dependencies, callback);
		}
	};
	DefineFunc.amd = {
		jQuery: true
	};
	const _requireFunc_config = function (params, shouldOverwrite = false) {
		moduleManager.configure(params, shouldOverwrite);
	};
	const RequireFunc = function () {
		if (arguments.length === 1) {
			if ((arguments[0] instanceof Object) && !Array.isArray(arguments[0])) {
				_requireFunc_config(arguments[0]);
				return;
			}
			if (typeof arguments[0] === 'string') {
				return moduleManager.synchronousRequire(arguments[0]);
			}
		}
		if (arguments.length === 2 || arguments.length === 3) {
			if (Array.isArray(arguments[0])) {
				moduleManager.defineModule(AMDLoader.Utilities.generateAnonymousModule(), arguments[0], arguments[1], arguments[2], null);
				return;
			}
		}
		throw new Error('Unrecognized require call');
	};
	RequireFunc.config = _requireFunc_config;
	RequireFunc.getConfig = function () {
		return moduleManager.getConfig().getOptionsLiteral();
	};
	RequireFunc.reset = function () {
		moduleManager = moduleManager.reset();
	};
	RequireFunc.getBuildInfo = function () {
		return moduleManager.getBuildInfo();
	};
	RequireFunc.getStats = function () {
		return moduleManager.getLoaderEvents();
	};
	RequireFunc.define = DefineFunc;
	function init() {
		if (typeof AMDLoader.global.require !== 'undefined' || typeof require !== 'undefined') {
			const _nodeRequire = (AMDLoader.global.require || require);
			if (typeof _nodeRequire === 'function' && typeof _nodeRequire.resolve === 'function') {
				// re-expose node's require function
				const nodeRequire = AMDLoader.ensureRecordedNodeRequire(moduleManager.getRecorder(), _nodeRequire);
				AMDLoader.global.nodeRequire = nodeRequire;
				RequireFunc.nodeRequire = nodeRequire;
				RequireFunc.__$__nodeRequire = nodeRequire;
			}
		}
		if (env.isNode && !env.isElectronRenderer && !env.isElectronNodeIntegrationWebWorker) {
			module.exports = RequireFunc;
		}
		else {
			if (!env.isElectronRenderer) {
				AMDLoader.global.define = DefineFunc;
			}
			AMDLoader.global.require = RequireFunc;
		}
	}
	AMDLoader.init = init;
	if (typeof AMDLoader.global.define !== 'function' || !AMDLoader.global.define.amd) {
		moduleManager = new AMDLoader.ModuleManager(env, AMDLoader.createScriptLoader(env), DefineFunc, RequireFunc, AMDLoader.Utilities.getHighPerformanceTimestamp());
		// The global variable require can configure the loader
		if (typeof AMDLoader.global.require !== 'undefined' && typeof AMDLoader.global.require !== 'function') {
			RequireFunc.config(AMDLoader.global.require);
		}
		// This define is for the local closure defined in node in the case that the loader is concatenated
		define = function () {
			return DefineFunc.apply(null, arguments);
		};
		define.amd = DefineFunc.amd;
		if (typeof doNotInitLoader === 'undefined') {
			init();
		}
	}
})(AMDLoader || (AMDLoader = {}));
