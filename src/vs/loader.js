/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 * Please make sure to make edits in the .ts file at https://github.com/Microsoft/vscode-loader/
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *--------------------------------------------------------------------------------------------*/
const _amdLoaderGlobal = this;
const _commonjsGlobal = typeof global === 'object' ? global : {};
var AMDLoader;
((AMDLoader => {
    AMDLoader.global = _amdLoaderGlobal;
    const Environment = ((() => {
        class Environment {
            constructor() {
                this._detected = false;
                this._isWindows = false;
                this._isNode = false;
                this._isElectronRenderer = false;
                this._isWebWorker = false;
            }

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

            _detect() {
                if (this._detected) {
                    return;
                }
                this._detected = true;
                this._isWindows = Environment._isWindows();
                this._isNode = (typeof module !== 'undefined' && !!module.exports);
                this._isElectronRenderer = (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions.electron !== 'undefined' && process.type === 'renderer');
                this._isWebWorker = (typeof AMDLoader.global.importScripts === 'function');
            }

            static _isWindows() {
                if (typeof navigator !== 'undefined') {
                    if (navigator.userAgent && navigator.userAgent.includes('Windows')) {
                        return true;
                    }
                }
                if (typeof process !== 'undefined') {
                    return (process.platform === 'win32');
                }
                return false;
            }
        }

        return Environment;
    })());
    AMDLoader.Environment = Environment;
}))(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
((AMDLoader => {
    const LoaderEvent = ((() => {
        function LoaderEvent(type, detail, timestamp) {
            this.type = type;
            this.detail = detail;
            this.timestamp = timestamp;
        }
        return LoaderEvent;
    })());
    AMDLoader.LoaderEvent = LoaderEvent;
    const LoaderEventRecorder = ((() => {
        class LoaderEventRecorder {
            constructor(loaderAvailableTimestamp) {
                this._events = [new LoaderEvent(1 /* LoaderAvailable */, '', loaderAvailableTimestamp)];
            }

            record(type, detail) {
                this._events.push(new LoaderEvent(type, detail, AMDLoader.Utilities.getHighPerformanceTimestamp()));
            }

            getEvents() {
                return this._events;
            }
        }

        return LoaderEventRecorder;
    })());
    AMDLoader.LoaderEventRecorder = LoaderEventRecorder;
    const NullLoaderEventRecorder = ((() => {
        class NullLoaderEventRecorder {
            record(type, detail) {
                // Nothing to do
            }

            getEvents() {
                return [];
            }
        }

        return NullLoaderEventRecorder;
    })());
    NullLoaderEventRecorder.INSTANCE = new NullLoaderEventRecorder();
    AMDLoader.NullLoaderEventRecorder = NullLoaderEventRecorder;
}))(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
((AMDLoader => {
    const Utilities = ((() => {
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
                    const key = void 0;
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
                if (!obj || typeof obj !== 'object') {
                    return obj;
                }
                const result = Array.isArray(obj) ? [] : {};
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
                return `===anonymous${Utilities.NEXT_ANONYMOUS_ID++}===`;
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

        return Utilities;
    })());
    Utilities.NEXT_ANONYMOUS_ID = 1;
    Utilities.PERFORMANCE_NOW_PROBED = false;
    Utilities.HAS_PERFORMANCE_NOW = false;
    AMDLoader.Utilities = Utilities;
}))(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
((AMDLoader => {
    const ConfigurationOptionsUtil = ((() => {
        class ConfigurationOptionsUtil {
            /**
             * Ensure configuration options make sense
             */
            static validateConfigurationOptions(options) {
                function defaultOnError(err) {
                    if (err.errorCode === 'load') {
                        console.error(`Loading "${err.moduleId}" failed`);
                        console.error('Detail: ', err.detail);
                        if (err.detail && err.detail.stack) {
                            console.error(err.detail.stack);
                        }
                        console.error('Here are the modules that depend on it:');
                        console.error(err.neededBy);
                        return;
                    }
                    if (err.errorCode === 'factory') {
                        console.error(`The factory method of "${err.moduleId}" has thrown an exception`);
                        console.error(err.detail);
                        if (err.detail && err.detail.stack) {
                            console.error(err.detail.stack);
                        }
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
                if (typeof options.urlArgs !== 'string') {
                    options.urlArgs = '';
                }
                if (typeof options.onError !== 'function') {
                    options.onError = defaultOnError;
                }
                if (typeof options.ignoreDuplicateModules !== 'object' || !Array.isArray(options.ignoreDuplicateModules)) {
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
                if (!Array.isArray(options.nodeModules)) {
                    options.nodeModules = [];
                }
                if (typeof options.nodeCachedDataWriteDelay !== 'number' || options.nodeCachedDataWriteDelay < 0) {
                    options.nodeCachedDataWriteDelay = 1000 * 7;
                }
                if (typeof options.onNodeCachedData !== 'function') {
                    options.onNodeCachedData = (err, data) => {
                        if (!err) {
                            // ignore
                        }
                        else if (err.errorCode === 'cachedDataRejected') {
                            console.warn(`Rejected cached data from file: ${err.path}`);
                        }
                        else if (err.errorCode === 'unlink' || err.errorCode === 'writeFile') {
                            console.error(`Problems writing cached data file: ${err.path}`);
                            console.error(err.detail);
                        }
                        else {
                            console.error(err);
                        }
                    };
                }
                return options;
            }

            static mergeConfigurationOptions(overwrite, base) {
                if (overwrite === void 0) { overwrite = null; }
                if (base === void 0) { base = null; }
                const result = AMDLoader.Utilities.recursiveClone(base || {});
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

        return ConfigurationOptionsUtil;
    })());
    AMDLoader.ConfigurationOptionsUtil = ConfigurationOptionsUtil;
    const Configuration = ((() => {
        class Configuration {
            constructor(env, options) {
                this._env = env;
                this.options = ConfigurationOptionsUtil.mergeConfigurationOptions(options);
                this._createIgnoreDuplicateModulesMap();
                this._createNodeModulesMap();
                this._createSortedPathsRules();
                if (this.options.baseUrl === '') {
                    if (this.options.nodeRequire && this.options.nodeRequire.main && this.options.nodeRequire.main.filename && this._env.isNode) {
                        var nodeMain = this.options.nodeRequire.main.filename;
                        var dirnameIndex = Math.max(nodeMain.lastIndexOf('/'), nodeMain.lastIndexOf('\\'));
                        this.options.baseUrl = nodeMain.substring(0, dirnameIndex + 1);
                    }
                    if (this.options.nodeMain && this._env.isNode) {
                        var nodeMain = this.options.nodeMain;
                        var dirnameIndex = Math.max(nodeMain.lastIndexOf('/'), nodeMain.lastIndexOf('\\'));
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

            _createNodeModulesMap() {
                // Build a map out of nodeModules array
                this.nodeModulesMap = Object.create(null);
                for (let _i = 0, _a = this.options.nodeModules; _i < _a.length; _i++) {
                    const nodeModule = _a[_i];
                    this.nodeModulesMap[nodeModule] = true;
                }
            }

            _createSortedPathsRules() {
                const _this = this;
                // Create an array our of the paths rules, sorted descending by length to
                // result in a more specific -> less specific order
                this.sortedPathsRules = [];
                AMDLoader.Utilities.forEachProperty(this.options.paths, (from, to) => {
                    if (!Array.isArray(to)) {
                        _this.sortedPathsRules.push({
                            from,
                            to: [to]
                        });
                    }
                    else {
                        _this.sortedPathsRules.push({
                            from,
                            to
                        });
                    }
                });
                this.sortedPathsRules.sort((a, b) => b.from.length - a.from.length);
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
                        const result = [];
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
                    return `${url}&${this.options.urlArgs}`;
                }
                else {
                    return `${url}?${this.options.urlArgs}`;
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
                if (this.nodeModulesMap[moduleId] === true) {
                    // This is a node module...
                    if (this.isBuild()) {
                        // ...and we are at build time, drop it
                        return ['empty:'];
                    }
                    else {
                        // ...and at runtime we create a `shortcut`-path
                        return [`node|${moduleId}`];
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
                            results[i] = `${results[i]}.js`;
                        }
                    }
                }
                else {
                    if (!AMDLoader.Utilities.endsWith(result, '.js') && !AMDLoader.Utilities.containsQueryString(result)) {
                        result = `${result}.js`;
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

        return Configuration;
    })());
    AMDLoader.Configuration = Configuration;
}))(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
((AMDLoader => {
    /**
     * Load `scriptSrc` only once (avoid multiple <script> tags)
     */
    const OnlyOnceScriptLoader = ((() => {
        class OnlyOnceScriptLoader {
            constructor(env) {
                this._env = env;
                this._scriptLoader = null;
                this._callbackMap = {};
            }

            load(moduleManager, scriptSrc, callback, errorback) {
                const _this = this;
                if (!this._scriptLoader) {
                    this._scriptLoader = (this._env.isWebWorker
                        ? new WorkerScriptLoader()
                        : this._env.isNode
                            ? new NodeScriptLoader(this._env)
                            : new BrowserScriptLoader());
                }
                const scriptCallbacks = {
                    callback,
                    errorback
                };
                if (this._callbackMap.hasOwnProperty(scriptSrc)) {
                    this._callbackMap[scriptSrc].push(scriptCallbacks);
                    return;
                }
                this._callbackMap[scriptSrc] = [scriptCallbacks];
                this._scriptLoader.load(moduleManager, scriptSrc, () => _this.triggerCallback(scriptSrc), err => _this.triggerErrorback(scriptSrc, err));
            }

            triggerCallback(scriptSrc) {
                const scriptCallbacks = this._callbackMap[scriptSrc];
                delete this._callbackMap[scriptSrc];
                for (let i = 0; i < scriptCallbacks.length; i++) {
                    scriptCallbacks[i].callback();
                }
            }

            triggerErrorback(scriptSrc, err) {
                const scriptCallbacks = this._callbackMap[scriptSrc];
                delete this._callbackMap[scriptSrc];
                for (let i = 0; i < scriptCallbacks.length; i++) {
                    scriptCallbacks[i].errorback(err);
                }
            }
        }

        return OnlyOnceScriptLoader;
    })());
    var BrowserScriptLoader = ((() => {
        class BrowserScriptLoader {
            /**
             * Attach load / error listeners to a script element and remove them when either one has fired.
             * Implemented for browssers supporting HTML5 standard 'load' and 'error' events.
             */
            attachListeners(script, callback, errorback) {
                const unbind = () => {
                    script.removeEventListener('load', loadEventListener);
                    script.removeEventListener('error', errorEventListener);
                };
                var loadEventListener = e => {
                    unbind();
                    callback();
                };
                var errorEventListener = e => {
                    unbind();
                    errorback(e);
                };
                script.addEventListener('load', loadEventListener);
                script.addEventListener('error', errorEventListener);
            }

            load(moduleManager, scriptSrc, callback, errorback) {
                const script = document.createElement('script');
                script.setAttribute('async', 'async');
                script.setAttribute('type', 'text/javascript');
                this.attachListeners(script, callback, errorback);
                script.setAttribute('src', scriptSrc);
                // Propagate CSP nonce to dynamically created script tag.
                const cspNonce = moduleManager.getConfig().getOptionsLiteral().cspNonce;
                if (cspNonce) {
                    script.setAttribute('nonce', cspNonce);
                }
                document.getElementsByTagName('head')[0].appendChild(script);
            }
        }

        return BrowserScriptLoader;
    })());
    var WorkerScriptLoader = ((() => {
        class WorkerScriptLoader {
            load(moduleManager, scriptSrc, callback, errorback) {
                try {
                    importScripts(scriptSrc);
                    callback();
                }
                catch (e) {
                    errorback(e);
                }
            }
        }

        return WorkerScriptLoader;
    })());
    var NodeScriptLoader = ((() => {
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
                // js-flags have an impact on cached data
                this._jsflags = '';
                for (let _i = 0, _a = process.argv; _i < _a.length; _i++) {
                    const arg = _a[_i];
                    if (arg.indexOf('--js-flags=') === 0) {
                        this._jsflags = arg;
                        break;
                    }
                }
            }

            // patch require-function of nodejs such that we can manually create a script
            // from cached data. this is done by overriding the `Module._compile` function
            _initNodeRequire(nodeRequire, moduleManager) {
                const nodeCachedDataDir = moduleManager.getConfig().getOptionsLiteral().nodeCachedDataDir;
                if (!nodeCachedDataDir || this._didPatchNodeRequire) {
                    return;
                }
                this._didPatchNodeRequire = true;
                const that = this;
                const Module = nodeRequire('module');
                function makeRequireFunction(mod) {
                    const Module = mod.constructor;

                    class require {
                        constructor(path) {
                            try {
                                return mod.require(path);
                            }
                            finally {
                                // nothing
                            }
                        }

                        static resolve(request) {
                            return Module._resolveFilename(request, mod);
                        }
                    }

                    require.main = process.mainModule;
                    require.extensions = Module._extensions;
                    require.cache = Module._cache;
                    return require;
                }
                Module.prototype._compile = function (content, filename) {
                    // remove shebang
                    content = content.replace(/^#!.*/, '');
                    // create wrapper function
                    const wrapper = Module.wrap(content);
                    const cachedDataPath = that._getCachedDataPath(nodeCachedDataDir, filename);
                    const options = { filename };
                    try {
                        options.cachedData = that._fs.readFileSync(cachedDataPath);
                    }
                    catch (e) {
                        options.produceCachedData = true;
                    }
                    const script = new that._vm.Script(wrapper, options);
                    const compileWrapper = script.runInThisContext(options);
                    const dirname = that._path.dirname(filename);
                    const require = makeRequireFunction(this);
                    const args = [this.exports, require, this, filename, dirname, process, _commonjsGlobal, Buffer];
                    const result = compileWrapper.apply(this.exports, args);
                    that._processCachedData(moduleManager, script, cachedDataPath);
                    return result;
                };
            }

            load(moduleManager, scriptSrc, callback, errorback) {
                const _this = this;
                const opts = moduleManager.getConfig().getOptionsLiteral();
                const nodeRequire = (opts.nodeRequire || AMDLoader.global.nodeRequire);
                const nodeInstrumenter = (opts.nodeInstrumenter || (c => c));
                this._init(nodeRequire);
                this._initNodeRequire(nodeRequire, moduleManager);
                const recorder = moduleManager.getRecorder();
                if (/^node\|/.test(scriptSrc)) {
                    const pieces = scriptSrc.split('|');
                    let moduleExports_1 = null;
                    try {
                        moduleExports_1 = nodeRequire(pieces[1]);
                    }
                    catch (err) {
                        errorback(err);
                        return;
                    }
                    moduleManager.enqueueDefineAnonymousModule([], () => moduleExports_1);
                    callback();
                }
                else {
                    scriptSrc = AMDLoader.Utilities.fileUriToFilePath(this._env.isWindows, scriptSrc);
                    this._fs.readFile(scriptSrc, { encoding: 'utf8' }, (err, data) => {
                        if (err) {
                            errorback(err);
                            return;
                        }
                        const normalizedScriptSrc = _this._path.normalize(scriptSrc);
                        let vmScriptSrc = normalizedScriptSrc;
                        // Make the script src friendly towards electron
                        if (_this._env.isElectronRenderer) {
                            const driveLetterMatch = vmScriptSrc.match(/^([a-z])\:(.*)/i);
                            if (driveLetterMatch) {
                                // windows
                                vmScriptSrc = `file:///${(driveLetterMatch[1].toUpperCase() + ':' + driveLetterMatch[2]).replace(/\\/g, '/')}`;
                            }
                            else {
                                // nix
                                vmScriptSrc = `file://${vmScriptSrc}`;
                            }
                        }
                        let contents;
                        const prefix = '(function (require, define, __filename, __dirname) { ';
                        const suffix = '\n});';
                        if (data.charCodeAt(0) === NodeScriptLoader._BOM) {
                            contents = prefix + data.substring(1) + suffix;
                        }
                        else {
                            contents = prefix + data + suffix;
                        }
                        contents = nodeInstrumenter(contents, normalizedScriptSrc);
                        if (!opts.nodeCachedDataDir) {
                            _this._loadAndEvalScript(moduleManager, scriptSrc, vmScriptSrc, contents, { filename: vmScriptSrc }, recorder, callback, errorback);
                        }
                        else {
                            const cachedDataPath_1 = _this._getCachedDataPath(opts.nodeCachedDataDir, scriptSrc);
                            _this._fs.readFile(cachedDataPath_1, (err, cachedData) => {
                                // create script options
                                const options = {
                                    filename: vmScriptSrc,
                                    produceCachedData: typeof cachedData === 'undefined',
                                    cachedData
                                };
                                const script = _this._loadAndEvalScript(moduleManager, scriptSrc, vmScriptSrc, contents, options, recorder, callback, errorback);
                                _this._processCachedData(moduleManager, script, cachedDataPath_1);
                            });
                        }
                    });
                }
            }

            _loadAndEvalScript(
                moduleManager,
                scriptSrc,
                vmScriptSrc,
                contents,
                options,
                recorder,
                callback,
                errorback) {
                // create script, run script
                recorder.record(31 /* NodeBeginEvaluatingScript */, scriptSrc);
                const script = new this._vm.Script(contents, options);
                const r = script.runInThisContext(options);
                const globalDefineFunc = moduleManager.getGlobalAMDDefineFunc();
                let receivedDefineCall = false;
                const localDefineFunc = function () {
                    receivedDefineCall = true;
                    return globalDefineFunc(...arguments);
                };
                localDefineFunc.amd = globalDefineFunc.amd;
                r.call(AMDLoader.global, moduleManager.getGlobalAMDRequireFunc(), localDefineFunc, vmScriptSrc, this._path.dirname(scriptSrc));
                // signal done
                recorder.record(32 /* NodeEndEvaluatingScript */, scriptSrc);
                if (receivedDefineCall) {
                    callback();
                }
                else {
                    errorback(new Error(`Didn't receive define call in ${scriptSrc}!`));
                }
                return script;
            }

            _getCachedDataPath(basedir, filename) {
                const hash = this._crypto.createHash('md5').update(filename, 'utf8').update(this._jsflags, 'utf8').digest('hex');
                const basename = this._path.basename(filename).replace(/\.js$/, '');
                return this._path.join(basedir, `${basename}-${hash}.code`);
            }

            _processCachedData(moduleManager, script, cachedDataPath) {
                const _this = this;
                if (script.cachedDataRejected) {
                    // data rejected => delete cache file
                    moduleManager.getConfig().getOptionsLiteral().onNodeCachedData({
                        errorCode: 'cachedDataRejected',
                        path: cachedDataPath
                    });
                    NodeScriptLoader._runSoon(() => _this._fs.unlink(cachedDataPath, err => {
                        if (err) {
                            moduleManager.getConfig().getOptionsLiteral().onNodeCachedData({
                                errorCode: 'unlink',
                                path: cachedDataPath,
                                detail: err
                            });
                        }
                    }), moduleManager.getConfig().getOptionsLiteral().nodeCachedDataWriteDelay);
                }
                else if (script.cachedDataProduced) {
                    // data produced => tell outside world
                    moduleManager.getConfig().getOptionsLiteral().onNodeCachedData(undefined, {
                        path: cachedDataPath,
                        length: script.cachedData.length
                    });
                    // data produced => write cache file
                    NodeScriptLoader._runSoon(() => _this._fs.writeFile(cachedDataPath, script.cachedData, err => {
                        if (err) {
                            moduleManager.getConfig().getOptionsLiteral().onNodeCachedData({
                                errorCode: 'writeFile',
                                path: cachedDataPath,
                                detail: err
                            });
                        }
                    }), moduleManager.getConfig().getOptionsLiteral().nodeCachedDataWriteDelay);
                }
            }

            static _runSoon(callback, minTimeout) {
                const timeout = minTimeout + Math.ceil(Math.random() * minTimeout);
                setTimeout(callback, timeout);
            }
        }

        return NodeScriptLoader;
    })());
    NodeScriptLoader._BOM = 0xFEFF;
    function createScriptLoader(env) {
        return new OnlyOnceScriptLoader(env);
    }
    AMDLoader.createScriptLoader = createScriptLoader;
}))(AMDLoader || (AMDLoader = {}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var AMDLoader;
((AMDLoader => {
    // ------------------------------------------------------------------------
    // ModuleIdResolver
    const ModuleIdResolver = ((() => {
        class ModuleIdResolver {
            constructor(fromModuleId) {
                const lastSlash = fromModuleId.lastIndexOf('/');
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
                let r = moduleId;
                let pattern;
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

        return ModuleIdResolver;
    })());
    ModuleIdResolver.ROOT = new ModuleIdResolver('');
    AMDLoader.ModuleIdResolver = ModuleIdResolver;
    // ------------------------------------------------------------------------
    // Module
    const Module = ((() => {
        class Module {
            constructor(id, strId, dependencies, callback, errorback, moduleIdResolver) {
                this.id = id;
                this.strId = strId;
                this.dependencies = dependencies;
                this._callback = callback;
                this._errorback = errorback;
                this.moduleIdResolver = moduleIdResolver;
                this.exports = {};
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
                if (config.isBuild() && !AMDLoader.Utilities.isAnonymousModule(strModuleId)) {
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

            complete(recorder, config, dependenciesValues) {
                this._isComplete = true;
                let producedError = null;
                if (this._callback) {
                    if (typeof this._callback === 'function') {
                        recorder.record(21 /* BeginInvokeFactory */, this.strId);
                        const r = Module._invokeFactory(config, this.strId, this._callback, dependenciesValues);
                        producedError = r.producedError;
                        recorder.record(22 /* EndInvokeFactory */, this.strId);
                        if (!producedError && typeof r.returnedValue !== 'undefined' && (!this.exportsPassedIn || AMDLoader.Utilities.isEmpty(this.exports))) {
                            this.exports = r.returnedValue;
                        }
                    }
                    else {
                        this.exports = this._callback;
                    }
                }
                if (producedError) {
                    config.onError({
                        errorCode: 'factory',
                        moduleId: this.strId,
                        detail: producedError
                    });
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

        return Module;
    })());
    AMDLoader.Module = Module;
    const ModuleIdProvider = ((() => {
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

        return ModuleIdProvider;
    })());
    const RegularDependency = ((() => {
        function RegularDependency(id) {
            this.id = id;
        }
        return RegularDependency;
    })());
    RegularDependency.EXPORTS = new RegularDependency(0 /* EXPORTS */);
    RegularDependency.MODULE = new RegularDependency(1 /* MODULE */);
    RegularDependency.REQUIRE = new RegularDependency(2 /* REQUIRE */);
    AMDLoader.RegularDependency = RegularDependency;
    const PluginDependency = ((() => {
        function PluginDependency(id, pluginId, pluginParam) {
            this.id = id;
            this.pluginId = pluginId;
            this.pluginParam = pluginParam;
        }
        return PluginDependency;
    })());
    AMDLoader.PluginDependency = PluginDependency;
    const ModuleManager = ((() => {
        class ModuleManager {
            constructor(env, scriptLoader, defineFunc, requireFunc, loaderAvailableTimestamp) {
                if (loaderAvailableTimestamp === void 0) { loaderAvailableTimestamp = 0; }
                this._env = env;
                this._scriptLoader = scriptLoader;
                this._loaderAvailableTimestamp = loaderAvailableTimestamp;
                this._defineFunc = defineFunc;
                this._requireFunc = requireFunc;
                this._moduleIdProvider = new ModuleIdProvider();
                this._config = new AMDLoader.Configuration(this._env);
                this._modules2 = [];
                this._knownModules2 = [];
                this._inverseDependencies2 = [];
                this._inversePluginDependencies2 = new Map();
                this._currentAnnonymousDefineCall = null;
                this._recorder = null;
                this._buildInfoPath = [];
                this._buildInfoDefineStack = [];
                this._buildInfoDependencies = [];
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
                const normalize = str => str.replace(/\\/g, '/');
                const normalizedPath = normalize(needle);
                const stackPieces = stack.split(/\n/);
                for (let i = 0; i < stackPieces.length; i++) {
                    const m = stackPieces[i].match(/(.*):(\d+):(\d+)\)?$/);
                    if (m) {
                        let stackPath = m[1];
                        const stackLine = m[2];
                        const stackColumn = m[3];
                        const trimPathOffset = Math.max(stackPath.lastIndexOf(' ') + 1, stackPath.lastIndexOf('(') + 1);
                        stackPath = stackPath.substr(trimPathOffset);
                        stackPath = normalize(stackPath);
                        if (stackPath === normalizedPath) {
                            const r = {
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
                throw new Error(`Could not correlate define call site for needle ${needle}`);
            }

            getBuildInfo() {
                if (!this._config.isBuild()) {
                    return null;
                }
                const result = [];
                let resultLen = 0;
                for (let i = 0, len = this._modules2.length; i < len; i++) {
                    const m = this._modules2[i];
                    if (!m) {
                        continue;
                    }
                    const location_1 = this._buildInfoPath[m.id] || null;
                    const defineStack = this._buildInfoDefineStack[m.id] || null;
                    const dependencies = this._buildInfoDependencies[m.id];
                    result[resultLen++] = {
                        id: m.strId,
                        path: location_1,
                        defineLocation: (location_1 && defineStack ? ModuleManager._findRelevantLocationInStack(location_1, defineStack) : null),
                        dependencies,
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
             * @param dependecies @see defineModule
             * @param callback @see defineModule
             */
            enqueueDefineAnonymousModule(dependencies, callback) {
                if (this._currentAnnonymousDefineCall !== null) {
                    throw new Error('Can only have one anonymous define call per script file');
                }
                let stack = null;
                if (this._config.isBuild()) {
                    stack = new Error('StackLocation').stack;
                }
                this._currentAnnonymousDefineCall = {
                    stack,
                    dependencies,
                    callback
                };
            }

            /**
             * Creates a module and stores it in _modules. The manager will immediately begin resolving its dependencies.
             * @param strModuleId An unique and absolute id of the module. This must not collide with another module's id
             * @param dependencies An array with the dependencies of the module. Special keys are: "require", "exports" and "module"
             * @param callback if callback is a function, it will be called with the resolved dependencies. if callback is an object, it will be considered as the exports of the module.
             */
            defineModule(strModuleId, dependencies, callback, errorback, stack, moduleIdResolver) {
                const _this = this;
                if (moduleIdResolver === void 0) { moduleIdResolver = new ModuleIdResolver(strModuleId); }
                const moduleId = this._moduleIdProvider.getModuleId(strModuleId);
                if (this._modules2[moduleId]) {
                    if (!this._config.isDuplicateMessageIgnoredFor(strModuleId)) {
                        console.warn(`Duplicate definition of module '${strModuleId}'`);
                    }
                    // Super important! Completely ignore duplicate module definition
                    return;
                }
                const m = new Module(moduleId, strModuleId, this._normalizeDependencies(dependencies, moduleIdResolver), callback, errorback, moduleIdResolver);
                this._modules2[moduleId] = m;
                if (this._config.isBuild()) {
                    this._buildInfoDefineStack[moduleId] = stack;
                    this._buildInfoDependencies[moduleId] = m.dependencies.map(dep => _this._moduleIdProvider.getStrModuleId(dep.id));
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
                const bangIndex = dependency.indexOf('!');
                if (bangIndex >= 0) {
                    const strPluginId = moduleIdResolver.resolveModule(dependency.substr(0, bangIndex));
                    const pluginParam = moduleIdResolver.resolveModule(dependency.substr(bangIndex + 1));
                    const dependencyId = this._moduleIdProvider.getModuleId(`${strPluginId}!${pluginParam}`);
                    const pluginId = this._moduleIdProvider.getModuleId(strPluginId);
                    return new PluginDependency(dependencyId, pluginId, pluginParam);
                }
                return new RegularDependency(this._moduleIdProvider.getModuleId(moduleIdResolver.resolveModule(dependency)));
            }

            _normalizeDependencies(dependencies, moduleIdResolver) {
                const result = [];
                let resultLen = 0;
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
            synchronousRequire(_strModuleId, moduleIdResolver) {
                if (moduleIdResolver === void 0) { moduleIdResolver = new ModuleIdResolver(_strModuleId); }
                const dependency = this._normalizeDependency(_strModuleId, moduleIdResolver);
                const m = this._modules2[dependency.id];
                if (!m) {
                    throw new Error(`Check dependency list! Synchronous require cannot resolve module '${_strModuleId}'. This is the first mention of this module!`);
                }
                if (!m.isComplete()) {
                    throw new Error(`Check dependency list! Synchronous require cannot resolve module '${_strModuleId}'. This module has not been resolved completely yet.`);
                }
                return m.exports;
            }

            configure(params, shouldOverwrite) {
                const oldShouldRecordStats = this._config.shouldRecordStats();
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
                if (this._currentAnnonymousDefineCall !== null) {
                    const defineCall = this._currentAnnonymousDefineCall;
                    this._currentAnnonymousDefineCall = null;
                    // Hit an anonymous define call
                    this.defineModule(this._moduleIdProvider.getStrModuleId(moduleId), defineCall.dependencies, defineCall.callback, null, defineCall.stack);
                }
            }

            _createLoadError(moduleId, err) {
                const _this = this;
                const strModuleId = this._moduleIdProvider.getStrModuleId(moduleId);
                const neededBy = (this._inverseDependencies2[moduleId] || []).map(intModuleId => _this._moduleIdProvider.getStrModuleId(intModuleId));
                return {
                    errorCode: 'load',
                    moduleId: strModuleId,
                    neededBy,
                    detail: err
                };
            }

            /**
             * Callback from the scriptLoader when a module hasn't been loaded.
             * This means that the script was not found (e.g. 404) or there was an error in the script.
             */
            _onLoadError(moduleId, err) {
                const error = this._createLoadError(moduleId, err);
                // Find any 'local' error handlers, walk the entire chain of inverse dependencies if necessary.
                const seenModuleId = [];
                for (var i = 0, len = this._moduleIdProvider.getMaxModuleId(); i < len; i++) {
                    seenModuleId[i] = false;
                }
                let someoneNotified = false;
                const queue = [];
                queue.push(moduleId);
                seenModuleId[moduleId] = true;
                while (queue.length > 0) {
                    const queueElement = queue.shift();
                    const m = this._modules2[queueElement];
                    if (m) {
                        someoneNotified = m.onDependencyError(error) || someoneNotified;
                    }
                    const inverseDeps = this._inverseDependencies2[queueElement];
                    if (inverseDeps) {
                        for (var i = 0, len = inverseDeps.length; i < len; i++) {
                            const inverseDep = inverseDeps[i];
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
                const from = this._modules2[fromId];
                if (!from) {
                    return false;
                }
                const inQueue = [];
                for (var i = 0, len = this._moduleIdProvider.getMaxModuleId(); i < len; i++) {
                    inQueue[i] = false;
                }
                const queue = [];
                // Insert 'from' in queue
                queue.push(from);
                inQueue[fromId] = true;
                while (queue.length > 0) {
                    // Pop first inserted element of queue
                    const element = queue.shift();
                    const dependencies = element.dependencies;
                    if (dependencies) {
                        // Walk the element's dependencies
                        for (var i = 0, len = dependencies.length; i < len; i++) {
                            const dependency = dependencies[i];
                            if (dependency.id === toId) {
                                // There is a path to 'to'
                                return true;
                            }
                            const dependencyModule = this._modules2[dependency.id];
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
                const from = this._modules2[fromId];
                if (!from) {
                    return null;
                }
                // Walk the element's dependencies
                const dependencies = from.dependencies;
                for (let i = 0, len = dependencies.length; i < len; i++) {
                    const path = this._findCyclePath(dependencies[i].id, toId, depth + 1);
                    if (path !== null) {
                        path.push(fromId);
                        return path;
                    }
                }
                return null;
            }

            /**
             * Create the local 'require' that is passed into modules
             */
            _createRequire(moduleIdResolver) {
                const _this = this;

                class result {
                    constructor(dependencies, callback, errorback) {
                        return _this._relativeRequire(moduleIdResolver, dependencies, callback, errorback);
                    }

                    static toUrl(id) {
                        return _this._config.requireToUrl(moduleIdResolver.resolveModule(id));
                    }

                    static getStats() {
                        return _this.getLoaderEvents();
                    }
                }

                result.__$__nodeRequire = AMDLoader.global.nodeRequire;
                return result;
            }

            _loadModule(moduleId) {
                const _this = this;
                if (this._modules2[moduleId] || this._knownModules2[moduleId]) {
                    // known module
                    return;
                }
                this._knownModules2[moduleId] = true;
                const strModuleId = this._moduleIdProvider.getStrModuleId(moduleId);
                const paths = this._config.moduleIdToPaths(strModuleId);
                const scopedPackageRegex = /^@[^\/]+\/[^\/]+$/; // matches @scope/package-name
                if (this._env.isNode && (!strModuleId.includes('/') || scopedPackageRegex.test(strModuleId))) {
                    paths.push(`node|${strModuleId}`);
                }
                let lastPathIndex = -1;
                const loadNextPath = err => {
                    lastPathIndex++;
                    if (lastPathIndex >= paths.length) {
                        // No more paths to try
                        _this._onLoadError(moduleId, err);
                    }
                    else {
                        const currentPath_1 = paths[lastPathIndex];
                        const recorder_1 = _this.getRecorder();
                        if (_this._config.isBuild() && currentPath_1 === 'empty:') {
                            _this._buildInfoPath[moduleId] = currentPath_1;
                            _this.defineModule(_this._moduleIdProvider.getStrModuleId(moduleId), [], null, null, null);
                            _this._onLoad(moduleId);
                            return;
                        }
                        recorder_1.record(10 /* BeginLoadingScript */, currentPath_1);
                        _this._scriptLoader.load(_this, currentPath_1, () => {
                            if (_this._config.isBuild()) {
                                _this._buildInfoPath[moduleId] = currentPath_1;
                            }
                            recorder_1.record(11 /* EndLoadingScriptOK */, currentPath_1);
                            _this._onLoad(moduleId);
                        }, err => {
                            recorder_1.record(12 /* EndLoadingScriptError */, currentPath_1);
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
                const _this = this;
                if (this._modules2[pluginDependency.id] || this._knownModules2[pluginDependency.id]) {
                    // known module
                    return;
                }
                this._knownModules2[pluginDependency.id] = true;

                // Delegate the loading of the resource to the plugin
                class load {
                    constructor(value) {
                        _this.defineModule(_this._moduleIdProvider.getStrModuleId(pluginDependency.id), [], value, null, null);
                    }

                    static error(err) {
                        _this._config.onError(_this._createLoadError(pluginDependency.id, err));
                    }
                }

                plugin.load(pluginDependency.pluginParam, this._createRequire(ModuleIdResolver.ROOT), load, this._config.getOptionsLiteral());
            }

            /**
             * Examine the dependencies of module 'module' and resolve them as needed.
             */
            _resolve(module) {
                const _this = this;
                const dependencies = module.dependencies;
                for (let i = 0, len = dependencies.length; i < len; i++) {
                    const dependency = dependencies[i];
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
                    const dependencyModule = this._modules2[dependency.id];
                    if (dependencyModule && dependencyModule.isComplete()) {
                        module.unresolvedDependenciesCount--;
                        continue;
                    }
                    if (this._hasDependencyPath(dependency.id, module.id)) {
                        console.warn(`There is a dependency cycle between '${this._moduleIdProvider.getStrModuleId(dependency.id)}' and '${this._moduleIdProvider.getStrModuleId(module.id)}'. The cyclic path follows:`);
                        const cyclePath = this._findCyclePath(dependency.id, module.id, 0);
                        cyclePath.reverse();
                        cyclePath.push(dependency.id);
                        console.warn(cyclePath.map(id => _this._moduleIdProvider.getStrModuleId(id)).join(' => \n'));
                        // Break the cycle
                        module.unresolvedDependenciesCount--;
                        continue;
                    }
                    // record inverse dependency
                    this._inverseDependencies2[dependency.id] = this._inverseDependencies2[dependency.id] || [];
                    this._inverseDependencies2[dependency.id].push(module.id);
                    if (dependency instanceof PluginDependency) {
                        const plugin = this._modules2[dependency.pluginId];
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
                if (module.unresolvedDependenciesCount === 0) {
                    this._onModuleComplete(module);
                }
            }

            _onModuleComplete(module) {
                const _this = this;
                const recorder = this.getRecorder();
                if (module.isComplete()) {
                    // already done
                    return;
                }
                const dependencies = module.dependencies;
                const dependenciesValues = [];
                for (var i = 0, len = dependencies.length; i < len; i++) {
                    const dependency = dependencies[i];
                    if (dependency === RegularDependency.EXPORTS) {
                        dependenciesValues[i] = module.exports;
                        continue;
                    }
                    if (dependency === RegularDependency.MODULE) {
                        dependenciesValues[i] = {
                            id: module.strId,
                            config() {
                                return _this._config.getConfigForModule(module.strId);
                            }
                        };
                        continue;
                    }
                    if (dependency === RegularDependency.REQUIRE) {
                        dependenciesValues[i] = this._createRequire(module.moduleIdResolver);
                        continue;
                    }
                    const dependencyModule = this._modules2[dependency.id];
                    if (dependencyModule) {
                        dependenciesValues[i] = dependencyModule.exports;
                        continue;
                    }
                    dependenciesValues[i] = null;
                }
                module.complete(recorder, this._config, dependenciesValues);
                // Fetch and clear inverse dependencies
                const inverseDeps = this._inverseDependencies2[module.id];
                this._inverseDependencies2[module.id] = null;
                if (inverseDeps) {
                    // Resolve one inverse dependency at a time, always
                    // on the lookout for a completed module.
                    for (var i = 0, len = inverseDeps.length; i < len; i++) {
                        const inverseDependencyId = inverseDeps[i];
                        const inverseDependency = this._modules2[inverseDependencyId];
                        inverseDependency.unresolvedDependenciesCount--;
                        if (inverseDependency.unresolvedDependenciesCount === 0) {
                            this._onModuleComplete(inverseDependency);
                        }
                    }
                }
                const inversePluginDeps = this._inversePluginDependencies2.get(module.id);
                if (inversePluginDeps) {
                    // This module is used as a plugin at least once
                    // Fetch and clear these inverse plugin dependencies
                    this._inversePluginDependencies2.delete(module.id);
                    // Resolve plugin dependencies one at a time
                    for (var i = 0, len = inversePluginDeps.length; i < len; i++) {
                        this._loadPluginDependency(module.exports, inversePluginDeps[i]);
                    }
                }
            }
        }

        return ModuleManager;
    })());
    AMDLoader.ModuleManager = ModuleManager;
}))(AMDLoader || (AMDLoader = {}));
let define;
var AMDLoader;
((AMDLoader => {
    const env = new AMDLoader.Environment();
    let moduleManager = null;
    const DefineFunc = (id, dependencies, callback) => {
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
    const _requireFunc_config = (params, shouldOverwrite) => {
        if (shouldOverwrite === void 0) { shouldOverwrite = false; }
        moduleManager.configure(params, shouldOverwrite);
    };

    class RequireFunc {
        constructor() {
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
        }

        static getConfig() {
            return moduleManager.getConfig().getOptionsLiteral();
        }

        static reset() {
            moduleManager = moduleManager.reset();
        }

        static getBuildInfo() {
            return moduleManager.getBuildInfo();
        }

        static getStats() {
            return moduleManager.getLoaderEvents();
        }

        static define() {
            return DefineFunc(...arguments);
        }
    }

    RequireFunc.config = _requireFunc_config;
    function init() {
        if (typeof AMDLoader.global.require !== 'undefined' || typeof require !== 'undefined') {
            const _nodeRequire_1 = (AMDLoader.global.require || require);
            if (typeof _nodeRequire_1 === 'function' && typeof _nodeRequire_1.resolve === 'function') {
                // re-expose node's require function
                const nodeRequire = what => {
                    moduleManager.getRecorder().record(33 /* NodeBeginNativeRequire */, what);
                    try {
                        return _nodeRequire_1(what);
                    }
                    finally {
                        moduleManager.getRecorder().record(34 /* NodeEndNativeRequire */, what);
                    }
                };
                AMDLoader.global.nodeRequire = nodeRequire;
                RequireFunc.nodeRequire = nodeRequire;
                RequireFunc.__$__nodeRequire = nodeRequire;
            }
        }
        if (env.isNode && !env.isElectronRenderer) {
            module.exports = RequireFunc;
            require = RequireFunc;
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
            return DefineFunc(...arguments);
        };
        define.amd = DefineFunc.amd;
        if (typeof doNotInitLoader === 'undefined') {
            init();
        }
    }
}))(AMDLoader || (AMDLoader = {}));
