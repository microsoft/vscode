"use strict";
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
require("mocha");
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const vscode_uri_1 = require("vscode-uri");
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
const nodeFs_1 = require("../node/nodeFs");
const documentContext_1 = require("../utils/documentContext");
suite('Completions', () => {
    const assertCompletion = function (completions, expected, document, _offset) {
        const matches = completions.items.filter(completion => {
            return completion.label === expected.label;
        });
        assert.strictEqual(matches.length, 1, `${expected.label} should only existing once: Actual: ${completions.items.map(c => c.label).join(', ')}`);
        const match = matches[0];
        if (expected.resultText && vscode_languageserver_types_1.TextEdit.is(match.textEdit)) {
            assert.strictEqual(vscode_languageserver_types_1.TextDocument.applyEdits(document, [match.textEdit]), expected.resultText);
        }
    };
    async function assertCompletions(value, expected, testUri, workspaceFolders, lang = 'css') {
        const offset = value.indexOf('|');
        value = value.substr(0, offset) + value.substr(offset + 1);
        const document = vscode_languageserver_types_1.TextDocument.create(testUri, lang, 0, value);
        const position = document.positionAt(offset);
        if (!workspaceFolders) {
            workspaceFolders = [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }];
        }
        const lsOptions = { fileSystemProvider: (0, nodeFs_1.getNodeFSRequestService)() };
        const cssLanguageService = lang === 'scss' ? (0, vscode_css_languageservice_1.getSCSSLanguageService)(lsOptions) : (0, vscode_css_languageservice_1.getCSSLanguageService)(lsOptions);
        const context = (0, documentContext_1.getDocumentContext)(testUri, workspaceFolders);
        const stylesheet = cssLanguageService.parseStylesheet(document);
        const list = await cssLanguageService.doComplete2(document, position, stylesheet, context);
        if (expected.count) {
            assert.strictEqual(list.items.length, expected.count);
        }
        if (expected.items) {
            for (const item of expected.items) {
                assertCompletion(list, item, document, offset);
            }
        }
    }
    test('CSS url() Path completion', async function () {
        const testUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString(true);
        const folders = [{ name: 'x', uri: vscode_uri_1.URI.file(path.resolve(__dirname, '../../test')).toString(true) }];
        await assertCompletions('html { background-image: url("./|")', {
            items: [
                { label: 'about.html', resultText: 'html { background-image: url("./about.html")' }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('../|')`, {
            items: [
                { label: 'about/', resultText: `html { background-image: url('../about/')` },
                { label: 'index.html', resultText: `html { background-image: url('../index.html')` },
                { label: 'src/', resultText: `html { background-image: url('../src/')` }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('../src/a|')`, {
            items: [
                { label: 'feature.js', resultText: `html { background-image: url('../src/feature.js')` },
                { label: 'data/', resultText: `html { background-image: url('../src/data/')` },
                { label: 'test.js', resultText: `html { background-image: url('../src/test.js')` }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('../src/data/f|.asar')`, {
            items: [
                { label: 'foo.asar', resultText: `html { background-image: url('../src/data/foo.asar')` }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('|')`, {
            items: [
                { label: 'about.html', resultText: `html { background-image: url('about.html')` },
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('/|')`, {
            items: [
                { label: 'pathCompletionFixtures/', resultText: `html { background-image: url('/pathCompletionFixtures/')` }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url('/pathCompletionFixtures/|')`, {
            items: [
                { label: 'about/', resultText: `html { background-image: url('/pathCompletionFixtures/about/')` },
                { label: 'index.html', resultText: `html { background-image: url('/pathCompletionFixtures/index.html')` },
                { label: 'src/', resultText: `html { background-image: url('/pathCompletionFixtures/src/')` }
            ]
        }, testUri, folders);
        await assertCompletions(`html { background-image: url("/|")`, {
            items: [
                { label: 'pathCompletionFixtures/', resultText: `html { background-image: url("/pathCompletionFixtures/")` }
            ]
        }, testUri, folders);
    });
    test('CSS url() Path Completion - Unquoted url', async function () {
        const testUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString(true);
        const folders = [{ name: 'x', uri: vscode_uri_1.URI.file(path.resolve(__dirname, '../../test')).toString(true) }];
        await assertCompletions('html { background-image: url(./|)', {
            items: [
                { label: 'about.html', resultText: 'html { background-image: url(./about.html)' }
            ]
        }, testUri, folders);
        await assertCompletions('html { background-image: url(./a|)', {
            items: [
                { label: 'about.html', resultText: 'html { background-image: url(./about.html)' }
            ]
        }, testUri, folders);
        await assertCompletions('html { background-image: url(../|src/)', {
            items: [
                { label: 'about/', resultText: 'html { background-image: url(../about/)' }
            ]
        }, testUri, folders);
        await assertCompletions('html { background-image: url(../s|rc/)', {
            items: [
                { label: 'about/', resultText: 'html { background-image: url(../about/)' }
            ]
        }, testUri, folders);
    });
    test('CSS @import Path completion', async function () {
        const testUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString(true);
        const folders = [{ name: 'x', uri: vscode_uri_1.URI.file(path.resolve(__dirname, '../../test')).toString(true) }];
        await assertCompletions(`@import './|'`, {
            items: [
                { label: 'about.html', resultText: `@import './about.html'` },
            ]
        }, testUri, folders);
        await assertCompletions(`@import '../|'`, {
            items: [
                { label: 'about/', resultText: `@import '../about/'` },
                { label: 'scss/', resultText: `@import '../scss/'` },
                { label: 'index.html', resultText: `@import '../index.html'` },
                { label: 'src/', resultText: `@import '../src/'` }
            ]
        }, testUri, folders);
    });
    /**
     * For SCSS, `@import 'foo';` can be used for importing partial file `_foo.scss`
     */
    test('SCSS @import Path completion', async function () {
        const testCSSUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString(true);
        const folders = [{ name: 'x', uri: vscode_uri_1.URI.file(path.resolve(__dirname, '../../test')).toString(true) }];
        /**
         * We are in a CSS file, so no special treatment for SCSS partial files
        */
        await assertCompletions(`@import '../scss/|'`, {
            items: [
                { label: 'main.scss', resultText: `@import '../scss/main.scss'` },
                { label: '_foo.scss', resultText: `@import '../scss/_foo.scss'` }
            ]
        }, testCSSUri, folders);
        const testSCSSUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/scss/main.scss')).toString(true);
        await assertCompletions(`@import './|'`, {
            items: [
                { label: '_foo.scss', resultText: `@import './foo'` }
            ]
        }, testSCSSUri, folders, 'scss');
    });
    test('Completion should ignore files/folders starting with dot', async function () {
        const testUri = vscode_uri_1.URI.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString(true);
        const folders = [{ name: 'x', uri: vscode_uri_1.URI.file(path.resolve(__dirname, '../../test')).toString(true) }];
        await assertCompletions('html { background-image: url("../|")', {
            count: 4
        }, testUri, folders);
    });
});
//# sourceMappingURL=completion.test.js.map