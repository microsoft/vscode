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
/// <reference path="loader.ts" />
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var _cssPluginGlobal = this;
var CSSLoaderPlugin;
(function (CSSLoaderPlugin) {
    var global = _cssPluginGlobal;
    /**
     * Known issue:
     * - In IE there is no way to know if the CSS file loaded successfully or not.
     */
    var BrowserCSSLoader = (function () {
        function BrowserCSSLoader() {
            this._pendingLoads = 0;
        }
        BrowserCSSLoader.prototype.attachListeners = function (name, linkNode, callback, errorback) {
            var unbind = function () {
                linkNode.removeEventListener('load', loadEventListener);
                linkNode.removeEventListener('error', errorEventListener);
            };
            var loadEventListener = function (e) {
                unbind();
                callback();
            };
            var errorEventListener = function (e) {
                unbind();
                errorback(e);
            };
            linkNode.addEventListener('load', loadEventListener);
            linkNode.addEventListener('error', errorEventListener);
        };
        BrowserCSSLoader.prototype._onLoad = function (name, callback) {
            this._pendingLoads--;
            callback();
        };
        BrowserCSSLoader.prototype._onLoadError = function (name, errorback, err) {
            this._pendingLoads--;
            errorback(err);
        };
        BrowserCSSLoader.prototype._insertLinkNode = function (linkNode) {
            this._pendingLoads++;
            var head = document.head || document.getElementsByTagName('head')[0];
            var other = head.getElementsByTagName('link') || document.head.getElementsByTagName('script');
            if (other.length > 0) {
                head.insertBefore(linkNode, other[other.length - 1]);
            }
            else {
                head.appendChild(linkNode);
            }
        };
        BrowserCSSLoader.prototype.createLinkTag = function (name, cssUrl, externalCallback, externalErrorback) {
            var _this = this;
            var linkNode = document.createElement('link');
            linkNode.setAttribute('rel', 'stylesheet');
            linkNode.setAttribute('type', 'text/css');
            linkNode.setAttribute('data-name', name);
            var callback = function () { return _this._onLoad(name, externalCallback); };
            var errorback = function (err) { return _this._onLoadError(name, externalErrorback, err); };
            this.attachListeners(name, linkNode, callback, errorback);
            linkNode.setAttribute('href', cssUrl);
            return linkNode;
        };
        BrowserCSSLoader.prototype._linkTagExists = function (name, cssUrl) {
            var i, len, nameAttr, hrefAttr, links = document.getElementsByTagName('link');
            for (i = 0, len = links.length; i < len; i++) {
                nameAttr = links[i].getAttribute('data-name');
                hrefAttr = links[i].getAttribute('href');
                if (nameAttr === name || hrefAttr === cssUrl) {
                    return true;
                }
            }
            return false;
        };
        BrowserCSSLoader.prototype.load = function (name, cssUrl, externalCallback, externalErrorback) {
            if (this._linkTagExists(name, cssUrl)) {
                externalCallback();
                return;
            }
            var linkNode = this.createLinkTag(name, cssUrl, externalCallback, externalErrorback);
            this._insertLinkNode(linkNode);
        };
        return BrowserCSSLoader;
    })();
    /**
     * Prior to IE10, IE could not go above 31 stylesheets in a page
     * http://blogs.msdn.com/b/ieinternals/archive/2011/05/14/internet-explorer-stylesheet-rule-selector-import-sheet-limit-maximum.aspx
     *
     * The general strategy here is to not write more than 31 link nodes to the page at the same time
     * When stylesheets get loaded, they will get merged one into another to free up
     * some positions for new link nodes.
     */
    var IE9CSSLoader = (function (_super) {
        __extends(IE9CSSLoader, _super);
        function IE9CSSLoader() {
            _super.call(this);
            this._blockedLoads = [];
            this._mergeStyleSheetsTimeout = -1;
        }
        IE9CSSLoader.prototype.load = function (name, cssUrl, externalCallback, externalErrorback) {
            if (this._linkTagExists(name, cssUrl)) {
                externalCallback();
                return;
            }
            var linkNode = this.createLinkTag(name, cssUrl, externalCallback, externalErrorback);
            if (this._styleSheetCount() < 31) {
                this._insertLinkNode(linkNode);
            }
            else {
                this._blockedLoads.push(linkNode);
                this._handleBlocked();
            }
        };
        IE9CSSLoader.prototype._styleSheetCount = function () {
            var linkCount = document.getElementsByTagName('link').length;
            var styleCount = document.getElementsByTagName('style').length;
            return linkCount + styleCount;
        };
        IE9CSSLoader.prototype._onLoad = function (name, callback) {
            _super.prototype._onLoad.call(this, name, callback);
            this._handleBlocked();
        };
        IE9CSSLoader.prototype._onLoadError = function (name, errorback, err) {
            _super.prototype._onLoadError.call(this, name, errorback, err);
            this._handleBlocked();
        };
        IE9CSSLoader.prototype._handleBlocked = function () {
            var _this = this;
            var blockedLoadsCount = this._blockedLoads.length;
            if (blockedLoadsCount > 0 && this._mergeStyleSheetsTimeout === -1) {
                this._mergeStyleSheetsTimeout = window.setTimeout(function () { return _this._mergeStyleSheets(); }, 0);
            }
        };
        IE9CSSLoader.prototype._mergeStyleSheet = function (dstPath, dst, srcPath, src) {
            for (var i = src.rules.length - 1; i >= 0; i--) {
                dst.insertRule(Utilities.rewriteUrls(srcPath, dstPath, src.rules[i].cssText), 0);
            }
        };
        IE9CSSLoader.prototype._asIE9HTMLLinkElement = function (linkElement) {
            return linkElement;
        };
        IE9CSSLoader.prototype._mergeStyleSheets = function () {
            this._mergeStyleSheetsTimeout = -1;
            var blockedLoadsCount = this._blockedLoads.length;
            var i, linkDomNodes = document.getElementsByTagName('link');
            var linkDomNodesCount = linkDomNodes.length;
            var mergeCandidates = [];
            for (i = 0; i < linkDomNodesCount; i++) {
                if (linkDomNodes[i].readyState === 'loaded' || linkDomNodes[i].readyState === 'complete') {
                    mergeCandidates.push({
                        linkNode: linkDomNodes[i],
                        rulesLength: this._asIE9HTMLLinkElement(linkDomNodes[i]).styleSheet.rules.length
                    });
                }
            }
            var mergeCandidatesCount = mergeCandidates.length;
            // Just a little legend here :)
            // - linkDomNodesCount: total number of link nodes in the DOM (this should be kept <= 31)
            // - mergeCandidatesCount: loaded (finished) link nodes in the DOM (only these can be merged)
            // - blockedLoadsCount: remaining number of load requests that did not fit in before (because of the <= 31 constraint)
            // Now comes the heuristic part, we don't want to do too much work with the merging of styles,
            // but we do need to merge stylesheets to free up loading slots.
            var mergeCount = Math.min(Math.floor(mergeCandidatesCount / 2), blockedLoadsCount);
            // Sort the merge candidates descending (least rules last)
            mergeCandidates.sort(function (a, b) {
                return b.rulesLength - a.rulesLength;
            });
            var srcIndex, dstIndex;
            for (i = 0; i < mergeCount; i++) {
                srcIndex = mergeCandidates.length - 1 - i;
                dstIndex = i % (mergeCandidates.length - mergeCount);
                // Merge rules of src into dst
                this._mergeStyleSheet(mergeCandidates[dstIndex].linkNode.href, this._asIE9HTMLLinkElement(mergeCandidates[dstIndex].linkNode).styleSheet, mergeCandidates[srcIndex].linkNode.href, this._asIE9HTMLLinkElement(mergeCandidates[srcIndex].linkNode).styleSheet);
                // Remove dom node of src
                mergeCandidates[srcIndex].linkNode.parentNode.removeChild(mergeCandidates[srcIndex].linkNode);
                linkDomNodesCount--;
            }
            var styleSheetCount = this._styleSheetCount();
            while (styleSheetCount < 31 && this._blockedLoads.length > 0) {
                this._insertLinkNode(this._blockedLoads.shift());
                styleSheetCount++;
            }
        };
        return IE9CSSLoader;
    })(BrowserCSSLoader);
    var IE8CSSLoader = (function (_super) {
        __extends(IE8CSSLoader, _super);
        function IE8CSSLoader() {
            _super.call(this);
        }
        IE8CSSLoader.prototype.attachListeners = function (name, linkNode, callback, errorback) {
            linkNode.onload = function () {
                linkNode.onload = null;
                callback();
            };
        };
        return IE8CSSLoader;
    })(IE9CSSLoader);
    var NodeCSSLoader = (function () {
        function NodeCSSLoader() {
            this.fs = require.nodeRequire('fs');
        }
        NodeCSSLoader.prototype.load = function (name, cssUrl, externalCallback, externalErrorback) {
            var contents = this.fs.readFileSync(cssUrl, 'utf8');
            // Remove BOM
            if (contents.charCodeAt(0) === NodeCSSLoader.BOM_CHAR_CODE) {
                contents = contents.substring(1);
            }
            externalCallback(contents);
        };
        NodeCSSLoader.BOM_CHAR_CODE = 65279;
        return NodeCSSLoader;
    })();
    // ------------------------------ Finally, the plugin
    var CSSPlugin = (function () {
        function CSSPlugin(cssLoader) {
            this.cssLoader = cssLoader;
        }
        CSSPlugin.prototype.load = function (name, req, load, config) {
            config = config || {};
            var cssUrl = req.toUrl(name + '.css');
            this.cssLoader.load(name, cssUrl, function (contents) {
                // Contents has the CSS file contents if we are in a build
                if (config.isBuild) {
                    CSSPlugin.BUILD_MAP[name] = contents;
                }
                load({});
            }, function (err) {
                if (typeof load.error === 'function') {
                    load.error('Could not find ' + cssUrl + ' or it was empty');
                }
            });
        };
        CSSPlugin.prototype.write = function (pluginName, moduleName, write) {
            // getEntryPoint is a Monaco extension to r.js
            var entryPoint = write.getEntryPoint();
            // r.js destroys the context of this plugin between calling 'write' and 'writeFile'
            // so the only option at this point is to leak the data to a global
            global.cssPluginEntryPoints = global.cssPluginEntryPoints || {};
            global.cssPluginEntryPoints[entryPoint] = global.cssPluginEntryPoints[entryPoint] || [];
            global.cssPluginEntryPoints[entryPoint].push({
                moduleName: moduleName,
                contents: CSSPlugin.BUILD_MAP[moduleName]
            });
            write.asModule(pluginName + '!' + moduleName, 'define([\'vs/css!' + entryPoint + '\'], {});');
        };
        CSSPlugin.prototype.writeFile = function (pluginName, moduleName, req, write, config) {
            if (global.cssPluginEntryPoints && global.cssPluginEntryPoints.hasOwnProperty(moduleName)) {
                var fileName = req.toUrl(moduleName + '.css');
                var contents = [
                    '/*---------------------------------------------------------',
                    ' * Copyright (C) Microsoft Corporation. All rights reserved.',
                    ' *--------------------------------------------------------*/'
                ], entries = global.cssPluginEntryPoints[moduleName];
                for (var i = 0; i < entries.length; i++) {
                    contents.push(Utilities.rewriteUrls(entries[i].moduleName, moduleName, entries[i].contents));
                }
                write(fileName, contents.join('\r\n'));
            }
        };
        CSSPlugin.BUILD_MAP = {};
        return CSSPlugin;
    })();
    CSSLoaderPlugin.CSSPlugin = CSSPlugin;
    var Utilities = (function () {
        function Utilities() {
        }
        Utilities.startsWith = function (haystack, needle) {
            return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
        };
        /**
         * Find the path of a file.
         */
        Utilities.pathOf = function (filename) {
            var lastSlash = filename.lastIndexOf('/');
            if (lastSlash !== -1) {
                return filename.substr(0, lastSlash + 1);
            }
            else {
                return '';
            }
        };
        /**
         * A conceptual a + b for paths.
         * Takes into account if `a` contains a protocol.
         * Also normalizes the result: e.g.: a/b/ + ../c => a/c
         */
        Utilities.joinPaths = function (a, b) {
            function findSlashIndexAfterPrefix(haystack, prefix) {
                if (Utilities.startsWith(haystack, prefix)) {
                    return Math.max(prefix.length, haystack.indexOf('/', prefix.length));
                }
                return 0;
            }
            var aPathStartIndex = 0;
            aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, '//');
            aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, 'http://');
            aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, 'https://');
            function pushPiece(pieces, piece) {
                if (piece === './') {
                    // Ignore
                    return;
                }
                if (piece === '../') {
                    var prevPiece = (pieces.length > 0 ? pieces[pieces.length - 1] : null);
                    if (prevPiece && prevPiece === '/') {
                        // Ignore
                        return;
                    }
                    if (prevPiece && prevPiece !== '../') {
                        // Pop
                        pieces.pop();
                        return;
                    }
                }
                // Push
                pieces.push(piece);
            }
            function push(pieces, path) {
                while (path.length > 0) {
                    var slashIndex = path.indexOf('/');
                    var piece = (slashIndex >= 0 ? path.substring(0, slashIndex + 1) : path);
                    path = (slashIndex >= 0 ? path.substring(slashIndex + 1) : '');
                    pushPiece(pieces, piece);
                }
            }
            var pieces = [];
            push(pieces, a.substr(aPathStartIndex));
            if (b.length > 0 && b.charAt(0) === '/') {
                pieces = [];
            }
            push(pieces, b);
            return a.substring(0, aPathStartIndex) + pieces.join('');
        };
        Utilities.commonPrefix = function (str1, str2) {
            var len = Math.min(str1.length, str2.length);
            for (var i = 0; i < len; i++) {
                if (str1.charCodeAt(i) !== str2.charCodeAt(i)) {
                    break;
                }
            }
            return str1.substring(0, i);
        };
        Utilities.commonFolderPrefix = function (fromPath, toPath) {
            var prefix = Utilities.commonPrefix(fromPath, toPath);
            var slashIndex = prefix.lastIndexOf('/');
            if (slashIndex === -1) {
                return '';
            }
            return prefix.substring(0, slashIndex + 1);
        };
        Utilities.relativePath = function (fromPath, toPath) {
            if (Utilities.startsWith(toPath, '/') || Utilities.startsWith(toPath, 'http://') || Utilities.startsWith(toPath, 'https://')) {
                return toPath;
            }
            // Ignore common folder prefix
            var prefix = Utilities.commonFolderPrefix(fromPath, toPath);
            fromPath = fromPath.substr(prefix.length);
            toPath = toPath.substr(prefix.length);
            var upCount = fromPath.split('/').length;
            var result = '';
            for (var i = 1; i < upCount; i++) {
                result += '../';
            }
            return result + toPath;
        };
        Utilities.rewriteUrls = function (originalFile, newFile, contents) {
            // Use ")" as the terminator as quotes are oftentimes not used at all
            return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, function (_) {
                var matches = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    matches[_i - 1] = arguments[_i];
                }
                var url = matches[0];
                // Eliminate starting quotes (the initial whitespace is not captured)
                if (url.charAt(0) === '"' || url.charAt(0) === '\'') {
                    url = url.substring(1);
                }
                // The ending whitespace is captured
                while (url.length > 0 && (url.charAt(url.length - 1) === ' ' || url.charAt(url.length - 1) === '\t')) {
                    url = url.substring(0, url.length - 1);
                }
                // Eliminate ending quotes
                if (url.charAt(url.length - 1) === '"' || url.charAt(url.length - 1) === '\'') {
                    url = url.substring(0, url.length - 1);
                }
                if (!Utilities.startsWith(url, 'data:') && !Utilities.startsWith(url, 'http://') && !Utilities.startsWith(url, 'https://')) {
                    var absoluteUrl = Utilities.joinPaths(Utilities.pathOf(originalFile), url);
                    url = Utilities.relativePath(newFile, absoluteUrl);
                }
                return 'url(' + url + ')';
            });
        };
        return Utilities;
    })();
    CSSLoaderPlugin.Utilities = Utilities;
    (function () {
        var cssLoader = null;
        var isElectron = (typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions['electron'] !== 'undefined');
        if (typeof process !== 'undefined' && process.versions && !!process.versions.node && !isElectron) {
            cssLoader = new NodeCSSLoader();
        }
        else if (typeof navigator !== 'undefined' && navigator.userAgent.indexOf('MSIE 9') >= 0) {
            cssLoader = new IE9CSSLoader();
        }
        else if (typeof navigator !== 'undefined' && navigator.userAgent.indexOf('MSIE 8') >= 0) {
            cssLoader = new IE8CSSLoader();
        }
        else {
            cssLoader = new BrowserCSSLoader();
        }
        define('vs/css', new CSSPlugin(cssLoader));
    })();
})(CSSLoaderPlugin || (CSSLoaderPlugin = {}));
