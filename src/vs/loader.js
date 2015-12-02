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
/// <reference path="declares.ts" />
'use strict';
// Limitation: To load jquery through the loader, always require 'jquery' and add a path for it in the loader configuration
var _amdLoaderGlobal = this, define;
var AMDLoader;
(function (AMDLoader) {
    // ------------------------------------------------------------------------
    // Utilities
    function _isWindows() {
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
    var isWindows = _isWindows();
    var Utilities = (function () {
        function Utilities() {
        }
        /**
         * This method does not take care of / vs \
         */
        Utilities.fileUriToFilePath = function (uri) {
            uri = decodeURI(uri);
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
        };
        Utilities.startsWith = function (haystack, needle) {
            return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
        };
        Utilities.endsWith = function (haystack, needle) {
            return haystack.length >= needle.length && haystack.substr(haystack.length - needle.length) === needle;
        };
        Utilities.containsQueryString = function (url) {
            return url.indexOf('?') >= 0;
        };
        /**
         * Does `url` start with http:// or https:// or / ?
         */
        Utilities.isAbsolutePath = function (url) {
            return (Utilities.startsWith(url, 'http://')
                || Utilities.startsWith(url, 'https://')
                || Utilities.startsWith(url, 'file://')
                || Utilities.startsWith(url, '/'));
        };
        Utilities.forEachProperty = function (obj, callback) {
            if (obj) {
                var key;
                for (key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        callback(key, obj[key]);
                    }
                }
            }
        };
        Utilities.isEmpty = function (obj) {
            var isEmpty = true;
            Utilities.forEachProperty(obj, function () {
                isEmpty = false;
            });
            return isEmpty;
        };
        Utilities.isArray = function (obj) {
            if (Array.isArray) {
                return Array.isArray(obj);
            }
            return Object.prototype.toString.call(obj) === '[object Array]';
        };
        Utilities.recursiveClone = function (obj) {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }
            var result = Utilities.isArray(obj) ? [] : {};
            Utilities.forEachProperty(obj, function (key, value) {
                if (value && typeof value === 'object') {
                    result[key] = Utilities.recursiveClone(value);
                }
                else {
                    result[key] = value;
                }
            });
            return result;
        };
        Utilities.generateAnonymousModule = function () {
            return '===anonymous' + (Utilities.NEXT_ANONYMOUS_ID++) + '===';
        };
        Utilities.isAnonymousModule = function (id) {
            return id.indexOf('===anonymous') === 0;
        };
        Utilities.NEXT_ANONYMOUS_ID = 1;
        return Utilities;
    })();
    AMDLoader.Utilities = Utilities;
    var ConfigurationOptionsUtil = (function () {
        function ConfigurationOptionsUtil() {
        }
        /**
         * Ensure configuration options make sense
         */
        ConfigurationOptionsUtil.validateConfigurationOptions = function (options) {
            function defaultOnError(err) {
                if (err.errorCode === 'load') {
                    console.error('Loading "' + err.moduleId + '" failed');
                    console.error('Detail: ', err.detail);
                    if (err.detail && err.detail.stack) {
                        console.error(err.detail.stack);
                    }
                    console.error('Here are the modules that depend on it:');
                    console.error(err.neededBy);
                    return;
                }
                if (err.errorCode === 'factory') {
                    console.error('The factory method of "' + err.moduleId + '" has thrown an exception');
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
            if (typeof options.bundles !== 'object') {
                options.bundles = [];
            }
            if (typeof options.shim !== 'object') {
                options.shim = {};
            }
            if (typeof options.config !== 'object') {
                options.config = {};
            }
            if (typeof options.catchError === 'undefined') {
                // Catch errors by default in web workers, do not catch errors by default in other contexts
                options.catchError = isWebWorker;
            }
            if (typeof options.urlArgs !== 'string') {
                options.urlArgs = '';
            }
            if (typeof options.onError !== 'function') {
                options.onError = defaultOnError;
            }
            if (typeof options.ignoreDuplicateModules !== 'object' || !Utilities.isArray(options.ignoreDuplicateModules)) {
                options.ignoreDuplicateModules = [];
            }
            if (options.baseUrl.length > 0) {
                if (!Utilities.endsWith(options.baseUrl, '/')) {
                    options.baseUrl += '/';
                }
            }
            return options;
        };
        ConfigurationOptionsUtil.mergeConfigurationOptions = function (overwrite, base) {
            if (overwrite === void 0) { overwrite = null; }
            if (base === void 0) { base = null; }
            var result = Utilities.recursiveClone(base || {});
            // Merge known properties and overwrite the unknown ones
            Utilities.forEachProperty(overwrite, function (key, value) {
                if (key === 'bundles' && typeof result.bundles !== 'undefined') {
                    if (Utilities.isArray(value)) {
                        // Compatibility style
                        result.bundles = result.bundles.concat(value);
                    }
                    else {
                        // AMD API style
                        Utilities.forEachProperty(value, function (key, value) {
                            var bundleConfiguration = {
                                location: key,
                                modules: value
                            };
                            result.bundles.push(bundleConfiguration);
                        });
                    }
                }
                else if (key === 'ignoreDuplicateModules' && typeof result.ignoreDuplicateModules !== 'undefined') {
                    result.ignoreDuplicateModules = result.ignoreDuplicateModules.concat(value);
                }
                else if (key === 'paths' && typeof result.paths !== 'undefined') {
                    Utilities.forEachProperty(value, function (key2, value2) { return result.paths[key2] = value2; });
                }
                else if (key === 'shim' && typeof result.shim !== 'undefined') {
                    Utilities.forEachProperty(value, function (key2, value2) { return result.shim[key2] = value2; });
                }
                else if (key === 'config' && typeof result.config !== 'undefined') {
                    Utilities.forEachProperty(value, function (key2, value2) { return result.config[key2] = value2; });
                }
                else {
                    result[key] = Utilities.recursiveClone(value);
                }
            });
            return ConfigurationOptionsUtil.validateConfigurationOptions(result);
        };
        return ConfigurationOptionsUtil;
    })();
    AMDLoader.ConfigurationOptionsUtil = ConfigurationOptionsUtil;
    var Configuration = (function () {
        function Configuration(options) {
            this.options = ConfigurationOptionsUtil.mergeConfigurationOptions(options);
            this._createIgnoreDuplicateModulesMap();
            this._createSortedPathsRules();
            this._createShimModules();
            this._createOverwriteModuleIdToPath();
            if (this.options.baseUrl === '') {
                if (isNode && this.options.nodeRequire && this.options.nodeRequire.main && this.options.nodeRequire.main.filename) {
                    var nodeMain = this.options.nodeRequire.main.filename;
                    var dirnameIndex = Math.max(nodeMain.lastIndexOf('/'), nodeMain.lastIndexOf('\\'));
                    this.options.baseUrl = nodeMain.substring(0, dirnameIndex + 1);
                }
                if (isNode && this.options.nodeMain) {
                    var nodeMain = this.options.nodeMain;
                    var dirnameIndex = Math.max(nodeMain.lastIndexOf('/'), nodeMain.lastIndexOf('\\'));
                    this.options.baseUrl = nodeMain.substring(0, dirnameIndex + 1);
                }
            }
        }
        Configuration.prototype._createOverwriteModuleIdToPath = function () {
            this.overwriteModuleIdToPath = {};
            for (var i = 0; i < this.options.bundles.length; i++) {
                var bundle = this.options.bundles[i];
                var location = bundle.location;
                if (bundle.modules) {
                    for (var j = 0; j < bundle.modules.length; j++) {
                        this.overwriteModuleIdToPath[bundle.modules[j]] = location;
                    }
                }
            }
        };
        Configuration.prototype._createIgnoreDuplicateModulesMap = function () {
            // Build a map out of the ignoreDuplicateModules array
            this.ignoreDuplicateModulesMap = {};
            for (var i = 0; i < this.options.ignoreDuplicateModules.length; i++) {
                this.ignoreDuplicateModulesMap[this.options.ignoreDuplicateModules[i]] = true;
            }
        };
        Configuration.prototype._createSortedPathsRules = function () {
            var _this = this;
            // Create an array our of the paths rules, sorted descending by length to
            // result in a more specific -> less specific order
            this.sortedPathsRules = [];
            Utilities.forEachProperty(this.options.paths, function (from, to) {
                if (!Utilities.isArray(to)) {
                    _this.sortedPathsRules.push({
                        from: from,
                        to: [to]
                    });
                }
                else {
                    _this.sortedPathsRules.push({
                        from: from,
                        to: to
                    });
                }
            });
            this.sortedPathsRules.sort(function (a, b) {
                return b.from.length - a.from.length;
            });
        };
        Configuration.prototype._ensureShimModule1 = function (path, shimMD) {
            // Ensure dependencies are also shimmed
            for (var i = 0; i < shimMD.length; i++) {
                var dependencyId = shimMD[i];
                if (!this.shimModules.hasOwnProperty(dependencyId)) {
                    this._ensureShimModule1(dependencyId, []);
                }
            }
            this.shimModules[path] = {
                stack: null,
                dependencies: shimMD,
                callback: null
            };
            if (this.options.isBuild) {
                this.shimModulesStr[path] = 'null';
            }
        };
        Configuration.prototype._ensureShimModule2 = function (path, shimMD) {
            this.shimModules[path] = {
                stack: null,
                dependencies: shimMD.deps || [],
                callback: function () {
                    var depsValues = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        depsValues[_i - 0] = arguments[_i];
                    }
                    if (typeof shimMD.init === 'function') {
                        var initReturnValue = shimMD.init.apply(global, depsValues);
                        if (typeof initReturnValue !== 'undefined') {
                            return initReturnValue;
                        }
                    }
                    if (typeof shimMD.exports === 'function') {
                        return shimMD.exports.apply(global, depsValues);
                    }
                    if (typeof shimMD.exports === 'string') {
                        var pieces = shimMD.exports.split('.');
                        var obj = global;
                        for (var i = 0; i < pieces.length; i++) {
                            if (obj) {
                                obj = obj[pieces[i]];
                            }
                        }
                        return obj;
                    }
                    return shimMD.exports || {};
                }
            };
            if (this.options.isBuild) {
                if (typeof shimMD.init === 'function') {
                    this.shimModulesStr[path] = shimMD.init.toString();
                }
                else if (typeof shimMD.exports === 'function') {
                    this.shimModulesStr[path] = shimMD.exports.toString();
                }
                else if (typeof shimMD.exports === 'string') {
                    this.shimModulesStr[path] = 'function() { return this.' + shimMD.exports + '; }';
                }
                else {
                    this.shimModulesStr[path] = JSON.stringify(shimMD.exports);
                }
            }
        };
        Configuration.prototype._createShimModules = function () {
            var _this = this;
            this.shimModules = {};
            this.shimModulesStr = {};
            Utilities.forEachProperty(this.options.shim, function (path, shimMD) {
                if (!shimMD) {
                    return;
                }
                if (Utilities.isArray(shimMD)) {
                    _this._ensureShimModule1(path, shimMD);
                    return;
                }
                _this._ensureShimModule2(path, shimMD);
            });
        };
        /**
         * Clone current configuration and overwrite options selectively.
         * @param options The selective options to overwrite with.
         * @result A new configuration
         */
        Configuration.prototype.cloneAndMerge = function (options) {
            return new Configuration(ConfigurationOptionsUtil.mergeConfigurationOptions(options, this.options));
        };
        /**
         * Get current options bag. Useful for passing it forward to plugins.
         */
        Configuration.prototype.getOptionsLiteral = function () {
            return this.options;
        };
        Configuration.prototype._applyPaths = function (moduleId) {
            var pathRule;
            for (var i = 0, len = this.sortedPathsRules.length; i < len; i++) {
                pathRule = this.sortedPathsRules[i];
                if (Utilities.startsWith(moduleId, pathRule.from)) {
                    var result = [];
                    for (var j = 0, lenJ = pathRule.to.length; j < lenJ; j++) {
                        result.push(pathRule.to[j] + moduleId.substr(pathRule.from.length));
                    }
                    return result;
                }
            }
            return [moduleId];
        };
        Configuration.prototype._addUrlArgsToUrl = function (url) {
            var hasUrlArgs = url.indexOf('?') >= 0;
            if (hasUrlArgs) {
                return url + '&' + this.options.urlArgs;
            }
            else {
                return url + '?' + this.options.urlArgs;
            }
        };
        Configuration.prototype._addUrlArgsIfNecessaryToUrl = function (url) {
            if (this.options.urlArgs) {
                return this._addUrlArgsToUrl(url);
            }
            return url;
        };
        Configuration.prototype._addUrlArgsIfNecessaryToUrls = function (urls) {
            if (this.options.urlArgs) {
                for (var i = 0, len = urls.length; i < len; i++) {
                    urls[i] = this._addUrlArgsToUrl(urls[i]);
                }
            }
            return urls;
        };
        /**
         * Transform a module id to a location. Appends .js to module ids
         */
        Configuration.prototype.moduleIdToPaths = function (moduleId) {
            var result = moduleId;
            if (this.overwriteModuleIdToPath.hasOwnProperty(result)) {
                result = this.overwriteModuleIdToPath[result];
            }
            var results;
            if (!Utilities.endsWith(result, '.js') && !Utilities.isAbsolutePath(result)) {
                results = this._applyPaths(result);
                for (var i = 0, len = results.length; i < len; i++) {
                    if (this.isBuild() && results[i] === 'empty:') {
                        continue;
                    }
                    if (!Utilities.isAbsolutePath(results[i])) {
                        results[i] = this.options.baseUrl + results[i];
                    }
                    if (!Utilities.endsWith(results[i], '.js') && !Utilities.containsQueryString(results[i])) {
                        results[i] = results[i] + '.js';
                    }
                }
            }
            else {
                if (!Utilities.endsWith(result, '.js') && !Utilities.containsQueryString(result)) {
                    result = result + '.js';
                }
                results = [result];
            }
            return this._addUrlArgsIfNecessaryToUrls(results);
        };
        /**
         * Transform a module id or url to a location.
         */
        Configuration.prototype.requireToUrl = function (url) {
            var result = url;
            if (!Utilities.isAbsolutePath(result)) {
                result = this._applyPaths(result)[0];
                if (!Utilities.isAbsolutePath(result)) {
                    result = this.options.baseUrl + result;
                }
            }
            return this._addUrlArgsIfNecessaryToUrl(result);
        };
        /**
         * Test if `moduleId` is shimmed.
         */
        Configuration.prototype.isShimmed = function (moduleId) {
            return this.shimModules.hasOwnProperty(moduleId);
        };
        /**
         * Flag to indicate if current execution is as part of a build.
         */
        Configuration.prototype.isBuild = function () {
            return this.options.isBuild;
        };
        /**
         * Get a normalized shim definition for `moduleId`.
         */
        Configuration.prototype.getShimmedModuleDefine = function (moduleId) {
            return this.shimModules[moduleId];
        };
        Configuration.prototype.getShimmedModulesStr = function (moduleId) {
            return this.shimModulesStr[moduleId];
        };
        /**
         * Test if module `moduleId` is expected to be defined multiple times
         */
        Configuration.prototype.isDuplicateMessageIgnoredFor = function (moduleId) {
            return this.ignoreDuplicateModulesMap.hasOwnProperty(moduleId);
        };
        /**
         * Get the configuration settings for the provided module id
         */
        Configuration.prototype.getConfigForModule = function (moduleId) {
            if (this.options.config) {
                return this.options.config[moduleId];
            }
        };
        /**
         * Should errors be caught when executing module factories?
         */
        Configuration.prototype.shouldCatchError = function () {
            return this.options.catchError;
        };
        /**
         * Should statistics be recorded?
         */
        Configuration.prototype.shouldRecordStats = function () {
            return this.options.recordStats;
        };
        /**
         * Forward an error to the error handler.
         */
        Configuration.prototype.onError = function (err) {
            this.options.onError(err);
        };
        return Configuration;
    })();
    AMDLoader.Configuration = Configuration;
    // ------------------------------------------------------------------------
    // ModuleIdResolver
    var ModuleIdResolver = (function () {
        function ModuleIdResolver(config, fromModuleId) {
            this._config = config;
            var lastSlash = fromModuleId.lastIndexOf('/');
            if (lastSlash !== -1) {
                this.fromModulePath = fromModuleId.substr(0, lastSlash + 1);
            }
            else {
                this.fromModulePath = '';
            }
        }
        ModuleIdResolver.prototype.isBuild = function () {
            return this._config.isBuild();
        };
        /**
         * Normalize 'a/../name' to 'name', etc.
         */
        ModuleIdResolver._normalizeModuleId = function (moduleId) {
            var r = moduleId, pattern;
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
        };
        /**
         * Resolve relative module ids
         */
        ModuleIdResolver.prototype.resolveModule = function (moduleId) {
            var result = moduleId;
            if (!Utilities.isAbsolutePath(result)) {
                if (Utilities.startsWith(result, './') || Utilities.startsWith(result, '../')) {
                    result = ModuleIdResolver._normalizeModuleId(this.fromModulePath + result);
                }
            }
            return result;
        };
        /**
         * Transform a module id to a location. Appends .js to module ids
         */
        ModuleIdResolver.prototype.moduleIdToPaths = function (moduleId) {
            var r = this._config.moduleIdToPaths(moduleId);
            if (isNode && moduleId.indexOf('/') === -1) {
                r.push('node|' + this.fromModulePath + '|' + moduleId);
            }
            return r;
        };
        /**
         * Transform a module id or url to a location.
         */
        ModuleIdResolver.prototype.requireToUrl = function (url) {
            return this._config.requireToUrl(url);
        };
        /**
         * Should errors be caught when executing module factories?
         */
        ModuleIdResolver.prototype.shouldCatchError = function () {
            return this._config.shouldCatchError();
        };
        /**
         * Forward an error to the error handler.
         */
        ModuleIdResolver.prototype.onError = function (err) {
            this._config.onError(err);
        };
        return ModuleIdResolver;
    })();
    AMDLoader.ModuleIdResolver = ModuleIdResolver;
    // ------------------------------------------------------------------------
    // Module
    var Module = (function () {
        function Module(id, dependencies, callback, errorback, recorder, moduleIdResolver, config, defineCallStack) {
            if (defineCallStack === void 0) { defineCallStack = null; }
            this._id = id;
            this._dependencies = dependencies;
            this._dependenciesValues = [];
            this._callback = callback;
            this._errorback = errorback;
            this._recorder = recorder;
            this._moduleIdResolver = moduleIdResolver;
            this._exports = {};
            this._exportsPassedIn = false;
            this._config = config;
            this._defineCallStack = defineCallStack;
            this._digestDependencies();
            if (this._unresolvedDependenciesCount === 0) {
                this._complete();
            }
        }
        Module.prototype._digestDependencies = function () {
            var _this = this;
            // Exact count of dependencies
            this._unresolvedDependenciesCount = this._dependencies.length;
            // Send on to the manager only a subset of dependencies
            // For example, 'exports' and 'module' can be fulfilled locally
            this._normalizedDependencies = [];
            this._managerDependencies = [];
            this._managerDependenciesMap = {};
            var i, len, d;
            for (i = 0, len = this._dependencies.length; i < len; i++) {
                d = this._dependencies[i];
                if (!d) {
                    // Most likely, undefined sneaked in to the dependency array
                    // Also, IE8 interprets ['a', 'b',] as ['a', 'b', undefined]
                    console.warn('Please check module ' + this._id + ', the dependency list looks broken');
                    this._normalizedDependencies[i] = d;
                    this._dependenciesValues[i] = null;
                    this._unresolvedDependenciesCount--;
                    continue;
                }
                if (d === 'exports') {
                    // Fulfill 'exports' locally and remember that it was passed in
                    // Later on, we will ignore the return value of the factory method
                    this._exportsPassedIn = true;
                    this._normalizedDependencies[i] = d;
                    this._dependenciesValues[i] = this._exports;
                    this._unresolvedDependenciesCount--;
                }
                else if (d === 'module') {
                    // Fulfill 'module' locally
                    this._normalizedDependencies[i] = d;
                    this._dependenciesValues[i] = {
                        id: this._id,
                        config: function () { return _this._config; }
                    };
                    this._unresolvedDependenciesCount--;
                }
                else if (d === 'require') {
                    // Request 'requre' from the manager
                    this._normalizedDependencies[i] = d;
                    this.addManagerDependency(d, i);
                }
                else {
                    // Normalize dependency and then request it from the manager
                    var bangIndex = d.indexOf('!');
                    if (bangIndex >= 0) {
                        var pluginId = d.substring(0, bangIndex);
                        var pluginParam = d.substring(bangIndex + 1, d.length);
                        d = this._moduleIdResolver.resolveModule(pluginId) + '!' + pluginParam;
                    }
                    else {
                        d = this._moduleIdResolver.resolveModule(d);
                    }
                    this._normalizedDependencies[i] = d;
                    this.addManagerDependency(d, i);
                }
            }
        };
        Module.prototype.addManagerDependency = function (dependency, index) {
            if (this._managerDependenciesMap.hasOwnProperty(dependency)) {
                throw new Error('Module ' + this._id + ' contains multiple times a dependency to ' + dependency);
            }
            this._managerDependencies.push(dependency);
            this._managerDependenciesMap[dependency] = index;
        };
        /**
         * Called by the module manager because plugin dependencies can not
         * be normalized statically, the part after '!' can only be normalized
         * once the plugin has loaded and its normalize logic is plugged in.
         */
        Module.prototype.renameDependency = function (oldDependencyId, newDependencyId) {
            if (!this._managerDependenciesMap.hasOwnProperty(oldDependencyId)) {
                throw new Error('Loader: Cannot rename an unknown dependency!');
            }
            var index = this._managerDependenciesMap[oldDependencyId];
            delete this._managerDependenciesMap[oldDependencyId];
            this._managerDependenciesMap[newDependencyId] = index;
            this._normalizedDependencies[index] = newDependencyId;
        };
        /**
         * Get module's id
         */
        Module.prototype.getId = function () {
            return this._id;
        };
        /**
         * Get the module id resolver associated with this module
         */
        Module.prototype.getModuleIdResolver = function () {
            return this._moduleIdResolver;
        };
        Module.prototype.isExportsPassedIn = function () {
            return this._exportsPassedIn;
        };
        Module.prototype.getExports = function () {
            return this._exports;
        };
        /**
         * Get the initial dependencies (resolved).
         * Does not account for any renames
         */
        Module.prototype.getDependencies = function () {
            return this._managerDependencies;
        };
        Module.prototype.getNormalizedDependencies = function () {
            return this._normalizedDependencies;
        };
        Module.prototype.getDefineCallStack = function () {
            return this._defineCallStack;
        };
        Module.prototype._invokeFactory = function () {
            if (this._moduleIdResolver.isBuild() && !Utilities.isAnonymousModule(this._id)) {
                return {
                    returnedValue: null,
                    producedError: null
                };
            }
            var producedError = null, returnedValue = null;
            if (this._moduleIdResolver.shouldCatchError()) {
                try {
                    returnedValue = this._callback.apply(global, this._dependenciesValues);
                }
                catch (e) {
                    producedError = e;
                }
                finally {
                }
            }
            else {
                returnedValue = this._callback.apply(global, this._dependenciesValues);
            }
            return {
                returnedValue: returnedValue,
                producedError: producedError
            };
        };
        Module.prototype._complete = function () {
            var producedError = null;
            if (this._callback) {
                if (typeof this._callback === 'function') {
                    this._recorder.record(LoaderEventType.BeginInvokeFactory, this._id);
                    var r = this._invokeFactory();
                    producedError = r.producedError;
                    this._recorder.record(LoaderEventType.EndInvokeFactory, this._id);
                    if (!producedError && typeof r.returnedValue !== 'undefined' && (!this._exportsPassedIn || Utilities.isEmpty(this._exports))) {
                        this._exports = r.returnedValue;
                    }
                }
                else {
                    this._exports = this._callback;
                }
            }
            if (producedError) {
                this.getModuleIdResolver().onError({
                    errorCode: 'factory',
                    moduleId: this._id,
                    detail: producedError
                });
            }
        };
        /**
         * Release references used while resolving module
         */
        Module.prototype.cleanUp = function () {
            if (this._moduleIdResolver && !this._moduleIdResolver.isBuild()) {
                this._normalizedDependencies = null;
                this._moduleIdResolver = null;
            }
            this._dependencies = null;
            this._dependenciesValues = null;
            this._callback = null;
            this._managerDependencies = null;
            this._managerDependenciesMap = null;
        };
        /**
         * One of the direct dependencies or a transitive dependency has failed to load.
         */
        Module.prototype.onDependencyError = function (err) {
            if (this._errorback) {
                this._errorback(err);
                return true;
            }
            return false;
        };
        /**
         * Resolve a dependency with a value.
         */
        Module.prototype.resolveDependency = function (id, value) {
            if (!this._managerDependenciesMap.hasOwnProperty(id)) {
                throw new Error('Cannot resolve a dependency I do not have!');
            }
            this._dependenciesValues[this._managerDependenciesMap[id]] = value;
            // Prevent resolving the same dependency twice
            delete this._managerDependenciesMap[id];
            this._unresolvedDependenciesCount--;
            if (this._unresolvedDependenciesCount === 0) {
                this._complete();
            }
        };
        /**
         * Is the current module complete?
         */
        Module.prototype.isComplete = function () {
            return this._unresolvedDependenciesCount === 0;
        };
        return Module;
    })();
    AMDLoader.Module = Module;
    // ------------------------------------------------------------------------
    // LoaderEvent
    (function (LoaderEventType) {
        LoaderEventType[LoaderEventType["LoaderAvailable"] = 1] = "LoaderAvailable";
        LoaderEventType[LoaderEventType["BeginLoadingScript"] = 10] = "BeginLoadingScript";
        LoaderEventType[LoaderEventType["EndLoadingScriptOK"] = 11] = "EndLoadingScriptOK";
        LoaderEventType[LoaderEventType["EndLoadingScriptError"] = 12] = "EndLoadingScriptError";
        LoaderEventType[LoaderEventType["BeginInvokeFactory"] = 21] = "BeginInvokeFactory";
        LoaderEventType[LoaderEventType["EndInvokeFactory"] = 22] = "EndInvokeFactory";
        LoaderEventType[LoaderEventType["NodeBeginEvaluatingScript"] = 31] = "NodeBeginEvaluatingScript";
        LoaderEventType[LoaderEventType["NodeEndEvaluatingScript"] = 32] = "NodeEndEvaluatingScript";
        LoaderEventType[LoaderEventType["NodeBeginNativeRequire"] = 33] = "NodeBeginNativeRequire";
        LoaderEventType[LoaderEventType["NodeEndNativeRequire"] = 34] = "NodeEndNativeRequire";
    })(AMDLoader.LoaderEventType || (AMDLoader.LoaderEventType = {}));
    var LoaderEventType = AMDLoader.LoaderEventType;
    function getHighPerformanceTimestamp() {
        return (hasPerformanceNow ? global.performance.now() : Date.now());
    }
    var LoaderEvent = (function () {
        function LoaderEvent(type, detail, timestamp) {
            this.type = type;
            this.detail = detail;
            this.timestamp = timestamp;
        }
        return LoaderEvent;
    })();
    AMDLoader.LoaderEvent = LoaderEvent;
    var LoaderEventRecorder = (function () {
        function LoaderEventRecorder(loaderAvailableTimestamp) {
            this._events = [new LoaderEvent(LoaderEventType.LoaderAvailable, '', loaderAvailableTimestamp)];
        }
        LoaderEventRecorder.prototype.record = function (type, detail) {
            this._events.push(new LoaderEvent(type, detail, getHighPerformanceTimestamp()));
        };
        LoaderEventRecorder.prototype.getEvents = function () {
            return this._events;
        };
        return LoaderEventRecorder;
    })();
    AMDLoader.LoaderEventRecorder = LoaderEventRecorder;
    var NullLoaderEventRecorder = (function () {
        function NullLoaderEventRecorder() {
        }
        NullLoaderEventRecorder.prototype.record = function (type, detail) {
            // Nothing to do
        };
        NullLoaderEventRecorder.prototype.getEvents = function () {
            return [];
        };
        NullLoaderEventRecorder.INSTANCE = new NullLoaderEventRecorder();
        return NullLoaderEventRecorder;
    })();
    AMDLoader.NullLoaderEventRecorder = NullLoaderEventRecorder;
    var ModuleManager = (function () {
        function ModuleManager(scriptLoader) {
            this._recorder = null;
            this._config = new Configuration();
            this._scriptLoader = scriptLoader;
            this._modules = {};
            this._knownModules = {};
            this._inverseDependencies = {};
            this._dependencies = {};
            this._inversePluginDependencies = {};
            this._queuedDefineCalls = [];
            this._loadingScriptsCount = 0;
            this._resolvedScriptPaths = {};
        }
        ModuleManager._findRelevantLocationInStack = function (needle, stack) {
            var normalize = function (str) { return str.replace(/\\/g, '/'); };
            var normalizedPath = normalize(needle);
            var stackPieces = stack.split(/\n/);
            for (var i = 0; i < stackPieces.length; i++) {
                var m = stackPieces[i].match(/(.*):(\d+):(\d+)\)?$/);
                if (m) {
                    var stackPath = m[1];
                    var stackLine = m[2];
                    var stackColumn = m[3];
                    var trimPathOffset = Math.max(stackPath.lastIndexOf(' ') + 1, stackPath.lastIndexOf('(') + 1);
                    stackPath = stackPath.substr(trimPathOffset);
                    stackPath = normalize(stackPath);
                    if (stackPath === normalizedPath) {
                        var r = {
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
        };
        ModuleManager.prototype.getBuildInfo = function () {
            var _this = this;
            if (!this._config.isBuild()) {
                return null;
            }
            return Object.keys(this._modules).map(function (moduleId) {
                var m = _this._modules[moduleId];
                var location = _this._resolvedScriptPaths[moduleId] || null;
                var defineStack = m.getDefineCallStack();
                return {
                    id: moduleId,
                    path: location,
                    defineLocation: (location && defineStack ? ModuleManager._findRelevantLocationInStack(location, defineStack) : null),
                    dependencies: m.getNormalizedDependencies(),
                    shim: (_this._config.isShimmed(moduleId) ? _this._config.getShimmedModulesStr(moduleId) : null),
                    exports: m.getExports()
                };
            });
        };
        ModuleManager.prototype.getRecorder = function () {
            if (!this._recorder) {
                if (this._config.shouldRecordStats()) {
                    this._recorder = new LoaderEventRecorder(loaderAvailableTimestamp);
                }
                else {
                    this._recorder = NullLoaderEventRecorder.INSTANCE;
                }
            }
            return this._recorder;
        };
        ModuleManager.prototype.getLoaderEvents = function () {
            return this.getRecorder().getEvents();
        };
        /**
         * Defines a module.
         * @param id @see defineModule
         * @param dependencies @see defineModule
         * @param callback @see defineModule
         */
        ModuleManager.prototype.enqueueDefineModule = function (id, dependencies, callback) {
            if (this._loadingScriptsCount === 0) {
                // There are no scripts currently loading, so no load event will be fired, so the queue will not be consumed
                this.defineModule(id, dependencies, callback, null, null);
            }
            else {
                this._queuedDefineCalls.push({
                    id: id,
                    stack: null,
                    dependencies: dependencies,
                    callback: callback
                });
            }
        };
        /**
         * Defines an anonymous module (without an id). Its name will be resolved as we receive a callback from the scriptLoader.
         * @param dependecies @see defineModule
         * @param callback @see defineModule
         */
        ModuleManager.prototype.enqueueDefineAnonymousModule = function (dependencies, callback) {
            var stack = null;
            if (this._config.isBuild()) {
                stack = (new Error('StackLocation')).stack;
            }
            this._queuedDefineCalls.push({
                id: null,
                stack: stack,
                dependencies: dependencies,
                callback: callback
            });
        };
        /**
         * Creates a module and stores it in _modules. The manager will immediately begin resolving its dependencies.
         * @param id An unique and absolute id of the module. This must not collide with another module's id
         * @param dependencies An array with the dependencies of the module. Special keys are: "require", "exports" and "module"
         * @param callback if callback is a function, it will be called with the resolved dependencies. if callback is an object, it will be considered as the exports of the module.
         */
        ModuleManager.prototype.defineModule = function (id, dependencies, callback, errorback, stack, moduleIdResolver) {
            if (moduleIdResolver === void 0) { moduleIdResolver = new ModuleIdResolver(this._config, id); }
            if (this._modules.hasOwnProperty(id)) {
                if (!this._config.isDuplicateMessageIgnoredFor(id)) {
                    console.warn('Duplicate definition of module \'' + id + '\'');
                }
                // Super important! Completely ignore duplicate module definition
                return;
            }
            var moduleConfig = this._config.getConfigForModule(id);
            var m = new Module(id, dependencies, callback, errorback, this.getRecorder(), moduleIdResolver, moduleConfig, stack);
            this._modules[id] = m;
            // Resolving of dependencies is immediate (not in a timeout). If there's a need to support a packer that concatenates in an
            // unordered manner, in order to finish processing the file, execute the following method in a timeout
            this._resolve(m);
        };
        ModuleManager.prototype._relativeRequire = function (moduleIdResolver, dependencies, callback, errorback) {
            if (typeof dependencies === 'string') {
                return this.synchronousRequire(dependencies, moduleIdResolver);
            }
            this.defineModule(Utilities.generateAnonymousModule(), dependencies, callback, errorback, null, moduleIdResolver);
        };
        /**
         * Require synchronously a module by its absolute id. If the module is not loaded, an exception will be thrown.
         * @param id The unique and absolute id of the required module
         * @return The exports of module 'id'
         */
        ModuleManager.prototype.synchronousRequire = function (id, moduleIdResolver) {
            if (moduleIdResolver === void 0) { moduleIdResolver = new ModuleIdResolver(this._config, id); }
            var moduleId = moduleIdResolver.resolveModule(id);
            var bangIndex = moduleId.indexOf('!');
            if (bangIndex >= 0) {
                // This is a synchronous require for a plugin dependency, so be sure to normalize the pluginParam (the piece after '!')
                var pluginId = moduleId.substring(0, bangIndex), pluginParam = moduleId.substring(bangIndex + 1, moduleId.length), plugin = {};
                if (this._modules.hasOwnProperty(pluginId)) {
                    plugin = this._modules[pluginId];
                }
                // Helper to normalize the part which comes after '!'
                var normalize = function (_arg) {
                    return moduleIdResolver.resolveModule(_arg);
                };
                if (typeof plugin.normalize === 'function') {
                    pluginParam = plugin.normalize(pluginParam, normalize);
                }
                else {
                    pluginParam = normalize(pluginParam);
                }
                moduleId = pluginId + '!' + pluginParam;
            }
            if (!this._modules.hasOwnProperty(moduleId)) {
                throw new Error('Check dependency list! Synchronous require cannot resolve module \'' + moduleId + '\'. This is the first mention of this module!');
            }
            var m = this._modules[moduleId];
            if (!m.isComplete()) {
                throw new Error('Check dependency list! Synchronous require cannot resolve module \'' + moduleId + '\'. This module has not been resolved completely yet.');
            }
            return m.getExports();
        };
        ModuleManager.prototype.configure = function (params, shouldOverwrite) {
            var oldShouldRecordStats = this._config.shouldRecordStats();
            if (shouldOverwrite) {
                this._config = new Configuration(params);
            }
            else {
                this._config = this._config.cloneAndMerge(params);
            }
            if (this._config.shouldRecordStats() && !oldShouldRecordStats) {
                this._recorder = null;
            }
        };
        ModuleManager.prototype.getConfigurationOptions = function () {
            return this._config.getOptionsLiteral();
        };
        /**
         * Callback from the scriptLoader when a module has been loaded.
         * This means its code is available and has been executed.
         */
        ModuleManager.prototype._onLoad = function (id) {
            var defineCall;
            this._loadingScriptsCount--;
            if (this._config.isShimmed(id)) {
                // Do not consume queue, might end up consuming a module that is later expected
                // If a shimmed module has loaded, create a define call for it
                defineCall = this._config.getShimmedModuleDefine(id);
                this.defineModule(id, defineCall.dependencies, defineCall.callback, null, defineCall.stack);
            }
            else {
                if (this._queuedDefineCalls.length === 0) {
                    // Loaded a file and it didn't call `define`
                    this._loadingScriptsCount++;
                    this._onLoadError(id, new Error('No define call received from module ' + id + '.'));
                }
                else {
                    // Consume queue until first anonymous define call
                    // or until current id is found in the queue
                    while (this._queuedDefineCalls.length > 0) {
                        defineCall = this._queuedDefineCalls.shift();
                        if (defineCall.id === id || defineCall.id === null) {
                            // Hit an anonymous define call or its own define call
                            defineCall.id = id;
                            this.defineModule(defineCall.id, defineCall.dependencies, defineCall.callback, null, defineCall.stack);
                            break;
                        }
                        else {
                            // Hit other named define calls
                            this.defineModule(defineCall.id, defineCall.dependencies, defineCall.callback, null, defineCall.stack);
                        }
                    }
                }
            }
            if (this._loadingScriptsCount === 0) {
                // No more on loads will be triggered, so make sure queue is empty
                while (this._queuedDefineCalls.length > 0) {
                    defineCall = this._queuedDefineCalls.shift();
                    if (defineCall.id === null) {
                        console.warn('Found an unmatched anonymous define call in the define queue. Ignoring it!');
                        console.warn(defineCall.callback);
                    }
                    else {
                        // Hit other named define calls
                        this.defineModule(defineCall.id, defineCall.dependencies, defineCall.callback, null, defineCall.stack);
                    }
                }
            }
        };
        /**
         * Callback from the scriptLoader when a module hasn't been loaded.
         * This means that the script was not found (e.g. 404) or there was an error in the script.
         */
        ModuleManager.prototype._onLoadError = function (id, err) {
            this._loadingScriptsCount--;
            var error = {
                errorCode: 'load',
                moduleId: id,
                neededBy: (this._inverseDependencies[id] ? this._inverseDependencies[id].slice(0) : []),
                detail: err
            };
            // Find any 'local' error handlers, walk the entire chain of inverse dependencies if necessary.
            var seenModuleId = {}, queueElement, someoneNotified = false, queue = [];
            queue.push(id);
            seenModuleId[id] = true;
            while (queue.length > 0) {
                queueElement = queue.shift();
                if (this._modules[queueElement]) {
                    someoneNotified = this._modules[queueElement].onDependencyError(error) || someoneNotified;
                }
                if (this._inverseDependencies[queueElement]) {
                    for (var i = 0, len = this._inverseDependencies[queueElement].length; i < len; i++) {
                        if (!seenModuleId.hasOwnProperty(this._inverseDependencies[queueElement][i])) {
                            queue.push(this._inverseDependencies[queueElement][i]);
                            seenModuleId[this._inverseDependencies[queueElement][i]] = true;
                        }
                    }
                }
            }
            if (!someoneNotified) {
                this._config.onError(error);
            }
        };
        /**
         * Module id has been loaded completely, its exports are available.
         * @param id module's id
         * @param exports module's exports
         */
        ModuleManager.prototype._onModuleComplete = function (id, exports) {
            var i, len, inverseDependencyId, inverseDependency;
            // Clean up module's dependencies since module is now complete
            delete this._dependencies[id];
            if (this._inverseDependencies.hasOwnProperty(id)) {
                // Fetch and clear inverse dependencies
                var inverseDependencies = this._inverseDependencies[id];
                delete this._inverseDependencies[id];
                // Resolve one inverse dependency at a time, always
                // on the lookout for a completed module.
                for (i = 0, len = inverseDependencies.length; i < len; i++) {
                    inverseDependencyId = inverseDependencies[i];
                    inverseDependency = this._modules[inverseDependencyId];
                    inverseDependency.resolveDependency(id, exports);
                    if (inverseDependency.isComplete()) {
                        this._onModuleComplete(inverseDependencyId, inverseDependency.getExports());
                    }
                }
            }
            if (this._inversePluginDependencies.hasOwnProperty(id)) {
                // This module is used as a plugin at least once
                // Fetch and clear these inverse plugin dependencies
                var inversePluginDependencies = this._inversePluginDependencies[id];
                delete this._inversePluginDependencies[id];
                // Resolve plugin dependencies one at a time
                for (i = 0, len = inversePluginDependencies.length; i < len; i++) {
                    var inversePluginDependencyId = inversePluginDependencies[i].moduleId;
                    var inversePluginDependency = this._modules[inversePluginDependencyId];
                    this._resolvePluginDependencySync(inversePluginDependencyId, inversePluginDependencies[i].dependencyId, exports);
                    // Anonymous modules might already be gone at this point
                    if (inversePluginDependency.isComplete()) {
                        this._onModuleComplete(inversePluginDependencyId, inversePluginDependency.getExports());
                    }
                }
            }
            if (Utilities.isAnonymousModule(id)) {
                // Clean up references to anonymous modules, to prevent memory leaks
                delete this._modules[id];
                delete this._dependencies[id];
            }
            else {
                this._modules[id].cleanUp();
            }
        };
        /**
         * Walks (recursively) the dependencies of 'from' in search of 'to'.
         * Returns true if there is such a path or false otherwise.
         * @param from Module id to start at
         * @param to Module id to look for
         */
        ModuleManager.prototype._hasDependencyPath = function (from, to) {
            var i, len, inQueue = {}, queue = [], element, dependencies, dependency;
            // Insert 'from' in queue
            queue.push(from);
            inQueue[from] = true;
            while (queue.length > 0) {
                // Pop first inserted element of queue
                element = queue.shift();
                if (this._dependencies.hasOwnProperty(element)) {
                    dependencies = this._dependencies[element];
                    // Walk the element's dependencies
                    for (i = 0, len = dependencies.length; i < len; i++) {
                        dependency = dependencies[i];
                        if (dependency === to) {
                            // There is a path to 'to'
                            return true;
                        }
                        if (!inQueue.hasOwnProperty(dependency)) {
                            // Insert 'dependency' in queue
                            inQueue[dependency] = true;
                            queue.push(dependency);
                        }
                    }
                }
            }
            // There is no path to 'to'
            return false;
        };
        /**
         * Walks (recursively) the dependencies of 'from' in search of 'to'.
         * Returns cycle as array.
         * @param from Module id to start at
         * @param to Module id to look for
         */
        ModuleManager.prototype._findCyclePath = function (from, to, depth) {
            if (from === to || depth === 50) {
                return [from];
            }
            if (!this._dependencies.hasOwnProperty(from)) {
                return null;
            }
            var path, dependencies = this._dependencies[from];
            // Walk the element's dependencies
            for (var i = 0, len = dependencies.length; i < len; i++) {
                path = this._findCyclePath(dependencies[i], to, depth + 1);
                if (path !== null) {
                    path.push(from);
                    return path;
                }
            }
            return null;
        };
        /**
         * Create the local 'require' that is passed into modules
         */
        ModuleManager.prototype._createRequire = function (moduleIdResolver) {
            var _this = this;
            var result = (function (dependencies, callback, errorback) {
                return _this._relativeRequire(moduleIdResolver, dependencies, callback, errorback);
            });
            result.toUrl = function (id) {
                return moduleIdResolver.requireToUrl(moduleIdResolver.resolveModule(id));
            };
            result.getStats = function () {
                return _this.getLoaderEvents();
            };
            result.__$__nodeRequire = global.nodeRequire;
            return result;
        };
        /**
         * Resolve a plugin dependency with the plugin loaded & complete
         * @param moduleId The module that has this dependency
         * @param dependencyId The semi-normalized dependency that appears in the module. e.g. 'vs/css!./mycssfile'. Only the plugin part (before !) is normalized
         * @param plugin The plugin (what the plugin exports)
         */
        ModuleManager.prototype._resolvePluginDependencySync = function (moduleId, dependencyId, plugin) {
            var _this = this;
            var m = this._modules[moduleId], moduleIdResolver = m.getModuleIdResolver(), bangIndex = dependencyId.indexOf('!'), pluginId = dependencyId.substring(0, bangIndex), pluginParam = dependencyId.substring(bangIndex + 1, dependencyId.length);
            // Helper to normalize the part which comes after '!'
            var normalize = function (_arg) {
                return moduleIdResolver.resolveModule(_arg);
            };
            if (typeof plugin.normalize === 'function') {
                pluginParam = plugin.normalize(pluginParam, normalize);
            }
            else {
                pluginParam = normalize(pluginParam);
            }
            if (!plugin.dynamic) {
                // Now normalize the entire dependency
                var oldDependencyId = dependencyId;
                dependencyId = pluginId + '!' + pluginParam;
                // Let the module know that the dependency has been normalized so it can update its internal state
                m.renameDependency(oldDependencyId, dependencyId);
                this._resolveDependency(moduleId, dependencyId, function (moduleId) {
                    // Delegate the loading of the resource to the plugin
                    var load = (function (value) {
                        _this.defineModule(dependencyId, [], value, null, null);
                    });
                    load.error = function (err) {
                        _this._config.onError({
                            errorCode: 'load',
                            moduleId: dependencyId,
                            neededBy: (_this._inverseDependencies[dependencyId] ? _this._inverseDependencies[dependencyId].slice(0) : []),
                            detail: err
                        });
                    };
                    plugin.load(pluginParam, _this._createRequire(moduleIdResolver), load, _this._config.getOptionsLiteral());
                });
            }
            else {
                // This plugin is dynamic and does not want the loader to cache anything on its behalf
                // Delegate the loading of the resource to the plugin
                var load = (function (value) {
                    m.resolveDependency(dependencyId, value);
                    if (m.isComplete()) {
                        _this._onModuleComplete(moduleId, m.getExports());
                    }
                });
                load.error = function (err) {
                    _this._config.onError({
                        errorCode: 'load',
                        moduleId: dependencyId,
                        neededBy: [moduleId],
                        detail: err
                    });
                };
                plugin.load(pluginParam, this._createRequire(moduleIdResolver), load, this._config.getOptionsLiteral());
            }
        };
        /**
         * Resolve a plugin dependency with the plugin not loaded or not complete yet
         * @param moduleId The module that has this dependency
         * @param dependencyId The semi-normalized dependency that appears in the module. e.g. 'vs/css!./mycssfile'. Only the plugin part (before !) is normalized
         */
        ModuleManager.prototype._resolvePluginDependencyAsync = function (moduleId, dependencyId) {
            var m = this._modules[moduleId], bangIndex = dependencyId.indexOf('!'), pluginId = dependencyId.substring(0, bangIndex);
            // Record dependency for when the plugin gets loaded
            this._inversePluginDependencies[pluginId] = this._inversePluginDependencies[pluginId] || [];
            this._inversePluginDependencies[pluginId].push({
                moduleId: moduleId,
                dependencyId: dependencyId
            });
            if (!this._modules.hasOwnProperty(pluginId) && !this._knownModules.hasOwnProperty(pluginId)) {
                // This is the first mention of module 'pluginId', so load it
                this._knownModules[pluginId] = true;
                this._loadModule(m.getModuleIdResolver(), pluginId);
            }
        };
        /**
         * Resolve a plugin dependency
         * @param moduleId The module that has this dependency
         * @param dependencyId The semi-normalized dependency that appears in the module. e.g. 'vs/css!./mycssfile'. Only the plugin part (before !) is normalized
         */
        ModuleManager.prototype._resolvePluginDependency = function (moduleId, dependencyId) {
            var bangIndex = dependencyId.indexOf('!'), pluginId = dependencyId.substring(0, bangIndex);
            if (this._modules.hasOwnProperty(pluginId) && this._modules[pluginId].isComplete()) {
                // Plugin has already been loaded & resolved
                this._resolvePluginDependencySync(moduleId, dependencyId, this._modules[pluginId].getExports());
            }
            else {
                // Plugin is not loaded or not resolved
                this._resolvePluginDependencyAsync(moduleId, dependencyId);
            }
        };
        /**
         * Resolve a module dependency to a shimmed module and delegate the loading to loadCallback.
         * @param moduleId The module that has this dependency
         * @param dependencyId The normalized dependency that appears in the module -- this module is shimmed
         * @param loadCallback Callback that will be called to trigger the loading of 'dependencyId' if needed
         */
        ModuleManager.prototype._resolveShimmedDependency = function (moduleId, dependencyId, loadCallback) {
            // If a shimmed module has dependencies, we must first load those dependencies
            // and only when those are loaded we can load the shimmed module.
            // To achieve this, we inject a module definition with those dependencies
            // and from its factory method we really load the shimmed module.
            var defineInfo = this._config.getShimmedModuleDefine(dependencyId);
            if (defineInfo.dependencies.length > 0) {
                this.defineModule(Utilities.generateAnonymousModule(), defineInfo.dependencies, function () { return loadCallback(dependencyId); }, null, null, new ModuleIdResolver(this._config, dependencyId));
            }
            else {
                loadCallback(dependencyId);
            }
        };
        /**
         * Resolve a module dependency and delegate the loading to loadCallback
         * @param moduleId The module that has this dependency
         * @param dependencyId The normalized dependency that appears in the module
         * @param loadCallback Callback that will be called to trigger the loading of 'dependencyId' if needed
         */
        ModuleManager.prototype._resolveDependency = function (moduleId, dependencyId, loadCallback) {
            var m = this._modules[moduleId];
            if (this._modules.hasOwnProperty(dependencyId) && this._modules[dependencyId].isComplete()) {
                // Dependency has already been loaded & resolved
                m.resolveDependency(dependencyId, this._modules[dependencyId].getExports());
            }
            else {
                // Dependency is not loaded or not resolved
                // Record dependency
                this._dependencies[moduleId].push(dependencyId);
                if (this._hasDependencyPath(dependencyId, moduleId)) {
                    console.warn('There is a dependency cycle between \'' + dependencyId + '\' and \'' + moduleId + '\'. The cyclic path follows:');
                    var cyclePath = this._findCyclePath(dependencyId, moduleId, 0);
                    cyclePath.reverse();
                    cyclePath.push(dependencyId);
                    console.warn(cyclePath.join(' => \n'));
                    // Break the cycle
                    var dependency = this._modules.hasOwnProperty(dependencyId) ? this._modules[dependencyId] : null;
                    var dependencyValue;
                    if (dependency && dependency.isExportsPassedIn()) {
                        // If dependency uses 'exports', then resolve it with that object
                        dependencyValue = dependency.getExports();
                    }
                    // Resolve dependency with undefined or with 'exports' object
                    m.resolveDependency(dependencyId, dependencyValue);
                }
                else {
                    // Since we are actually waiting for this dependency,
                    // record inverse dependency
                    this._inverseDependencies[dependencyId] = this._inverseDependencies[dependencyId] || [];
                    this._inverseDependencies[dependencyId].push(moduleId);
                    if (!this._modules.hasOwnProperty(dependencyId) && !this._knownModules.hasOwnProperty(dependencyId)) {
                        // This is the first mention of module 'dependencyId', so load it
                        // Mark this module as loaded so we don't hit this case again
                        this._knownModules[dependencyId] = true;
                        if (this._config.isShimmed(dependencyId)) {
                            this._resolveShimmedDependency(moduleId, dependencyId, loadCallback);
                        }
                        else {
                            loadCallback(dependencyId);
                        }
                    }
                }
            }
        };
        ModuleManager.prototype._loadModule = function (anyModuleIdResolver, moduleId) {
            var _this = this;
            this._loadingScriptsCount++;
            var paths = anyModuleIdResolver.moduleIdToPaths(moduleId);
            var lastPathIndex = -1;
            var loadNextPath = function (err) {
                lastPathIndex++;
                if (lastPathIndex >= paths.length) {
                    // No more paths to try
                    _this._onLoadError(moduleId, err);
                }
                else {
                    var currentPath = paths[lastPathIndex];
                    var recorder = _this.getRecorder();
                    if (_this._config.isBuild() && currentPath === 'empty:') {
                        _this._resolvedScriptPaths[moduleId] = currentPath;
                        _this.enqueueDefineModule(moduleId, [], null);
                        _this._onLoad(moduleId);
                        return;
                    }
                    recorder.record(LoaderEventType.BeginLoadingScript, currentPath);
                    _this._scriptLoader.load(currentPath, function () {
                        if (_this._config.isBuild()) {
                            _this._resolvedScriptPaths[moduleId] = currentPath;
                        }
                        recorder.record(LoaderEventType.EndLoadingScriptOK, currentPath);
                        _this._onLoad(moduleId);
                    }, function (err) {
                        recorder.record(LoaderEventType.EndLoadingScriptError, currentPath);
                        loadNextPath(err);
                    }, recorder);
                }
            };
            loadNextPath(null);
        };
        /**
         * Examine the dependencies of module 'module' and resolve them as needed.
         */
        ModuleManager.prototype._resolve = function (m) {
            var _this = this;
            var i, len, id, dependencies, dependencyId, moduleIdResolver;
            id = m.getId();
            dependencies = m.getDependencies();
            moduleIdResolver = m.getModuleIdResolver();
            this._dependencies[id] = [];
            var loadCallback = function (moduleId) { return _this._loadModule(moduleIdResolver, moduleId); };
            for (i = 0, len = dependencies.length; i < len; i++) {
                dependencyId = dependencies[i];
                if (dependencyId === 'require') {
                    m.resolveDependency(dependencyId, this._createRequire(moduleIdResolver));
                    continue;
                }
                else {
                    if (dependencyId.indexOf('!') >= 0) {
                        this._resolvePluginDependency(id, dependencyId);
                    }
                    else {
                        this._resolveDependency(id, dependencyId, loadCallback);
                    }
                }
            }
            if (m.isComplete()) {
                // This module was completed as soon as its been seen.
                this._onModuleComplete(id, m.getExports());
            }
        };
        return ModuleManager;
    })();
    AMDLoader.ModuleManager = ModuleManager;
    /**
     * Load `scriptSrc` only once (avoid multiple <script> tags)
     */
    var OnlyOnceScriptLoader = (function () {
        function OnlyOnceScriptLoader(actualScriptLoader) {
            this.actualScriptLoader = actualScriptLoader;
            this.callbackMap = {};
        }
        OnlyOnceScriptLoader.prototype.setModuleManager = function (moduleManager) {
            this.actualScriptLoader.setModuleManager(moduleManager);
        };
        OnlyOnceScriptLoader.prototype.load = function (scriptSrc, callback, errorback, recorder) {
            var _this = this;
            var scriptCallbacks = {
                callback: callback,
                errorback: errorback
            };
            if (this.callbackMap.hasOwnProperty(scriptSrc)) {
                this.callbackMap[scriptSrc].push(scriptCallbacks);
                return;
            }
            this.callbackMap[scriptSrc] = [scriptCallbacks];
            this.actualScriptLoader.load(scriptSrc, function () { return _this.triggerCallback(scriptSrc); }, function (err) { return _this.triggerErrorback(scriptSrc, err); }, recorder);
        };
        OnlyOnceScriptLoader.prototype.triggerCallback = function (scriptSrc) {
            var scriptCallbacks = this.callbackMap[scriptSrc];
            delete this.callbackMap[scriptSrc];
            for (var i = 0; i < scriptCallbacks.length; i++) {
                scriptCallbacks[i].callback();
            }
        };
        OnlyOnceScriptLoader.prototype.triggerErrorback = function (scriptSrc, err) {
            var scriptCallbacks = this.callbackMap[scriptSrc];
            delete this.callbackMap[scriptSrc];
            for (var i = 0; i < scriptCallbacks.length; i++) {
                scriptCallbacks[i].errorback(err);
            }
        };
        return OnlyOnceScriptLoader;
    })();
    var BrowserScriptLoader = (function () {
        function BrowserScriptLoader() {
        }
        /**
         * Attach load / error listeners to a script element and remove them when either one has fired.
         * Implemented for browssers supporting 'onreadystatechange' events, such as IE8 or IE9
         */
        BrowserScriptLoader.prototype.attachListenersV1 = function (script, callback, errorback) {
            var unbind = function () {
                script.detachEvent('onreadystatechange', loadEventListener);
                if (script.addEventListener) {
                    script.removeEventListener('error', errorEventListener);
                }
            };
            var loadEventListener = function (e) {
                if (script.readyState === 'loaded' || script.readyState === 'complete') {
                    unbind();
                    callback();
                }
            };
            var errorEventListener = function (e) {
                unbind();
                errorback(e);
            };
            script.attachEvent('onreadystatechange', loadEventListener);
            if (script.addEventListener) {
                script.addEventListener('error', errorEventListener);
            }
        };
        /**
         * Attach load / error listeners to a script element and remove them when either one has fired.
         * Implemented for browssers supporting HTML5 standard 'load' and 'error' events.
         */
        BrowserScriptLoader.prototype.attachListenersV2 = function (script, callback, errorback) {
            var unbind = function () {
                script.removeEventListener('load', loadEventListener);
                script.removeEventListener('error', errorEventListener);
            };
            var loadEventListener = function (e) {
                unbind();
                callback();
            };
            var errorEventListener = function (e) {
                unbind();
                errorback(e);
            };
            script.addEventListener('load', loadEventListener);
            script.addEventListener('error', errorEventListener);
        };
        BrowserScriptLoader.prototype.setModuleManager = function (moduleManager) {
            /* Intentional empty */
        };
        BrowserScriptLoader.prototype.load = function (scriptSrc, callback, errorback) {
            var script = document.createElement('script');
            script.setAttribute('async', 'async');
            script.setAttribute('type', 'text/javascript');
            if (global.attachEvent) {
                this.attachListenersV1(script, callback, errorback);
            }
            else {
                this.attachListenersV2(script, callback, errorback);
            }
            script.setAttribute('src', scriptSrc);
            document.getElementsByTagName('head')[0].appendChild(script);
        };
        return BrowserScriptLoader;
    })();
    var WorkerScriptLoader = (function () {
        function WorkerScriptLoader() {
            this.loadCalls = [];
            this.loadTimeout = -1;
        }
        WorkerScriptLoader.prototype.setModuleManager = function (moduleManager) {
            /* Intentional empty */
        };
        WorkerScriptLoader.prototype.load = function (scriptSrc, callback, errorback) {
            var _this = this;
            this.loadCalls.push({
                scriptSrc: scriptSrc,
                callback: callback,
                errorback: errorback
            });
            if (navigator.userAgent.indexOf('Firefox') >= 0) {
                // Firefox fails installing the timer every now and then :(
                this._load();
            }
            else {
                if (this.loadTimeout === -1) {
                    this.loadTimeout = setTimeout(function () {
                        _this.loadTimeout = -1;
                        _this._load();
                    }, 0);
                }
            }
        };
        WorkerScriptLoader.prototype._load = function () {
            var loadCalls = this.loadCalls;
            this.loadCalls = [];
            var i, len = loadCalls.length, scripts = [];
            for (i = 0; i < len; i++) {
                scripts.push(loadCalls[i].scriptSrc);
            }
            var errorOccured = false;
            try {
                importScripts.apply(null, scripts);
            }
            catch (e) {
                errorOccured = true;
                for (i = 0; i < len; i++) {
                    loadCalls[i].errorback(e);
                }
            }
            if (!errorOccured) {
                for (i = 0; i < len; i++) {
                    loadCalls[i].callback();
                }
            }
        };
        return WorkerScriptLoader;
    })();
    var NodeScriptLoader = (function () {
        function NodeScriptLoader() {
            this._initialized = false;
        }
        NodeScriptLoader.prototype.setModuleManager = function (moduleManager) {
            this._moduleManager = moduleManager;
        };
        NodeScriptLoader.prototype._init = function (nodeRequire) {
            if (this._initialized) {
                return;
            }
            this._initialized = true;
            this._fs = nodeRequire('fs');
            this._vm = nodeRequire('vm');
            this._path = nodeRequire('path');
        };
        NodeScriptLoader.prototype.load = function (scriptSrc, callback, errorback, recorder) {
            var _this = this;
            var opts = this._moduleManager.getConfigurationOptions();
            var nodeRequire = (opts.nodeRequire || global.nodeRequire);
            var nodeInstrumenter = (opts.nodeInstrumenter || function (c) { return c; });
            this._init(nodeRequire);
            if (/^node\|/.test(scriptSrc)) {
                var pieces = scriptSrc.split('|');
                var moduleExports = null;
                try {
                    recorder.record(LoaderEventType.NodeBeginNativeRequire, pieces[2]);
                    moduleExports = nodeRequire(pieces[2]);
                }
                catch (err) {
                    recorder.record(LoaderEventType.NodeEndNativeRequire, pieces[2]);
                    errorback(err);
                    return;
                }
                recorder.record(LoaderEventType.NodeEndNativeRequire, pieces[2]);
                this._moduleManager.enqueueDefineAnonymousModule([], function () { return moduleExports; });
                callback();
            }
            else {
                scriptSrc = Utilities.fileUriToFilePath(scriptSrc);
                this._fs.readFile(scriptSrc, { encoding: 'utf8' }, function (err, data) {
                    if (err) {
                        errorback(err);
                        return;
                    }
                    recorder.record(LoaderEventType.NodeBeginEvaluatingScript, scriptSrc);
                    var vmScriptSrc = _this._path.normalize(scriptSrc);
                    // Make the script src friendly towards electron
                    if (isElectronRenderer) {
                        var driveLetterMatch = vmScriptSrc.match(/^([a-z])\:(.*)/);
                        if (driveLetterMatch) {
                            vmScriptSrc = driveLetterMatch[1].toUpperCase() + ':' + driveLetterMatch[2];
                        }
                        vmScriptSrc = 'file:///' + vmScriptSrc.replace(/\\/g, '/');
                    }
                    var contents, prefix = '(function (require, define, __filename, __dirname) { ', suffix = '\n});';
                    if (data.charCodeAt(0) === NodeScriptLoader._BOM) {
                        contents = prefix + data.substring(1) + suffix;
                    }
                    else {
                        contents = prefix + data + suffix;
                    }
                    contents = nodeInstrumenter(contents, vmScriptSrc);
                    var r;
                    if (/^v0\.12/.test(process.version)) {
                        r = _this._vm.runInThisContext(contents, { filename: vmScriptSrc });
                    }
                    else {
                        r = _this._vm.runInThisContext(contents, vmScriptSrc);
                    }
                    r.call(global, RequireFunc, DefineFunc, vmScriptSrc, _this._path.dirname(scriptSrc));
                    recorder.record(LoaderEventType.NodeEndEvaluatingScript, scriptSrc);
                    callback();
                });
            }
        };
        NodeScriptLoader._BOM = 0xFEFF;
        return NodeScriptLoader;
    })();
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // define
    var DefineFunc = (function () {
        function DefineFunc(id, dependencies, callback) {
            if (typeof id !== 'string') {
                callback = dependencies;
                dependencies = id;
                id = null;
            }
            if (typeof dependencies !== 'object' || !Utilities.isArray(dependencies)) {
                callback = dependencies;
                dependencies = null;
            }
            if (!dependencies) {
                dependencies = ['require', 'exports', 'module'];
            }
            if (id) {
                moduleManager.enqueueDefineModule(id, dependencies, callback);
            }
            else {
                moduleManager.enqueueDefineAnonymousModule(dependencies, callback);
            }
        }
        DefineFunc.amd = {
            jQuery: true
        };
        return DefineFunc;
    })();
    var RequireFunc = (function () {
        function RequireFunc() {
            if (arguments.length === 1) {
                if ((arguments[0] instanceof Object) && !Utilities.isArray(arguments[0])) {
                    RequireFunc.config(arguments[0]);
                    return;
                }
                if (typeof arguments[0] === 'string') {
                    return moduleManager.synchronousRequire(arguments[0]);
                }
            }
            if (arguments.length === 2 || arguments.length === 3) {
                if (Utilities.isArray(arguments[0])) {
                    moduleManager.defineModule(Utilities.generateAnonymousModule(), arguments[0], arguments[1], arguments[2], null);
                    return;
                }
            }
            throw new Error('Unrecognized require call');
        }
        RequireFunc.config = function (params, shouldOverwrite) {
            if (shouldOverwrite === void 0) { shouldOverwrite = false; }
            moduleManager.configure(params, shouldOverwrite);
        };
        RequireFunc.getConfig = function () {
            return moduleManager.getConfigurationOptions();
        };
        /**
         * Non standard extension to reset completely the loader state. This is used for running amdjs tests
         */
        RequireFunc.reset = function () {
            moduleManager = new ModuleManager(scriptLoader);
            scriptLoader.setModuleManager(moduleManager);
        };
        /**
         * Non standard extension to fetch loader state for building purposes.
         */
        RequireFunc.getBuildInfo = function () {
            return moduleManager.getBuildInfo();
        };
        /**
         * Non standard extension to fetch loader events
         */
        RequireFunc.getStats = function () {
            return moduleManager.getLoaderEvents();
        };
        return RequireFunc;
    })();
    var global = _amdLoaderGlobal, hasPerformanceNow = (global.performance && typeof global.performance.now === 'function'), isWebWorker, isElectronRenderer, isElectronMain, isNode, scriptLoader, moduleManager, loaderAvailableTimestamp;
    function initVars() {
        isWebWorker = (typeof global.importScripts === 'function');
        isElectronRenderer = (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions['electron'] !== 'undefined' && process.type === 'renderer');
        isElectronMain = (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions['electron'] !== 'undefined' && process.type === 'browser');
        isNode = (typeof module !== 'undefined' && !!module.exports);
        if (isWebWorker) {
            scriptLoader = new OnlyOnceScriptLoader(new WorkerScriptLoader());
        }
        else if (isNode) {
            scriptLoader = new OnlyOnceScriptLoader(new NodeScriptLoader());
        }
        else {
            scriptLoader = new OnlyOnceScriptLoader(new BrowserScriptLoader());
        }
        moduleManager = new ModuleManager(scriptLoader);
        scriptLoader.setModuleManager(moduleManager);
    }
    function initConsole() {
        // Define used console.* functions, in order to not fail in environments where they are not available
        if (!isNode) {
            if (!global.console) {
                global.console = {};
            }
            if (!global.console.log) {
                global.console.log = function () { };
            }
            if (!global.console.warn) {
                global.console.warn = global.console.log;
            }
            if (!global.console.error) {
                global.console.error = global.console.log;
            }
        }
    }
    function initMainScript() {
        if (!isWebWorker && !isNode) {
            window.onload = function () {
                var i, len, main, scripts = document.getElementsByTagName('script');
                // Look through all the scripts for the data-main attribute
                for (i = 0, len = scripts.length; i < len; i++) {
                    main = scripts[i].getAttribute('data-main');
                    if (main) {
                        break;
                    }
                }
                // Load the main script
                if (main) {
                    moduleManager.defineModule(Utilities.generateAnonymousModule(), [main], null, null, null, new ModuleIdResolver(new Configuration(), ''));
                }
            };
        }
    }
    function init() {
        initVars();
        initConsole();
        initMainScript();
        if (isNode) {
            var _nodeRequire = (global.require || require);
            var nodeRequire = function (what) {
                moduleManager.getRecorder().record(LoaderEventType.NodeBeginNativeRequire, what);
                var r = _nodeRequire(what);
                moduleManager.getRecorder().record(LoaderEventType.NodeEndNativeRequire, what);
                return r;
            };
            global.nodeRequire = nodeRequire;
            RequireFunc.nodeRequire = nodeRequire;
        }
        if (isNode && !isElectronRenderer) {
            module.exports = RequireFunc;
            // These two defs are fore the local closure defined in node in the case that the loader is concatenated
            define = function () {
                DefineFunc.apply(null, arguments);
            };
            require = RequireFunc;
        }
        else {
            // The global variable require can configure the loader
            if (typeof global.require !== 'undefined' && typeof global.require !== 'function') {
                RequireFunc.config(global.require);
            }
            if (!isElectronRenderer) {
                global.define = DefineFunc;
            }
            else {
                define = function () {
                    DefineFunc.apply(null, arguments);
                };
            }
            global.require = RequireFunc;
            global.require.__$__nodeRequire = nodeRequire;
        }
    }
    if (typeof global.define !== 'function' || !global.define.amd) {
        init();
        loaderAvailableTimestamp = getHighPerformanceTimestamp();
    }
})(AMDLoader || (AMDLoader = {}));
