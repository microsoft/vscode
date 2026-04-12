"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const jsdom_1 = require("jsdom");
const linkify_1 = require("../linkify");
const dom = new jsdom_1.JSDOM();
global.document = dom.window.document;
suite('Notebook builtin output link detection', () => {
    linkify_1.LinkDetector.injectedHtmlCreator = (value) => value;
    test('no links', () => {
        const htmlWithLinks = (0, linkify_1.linkify)('hello', { linkifyFilePaths: true, trustHtml: true }, true);
        assert.equal(htmlWithLinks.innerHTML, 'hello');
    });
    test('web link detection', () => {
        const htmlWithLinks = (0, linkify_1.linkify)('something www.example.com something', { linkifyFilePaths: true, trustHtml: true }, true);
        const htmlWithLinks2 = (0, linkify_1.linkify)('something www.example.com something', { linkifyFilePaths: false, trustHtml: false }, true);
        assert.equal(htmlWithLinks.innerHTML, 'something <a href="www.example.com">www.example.com</a> something');
        assert.equal(htmlWithLinks.textContent, 'something www.example.com something');
        assert.equal(htmlWithLinks2.innerHTML, 'something <a href="www.example.com">www.example.com</a> something');
        assert.equal(htmlWithLinks2.textContent, 'something www.example.com something');
    });
    test('html link detection', () => {
        const htmlWithLinks = (0, linkify_1.linkify)('something <a href="www.example.com">link</a> something', { linkifyFilePaths: true, trustHtml: true }, true);
        const htmlWithLinks2 = (0, linkify_1.linkify)('something <a href="www.example.com">link</a> something', { linkifyFilePaths: false, trustHtml: true }, true);
        assert.equal(htmlWithLinks.innerHTML, 'something <span><a href="www.example.com">link</a></span> something');
        assert.equal(htmlWithLinks.textContent, 'something link something');
        assert.equal(htmlWithLinks2.innerHTML, 'something <span><a href="www.example.com">link</a></span> something');
        assert.equal(htmlWithLinks2.textContent, 'something link something');
    });
    test('html link without trust', () => {
        const htmlWithLinks = (0, linkify_1.linkify)('something <a href="file.py">link</a> something', { linkifyFilePaths: true, trustHtml: false }, true);
        assert.equal(htmlWithLinks.innerHTML, 'something &lt;a href="file.py"&gt;link&lt;/a&gt; something');
        assert.equal(htmlWithLinks.textContent, 'something <a href="file.py">link</a> something');
    });
});
//# sourceMappingURL=linkify.test.js.map