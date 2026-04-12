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
require("mocha");
const vscode_1 = require("vscode");
const textRendering_1 = require("../../languageFeatures/util/textRendering");
const noopToResource = {
    toResource: (path) => vscode_1.Uri.file(path)
};
suite('typescript.previewer', () => {
    test('Should ignore hyphens after a param tag', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'param',
                text: 'a - b'
            }
        ], noopToResource), '*@param* `a` — b');
    });
    test('Should parse url jsdoc @link', () => {
        assert.strictEqual((0, textRendering_1.documentationToMarkdown)(
        // 'x {@link http://www.example.com/foo} y {@link https://api.jquery.com/bind/#bind-eventType-eventData-handler} z',
        [{ 'text': 'x ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'http://www.example.com/foo', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' y ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'https://api.jquery.com/bind/#bind-eventType-eventData-handler', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' z', 'kind': 'text' }], [], noopToResource, undefined).value, 'x <http://www.example.com/foo> y <https://api.jquery.com/bind/#bind-eventType-eventData-handler> z');
    });
    test('Should parse url jsdoc @link with text', () => {
        assert.strictEqual((0, textRendering_1.documentationToMarkdown)(
        // 'x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z',
        [{ 'text': 'x ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'http://www.example.com/foo abc xyz', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' y ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'http://www.example.com/bar b a z', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' z', 'kind': 'text' }], [], noopToResource, undefined).value, 'x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
    });
    test('Should treat @linkcode jsdocs links as monospace', () => {
        assert.strictEqual((0, textRendering_1.documentationToMarkdown)(
        // 'x {@linkcode http://www.example.com/foo} y {@linkplain http://www.example.com/bar} z',
        [{ 'text': 'x ', 'kind': 'text' }, { 'text': '{@linkcode ', 'kind': 'link' }, { 'text': 'http://www.example.com/foo', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' y ', 'kind': 'text' }, { 'text': '{@linkplain ', 'kind': 'link' }, { 'text': 'http://www.example.com/bar', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' z', 'kind': 'text' }], [], noopToResource, undefined).value, 'x [`http://www.example.com/foo`](http://www.example.com/foo) y <http://www.example.com/bar> z');
    });
    test('Should parse url jsdoc @link in param tag', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'param',
                // a x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z
                text: [{ 'text': 'a', 'kind': 'parameterName' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'x ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'http://www.example.com/foo abc xyz', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' y ', 'kind': 'text' }, { 'text': '{@link ', 'kind': 'link' }, { 'text': 'http://www.example.com/bar b a z', 'kind': 'linkText' }, { 'text': '}', 'kind': 'link' }, { 'text': ' z', 'kind': 'text' }],
            }
        ], noopToResource), '*@param* `a` — x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
    });
    test('Should support non-ascii characters in parameter name (#90108)', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'param',
                text: 'parámetroConDiacríticos this will not'
            }
        ], noopToResource), '*@param* `parámetroConDiacríticos` — this will not');
    });
    test('Should render @example blocks as code', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'example',
                text: 'code();'
            }
        ], noopToResource), '*@example*  \n```tsx\ncode();\n```');
    });
    test('Should not render @example blocks as code as if they contain a codeblock', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'example',
                text: 'Not code\n```\ncode();\n```'
            }
        ], noopToResource), '*@example*  \nNot code\n```\ncode();\n```');
    });
    test('Should render @example blocks as code if they contain a <caption>', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'example',
                text: '<caption>Not code</caption>\ncode();'
            }
        ], noopToResource), '*@example*  \nNot code\n```tsx\ncode();\n```');
    });
    test('Should not render @example blocks as code if they contain a <caption> and a codeblock', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                name: 'example',
                text: '<caption>Not code</caption>\n```\ncode();\n```'
            }
        ], noopToResource), '*@example*  \nNot code\n```\ncode();\n```');
    });
    test('Should not render @link inside of @example #187768', () => {
        assert.strictEqual((0, textRendering_1.tagsToMarkdown)([
            {
                'name': 'example',
                'text': [
                    {
                        'text': '1 + 1 ',
                        'kind': 'text'
                    },
                    {
                        'text': '{@link ',
                        'kind': 'link'
                    },
                    {
                        'text': 'foo',
                        'kind': 'linkName'
                    },
                    {
                        'text': '}',
                        'kind': 'link'
                    }
                ]
            }
        ], noopToResource), '*@example*  \n```tsx\n1 + 1 {@link foo}\n```');
    });
    test('Should render @linkcode symbol name as code', () => {
        assert.strictEqual((0, textRendering_1.asPlainTextWithLinks)([
            { 'text': 'a ', 'kind': 'text' },
            { 'text': '{@linkcode ', 'kind': 'link' },
            {
                'text': 'dog',
                'kind': 'linkName',
                'target': {
                    'file': '/path/file.ts',
                    'start': { 'line': 7, 'offset': 5 },
                    'end': { 'line': 7, 'offset': 13 }
                }
            },
            { 'text': '}', 'kind': 'link' },
            { 'text': ' b', 'kind': 'text' }
        ], noopToResource), 'a [`dog`](command:_typescript.openJsDocLink?%5B%7B%22file%22%3A%7B%22path%22%3A%22%2Fpath%2Ffile.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%22position%22%3A%7B%22line%22%3A6%2C%22character%22%3A4%7D%7D%5D "Open symbol link") b');
    });
    test('Should render @linkcode text as code', () => {
        assert.strictEqual((0, textRendering_1.asPlainTextWithLinks)([
            { 'text': 'a ', 'kind': 'text' },
            { 'text': '{@linkcode ', 'kind': 'link' },
            {
                'text': 'dog',
                'kind': 'linkName',
                'target': {
                    'file': '/path/file.ts',
                    'start': { 'line': 7, 'offset': 5 },
                    'end': { 'line': 7, 'offset': 13 }
                }
            },
            { 'text': 'husky', 'kind': 'linkText' },
            { 'text': '}', 'kind': 'link' },
            { 'text': ' b', 'kind': 'text' }
        ], noopToResource), 'a [`husky`](command:_typescript.openJsDocLink?%5B%7B%22file%22%3A%7B%22path%22%3A%22%2Fpath%2Ffile.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%22position%22%3A%7B%22line%22%3A6%2C%22character%22%3A4%7D%7D%5D "Open symbol link") b');
    });
});
//# sourceMappingURL=textRendering.test.js.map