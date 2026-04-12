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
const languageModes_1 = require("../modes/languageModes");
const nodeFs_1 = require("../node/nodeFs");
async function testRename(value, newName, expectedDocContent) {
    const offset = value.indexOf('|');
    value = value.substr(0, offset) + value.substr(offset + 1);
    const document = languageModes_1.TextDocument.create('test://test/test.html', 'html', 0, value);
    const workspace = {
        settings: {},
        folders: [{ name: 'foo', uri: 'test://foo' }]
    };
    const languageModes = (0, languageModes_1.getLanguageModes)({ css: true, javascript: true }, workspace, languageModes_1.ClientCapabilities.LATEST, (0, nodeFs_1.getNodeFileFS)());
    const javascriptMode = languageModes.getMode('javascript');
    const position = document.positionAt(offset);
    if (javascriptMode) {
        const workspaceEdit = await javascriptMode.doRename(document, position, newName);
        if (!workspaceEdit || !workspaceEdit.changes) {
            assert.fail('No workspace edits');
        }
        const edits = workspaceEdit.changes[document.uri.toString()];
        if (!edits) {
            assert.fail(`No edits for file at ${document.uri.toString()}`);
        }
        const newDocContent = languageModes_1.TextDocument.applyEdits(document, edits);
        assert.strictEqual(newDocContent, expectedDocContent, `Expected: ${expectedDocContent}\nActual: ${newDocContent}`);
    }
    else {
        assert.fail('should have javascriptMode but no');
    }
}
async function testNoRename(value, newName) {
    const offset = value.indexOf('|');
    value = value.substr(0, offset) + value.substr(offset + 1);
    const document = languageModes_1.TextDocument.create('test://test/test.html', 'html', 0, value);
    const workspace = {
        settings: {},
        folders: [{ name: 'foo', uri: 'test://foo' }]
    };
    const languageModes = (0, languageModes_1.getLanguageModes)({ css: true, javascript: true }, workspace, languageModes_1.ClientCapabilities.LATEST, (0, nodeFs_1.getNodeFileFS)());
    const javascriptMode = languageModes.getMode('javascript');
    const position = document.positionAt(offset);
    if (javascriptMode) {
        const workspaceEdit = await javascriptMode.doRename(document, position, newName);
        assert.ok(workspaceEdit?.changes === undefined, 'Should not rename but rename happened');
    }
    else {
        assert.fail('should have javascriptMode but no');
    }
}
suite('HTML Javascript Rename', () => {
    test('Rename Variable', async () => {
        const input = [
            '<html>',
            '<head>',
            '<script>',
            'const |a = 2;',
            'const b = a + 2',
            '</script>',
            '</head>',
            '</html>'
        ];
        const output = [
            '<html>',
            '<head>',
            '<script>',
            'const h = 2;',
            'const b = h + 2',
            '</script>',
            '</head>',
            '</html>'
        ];
        await testRename(input.join('\n'), 'h', output.join('\n'));
    });
    test('Rename Function', async () => {
        const input = [
            '<html>',
            '<head>',
            '<script>',
            `const name = 'cjg';`,
            'function |sayHello(name) {',
            `console.log('hello', name)`,
            '}',
            'sayHello(name)',
            '</script>',
            '</head>',
            '</html>'
        ];
        const output = [
            '<html>',
            '<head>',
            '<script>',
            `const name = 'cjg';`,
            'function sayName(name) {',
            `console.log('hello', name)`,
            '}',
            'sayName(name)',
            '</script>',
            '</head>',
            '</html>'
        ];
        await testRename(input.join('\n'), 'sayName', output.join('\n'));
    });
    test('Rename Function Params', async () => {
        const input = [
            '<html>',
            '<head>',
            '<script>',
            `const name = 'cjg';`,
            'function sayHello(|name) {',
            `console.log('hello', name)`,
            '}',
            'sayHello(name)',
            '</script>',
            '</head>',
            '</html>'
        ];
        const output = [
            '<html>',
            '<head>',
            '<script>',
            `const name = 'cjg';`,
            'function sayHello(newName) {',
            `console.log('hello', newName)`,
            '}',
            'sayHello(name)',
            '</script>',
            '</head>',
            '</html>'
        ];
        await testRename(input.join('\n'), 'newName', output.join('\n'));
    });
    test('Rename Class', async () => {
        const input = [
            '<html>',
            '<head>',
            '<script>',
            `class |Foo {}`,
            `const foo = new Foo()`,
            '</script>',
            '</head>',
            '</html>'
        ];
        const output = [
            '<html>',
            '<head>',
            '<script>',
            `class Bar {}`,
            `const foo = new Bar()`,
            '</script>',
            '</head>',
            '</html>'
        ];
        await testRename(input.join('\n'), 'Bar', output.join('\n'));
    });
    test('Cannot Rename literal', async () => {
        const stringLiteralInput = [
            '<html>',
            '<head>',
            '<script>',
            `const name = |'cjg';`,
            '</script>',
            '</head>',
            '</html>'
        ];
        const numberLiteralInput = [
            '<html>',
            '<head>',
            '<script>',
            `const num = |2;`,
            '</script>',
            '</head>',
            '</html>'
        ];
        await testNoRename(stringLiteralInput.join('\n'), 'something');
        await testNoRename(numberLiteralInput.join('\n'), 'hhhh');
    });
});
//# sourceMappingURL=rename.test.js.map