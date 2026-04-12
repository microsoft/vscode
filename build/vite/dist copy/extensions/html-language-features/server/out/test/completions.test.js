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
exports.assertCompletion = assertCompletion;
exports.testCompletionFor = testCompletionFor;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
require("mocha");
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const vscode_uri_1 = require("vscode-uri");
const languageModes_1 = require("../modes/languageModes");
const nodeFs_1 = require("../node/nodeFs");
const documentContext_1 = require("../utils/documentContext");
function assertCompletion(completions, expected, document) {
    const matches = completions.items.filter(completion => {
        return completion.label === expected.label;
    });
    if (expected.notAvailable) {
        assert.strictEqual(matches.length, 0, `${expected.label} should not existing is results`);
        return;
    }
    assert.strictEqual(matches.length, 1, `${expected.label} should only existing once: Actual: ${completions.items.map(c => c.label).join(', ')}`);
    const match = matches[0];
    if (expected.documentation) {
        assert.strictEqual(match.documentation, expected.documentation);
    }
    if (expected.kind) {
        assert.strictEqual(match.kind, expected.kind);
    }
    if (expected.resultText && match.textEdit) {
        const edit = languageModes_1.TextEdit.is(match.textEdit) ? match.textEdit : languageModes_1.TextEdit.replace(match.textEdit.replace, match.textEdit.newText);
        assert.strictEqual(languageModes_1.TextDocument.applyEdits(document, [edit]), expected.resultText);
    }
    if (expected.command) {
        assert.deepStrictEqual(match.command, expected.command);
    }
}
const testUri = 'test://test/test.html';
async function testCompletionFor(value, expected, uri = testUri, workspaceFolders) {
    const offset = value.indexOf('|');
    value = value.substr(0, offset) + value.substr(offset + 1);
    const workspace = {
        settings: {},
        folders: workspaceFolders || [{ name: 'x', uri: uri.substr(0, uri.lastIndexOf('/')) }]
    };
    const document = languageModes_1.TextDocument.create(uri, 'html', 0, value);
    const position = document.positionAt(offset);
    const context = (0, documentContext_1.getDocumentContext)(uri, workspace.folders);
    const languageModes = (0, languageModes_1.getLanguageModes)({ css: true, javascript: true }, workspace, languageModes_1.ClientCapabilities.LATEST, (0, nodeFs_1.getNodeFileFS)());
    const mode = languageModes.getModeAtPosition(document, position);
    const list = await mode.doComplete(document, position, context);
    if (expected.count) {
        assert.strictEqual(list.items.length, expected.count);
    }
    if (expected.items) {
        for (const item of expected.items) {
            assertCompletion(list, item, document);
        }
    }
}
suite('HTML Completion', () => {
    test('HTML JavaScript Completions', async () => {
        await testCompletionFor('<html><script>window.|</script></html>', {
            items: [
                { label: 'location', resultText: '<html><script>window.location</script></html>' },
            ]
        });
        await testCompletionFor('<html><script>$.|</script></html>', {
            items: [
                { label: 'getJSON', resultText: '<html><script>$.getJSON</script></html>' },
            ]
        });
        await testCompletionFor('<html><script>const x = { a: 1 };</script><script>x.|</script></html>', {
            items: [
                { label: 'a', resultText: '<html><script>const x = { a: 1 };</script><script>x.a</script></html>' },
            ]
        }, 'test://test/test2.html');
    });
});
suite('HTML Path Completion', () => {
    const triggerSuggestCommand = {
        title: 'Suggest',
        command: 'editor.action.triggerSuggest'
    };
    const fixtureRoot = path.resolve(__dirname, '../../src/test/pathCompletionFixtures');
    const fixtureWorkspace = { name: 'fixture', uri: vscode_uri_1.URI.file(fixtureRoot).toString() };
    const indexHtmlUri = vscode_uri_1.URI.file(path.resolve(fixtureRoot, 'index.html')).toString();
    const aboutHtmlUri = vscode_uri_1.URI.file(path.resolve(fixtureRoot, 'about/about.html')).toString();
    test('Basics - Correct label/kind/result/command', async () => {
        await testCompletionFor('<script src="./|">', {
            items: [
                { label: 'about/', kind: languageModes_1.CompletionItemKind.Folder, resultText: '<script src="./about/">', command: triggerSuggestCommand },
                { label: 'index.html', kind: languageModes_1.CompletionItemKind.File, resultText: '<script src="./index.html">' },
                { label: 'src/', kind: languageModes_1.CompletionItemKind.Folder, resultText: '<script src="./src/">', command: triggerSuggestCommand }
            ]
        }, indexHtmlUri);
    });
    test('Basics - Single Quote', async () => {
        await testCompletionFor(`<script src='./|'>`, {
            items: [
                { label: 'about/', kind: languageModes_1.CompletionItemKind.Folder, resultText: `<script src='./about/'>`, command: triggerSuggestCommand },
                { label: 'index.html', kind: languageModes_1.CompletionItemKind.File, resultText: `<script src='./index.html'>` },
                { label: 'src/', kind: languageModes_1.CompletionItemKind.Folder, resultText: `<script src='./src/'>`, command: triggerSuggestCommand }
            ]
        }, indexHtmlUri);
    });
    test('No completion for remote paths', async () => {
        await testCompletionFor('<script src="http:">', { items: [] });
        await testCompletionFor('<script src="http:/|">', { items: [] });
        await testCompletionFor('<script src="http://|">', { items: [] });
        await testCompletionFor('<script src="https:|">', { items: [] });
        await testCompletionFor('<script src="https:/|">', { items: [] });
        await testCompletionFor('<script src="https://|">', { items: [] });
        await testCompletionFor('<script src="//|">', { items: [] });
    });
    test('Relative Path', async () => {
        await testCompletionFor('<script src="../|">', {
            items: [
                { label: 'about/', resultText: '<script src="../about/">' },
                { label: 'index.html', resultText: '<script src="../index.html">' },
                { label: 'src/', resultText: '<script src="../src/">' }
            ]
        }, aboutHtmlUri);
        await testCompletionFor('<script src="../src/|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="../src/feature.js">' },
                { label: 'test.js', resultText: '<script src="../src/test.js">' },
            ]
        }, aboutHtmlUri);
    });
    test('Absolute Path', async () => {
        await testCompletionFor('<script src="/|">', {
            items: [
                { label: 'about/', resultText: '<script src="/about/">' },
                { label: 'index.html', resultText: '<script src="/index.html">' },
                { label: 'src/', resultText: '<script src="/src/">' },
            ]
        }, indexHtmlUri);
        await testCompletionFor('<script src="/src/|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="/src/feature.js">' },
                { label: 'test.js', resultText: '<script src="/src/test.js">' },
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
    });
    test('Empty Path Value', async () => {
        // document: index.html
        await testCompletionFor('<script src="|">', {
            items: [
                { label: 'about/', resultText: '<script src="about/">' },
                { label: 'index.html', resultText: '<script src="index.html">' },
                { label: 'src/', resultText: '<script src="src/">' },
            ]
        }, indexHtmlUri);
        // document: about.html
        await testCompletionFor('<script src="|">', {
            items: [
                { label: 'about.css', resultText: '<script src="about.css">' },
                { label: 'about.html', resultText: '<script src="about.html">' },
                { label: 'media/', resultText: '<script src="media/">' },
            ]
        }, aboutHtmlUri);
    });
    test('Incomplete Path', async () => {
        await testCompletionFor('<script src="/src/f|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="/src/feature.js">' },
                { label: 'test.js', resultText: '<script src="/src/test.js">' },
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="../src/f|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="../src/feature.js">' },
                { label: 'test.js', resultText: '<script src="../src/test.js">' },
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
    });
    test('No leading dot or slash', async () => {
        // document: index.html
        await testCompletionFor('<script src="s|">', {
            items: [
                { label: 'about/', resultText: '<script src="about/">' },
                { label: 'index.html', resultText: '<script src="index.html">' },
                { label: 'src/', resultText: '<script src="src/">' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="src/|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="src/feature.js">' },
                { label: 'test.js', resultText: '<script src="src/test.js">' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="src/f|">', {
            items: [
                { label: 'feature.js', resultText: '<script src="src/feature.js">' },
                { label: 'test.js', resultText: '<script src="src/test.js">' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        // document: about.html
        await testCompletionFor('<script src="s|">', {
            items: [
                { label: 'about.css', resultText: '<script src="about.css">' },
                { label: 'about.html', resultText: '<script src="about.html">' },
                { label: 'media/', resultText: '<script src="media/">' },
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="media/|">', {
            items: [
                { label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="media/f|">', {
            items: [
                { label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
    });
    test('Trigger completion in middle of path', async () => {
        // document: index.html
        await testCompletionFor('<script src="src/f|eature.js">', {
            items: [
                { label: 'feature.js', resultText: '<script src="src/feature.js">' },
                { label: 'test.js', resultText: '<script src="src/test.js">' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="s|rc/feature.js">', {
            items: [
                { label: 'about/', resultText: '<script src="about/">' },
                { label: 'index.html', resultText: '<script src="index.html">' },
                { label: 'src/', resultText: '<script src="src/">' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        // document: about.html
        await testCompletionFor('<script src="media/f|eature.js">', {
            items: [
                { label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="m|edia/feature.js">', {
            items: [
                { label: 'about.css', resultText: '<script src="about.css">' },
                { label: 'about.html', resultText: '<script src="about.html">' },
                { label: 'media/', resultText: '<script src="media/">' },
            ]
        }, aboutHtmlUri, [fixtureWorkspace]);
    });
    test('Trigger completion in middle of path and with whitespaces', async () => {
        await testCompletionFor('<script src="./| about/about.html>', {
            items: [
                { label: 'about/', resultText: '<script src="./about/ about/about.html>' },
                { label: 'index.html', resultText: '<script src="./index.html about/about.html>' },
                { label: 'src/', resultText: '<script src="./src/ about/about.html>' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
        await testCompletionFor('<script src="./a|bout /about.html>', {
            items: [
                { label: 'about/', resultText: '<script src="./about/ /about.html>' },
                { label: 'index.html', resultText: '<script src="./index.html /about.html>' },
                { label: 'src/', resultText: '<script src="./src/ /about.html>' },
            ]
        }, indexHtmlUri, [fixtureWorkspace]);
    });
    test('Completion should ignore files/folders starting with dot', async () => {
        await testCompletionFor('<script src="./|"', {
            count: 3
        }, indexHtmlUri, [fixtureWorkspace]);
    });
    test('Unquoted Path', async () => {
        /* Unquoted value is not supported in html language service yet
        testCompletionFor(`<div><a href=about/|>`, {
            items: [
                { label: 'about.html', resultText: `<div><a href=about/about.html>` }
            ]
        }, testUri);
        */
    });
});
//# sourceMappingURL=completions.test.js.map