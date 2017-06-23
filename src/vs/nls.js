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
'use strict';
var NLSLoaderPlugin;
(function (NLSLoaderPlugin) {
    var Environment = (function () {
        function Environment(isPseudo) {
            this.isPseudo = isPseudo;
            //
        }
        Environment.detect = function () {
            var isPseudo = (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);
            return new Environment(isPseudo);
        };
        return Environment;
    }());
    function _format(message, args, env) {
        var result;
        if (args.length === 0) {
            result = message;
        }
        else {
            result = message.replace(/\{(\d+)\}/g, function (match, rest) {
                var index = rest[0];
                return typeof args[index] !== 'undefined' ? args[index] : match;
            });
        }
        if (env.isPseudo) {
            // FF3B and FF3D is the Unicode zenkaku representation for [ and ]
            result = '\uFF3B' + result.replace(/[aouei]/g, '$&$&') + '\uFF3D';
        }
        return result;
    }
    function findLanguageForModule(config, name) {
        var result = config[name];
        if (result)
            return result;
        result = config['*'];
        if (result)
            return result;
        return null;
    }
    function localize(data, message, env) {
        var args = [];
        for (var _i = 0; _i < (arguments.length - 2); _i++) {
            args[_i] = arguments[_i + 2];
        }
        return _format(message, args, env);
    }
    function createScopedLocalize(scope, env) {
        return function (idx, defaultValue) {
            var restArgs = Array.prototype.slice.call(arguments, 2);
            return _format(scope[idx], restArgs, env);
        };
    }
    var NLSPlugin = (function () {
        function NLSPlugin(env) {
            var _this = this;
            this._env = env;
            this.localize = function (data, message) { return localize(data, message, _this._env); };
        }
        NLSPlugin.prototype.setPseudoTranslation = function (value) {
            this._env = new Environment(value);
        };
        NLSPlugin.prototype.create = function (key, data) {
            return {
                localize: createScopedLocalize(data[key], this._env)
            };
        };
        NLSPlugin.prototype.load = function (name, req, load, config) {
            var _this = this;
            config = config || {};
            if (!name || name.length === 0) {
                load({
                    localize: localize
                });
            }
            else {
                var pluginConfig = config['vs/nls'] || {};
                var language = pluginConfig.availableLanguages ? findLanguageForModule(pluginConfig.availableLanguages, name) : null;
                var suffix = '.nls';
                if (language !== null && language !== NLSPlugin.DEFAULT_TAG) {
                    suffix = suffix + '.' + language;
                }
                req([name + suffix], function (messages) {
                    if (Array.isArray(messages)) {
                        messages.localize = createScopedLocalize(messages, _this._env);
                    }
                    else {
                        messages.localize = createScopedLocalize(messages[name], _this._env);
                    }
                    load(messages);
                });
            }
        };
        return NLSPlugin;
    }());
    NLSPlugin.DEFAULT_TAG = 'i-default';
    NLSLoaderPlugin.NLSPlugin = NLSPlugin;
    function init() {
        define('vs/nls', new NLSPlugin(Environment.detect()));
    }
    NLSLoaderPlugin.init = init;
    if (typeof doNotInitLoader === 'undefined') {
        init();
    }
})(NLSLoaderPlugin || (NLSLoaderPlugin = {}));
