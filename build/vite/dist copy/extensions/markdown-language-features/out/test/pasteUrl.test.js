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
const assert = __importStar(require("assert"));
require("mocha");
const vscode = __importStar(require("vscode"));
const inMemoryDocument_1 = require("../client/inMemoryDocument");
const shared_1 = require("../languageFeatures/copyFiles/shared");
const smartDropOrPaste_1 = require("../languageFeatures/copyFiles/smartDropOrPaste");
const cancellation_1 = require("../util/cancellation");
const uriList_1 = require("../util/uriList");
const engine_1 = require("./engine");
const util_1 = require("./util");
function makeTestDoc(contents) {
    return new inMemoryDocument_1.InMemoryDocument(vscode.Uri.file('test.md'), contents);
}
suite('createEditAddingLinksForUriList', () => {
    test('Markdown Link Pasting should occur for a valid link (end to end)', async () => {
        const result = (0, shared_1.createInsertUriListEdit)(new inMemoryDocument_1.InMemoryDocument(vscode.Uri.file('test.md'), 'hello world!'), [new vscode.Range(0, 0, 0, 12)], uriList_1.UriList.from('https://www.microsoft.com/'));
        // need to check the actual result -> snippet value
        assert.strictEqual(result?.label, 'Insert Markdown Link');
    });
    suite('validateLink', () => {
        test('Markdown pasting should occur for a valid link', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://www.microsoft.com/'), 'https://www.microsoft.com/');
        });
        test('Markdown pasting should occur for a valid link preceded by a new line', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('\r\nhttps://www.microsoft.com/'), 'https://www.microsoft.com/');
        });
        test('Markdown pasting should occur for a valid link followed by a new line', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://www.microsoft.com/\r\n'), 'https://www.microsoft.com/');
        });
        test('Markdown pasting should not occur for a valid hostname and invalid protool', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('invalid:www.microsoft.com'), undefined);
        });
        test('Markdown pasting should not occur for plain text', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('hello world!'), undefined);
        });
        test('Markdown pasting should not occur for plain text including a colon', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('hello: world!'), undefined);
        });
        test('Markdown pasting should not occur for plain text including a slashes', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('helloworld!'), undefined);
        });
        test('Markdown pasting should not occur for a link followed by text', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://www.microsoft.com/ hello world!'), undefined);
        });
        test('Markdown pasting should occur for a link preceded or followed by spaces', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('     https://www.microsoft.com/     '), 'https://www.microsoft.com/');
        });
        test('Markdown pasting should not occur for a link with an invalid scheme', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('hello:www.microsoft.com'), undefined);
        });
        test('Markdown pasting should not occur for multiple links being pasted', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/'), undefined);
        });
        test('Markdown pasting should not occur for multiple links with spaces being pasted', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://www.microsoft.com/    \r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\n hello \r\nhttps://www.microsoft.com/'), undefined);
        });
        test('Markdown pasting should not occur for just a valid uri scheme', () => {
            assert.strictEqual((0, smartDropOrPaste_1.findValidUriInText)('https://'), undefined);
        });
    });
    suite('createInsertUriListEdit', () => {
        test('Should create snippet with < > when pasted link has an mismatched parentheses', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.mic(rosoft.com'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](<https://www.mic(rosoft.com>)');
        });
        test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.microsoft.com'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
        });
        test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.microsoft.com'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
        });
        test('Should not decode an encoded URI string when passing in an external browser link', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.microsoft.com/%20'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com/%20)');
        });
        test('Should not encode an unencoded URI string when passing in an external browser link', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.example.com/path?query=value&another=value#fragment'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.example.com/path?query=value&another=value#fragment)');
        });
        test('Should add image for image file by default', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.example.com/cat.png'));
            assert.strictEqual(edit?.edits?.[0].snippet.value, '![${1:alt text}](https://www.example.com/cat.png)');
        });
        test('Should be able to override insert style to use link', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.example.com/cat.png'), {
                linkKindHint: shared_1.linkEditKind,
            });
            assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.example.com/cat.png)');
        });
        test('Should be able to override insert style to use images', () => {
            const edit = (0, shared_1.createInsertUriListEdit)(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], uriList_1.UriList.from('https://www.example.com/'), {
                linkKindHint: shared_1.imageEditKind,
            });
            assert.strictEqual(edit?.edits?.[0].snippet.value, '![${1:alt text}](https://www.example.com/)');
        });
    });
    suite('shouldInsertMarkdownLinkByDefault', () => {
        test('Smart should be enabled for selected plain text', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('hello world'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 12)], cancellation_1.noopToken), true);
        });
        test('Smart should be enabled in headers', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('# title'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 2, 0, 2)], cancellation_1.noopToken), true);
        });
        test('Smart should be enabled in lists', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('1. text'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], cancellation_1.noopToken), true);
        });
        test('Smart should be enabled in blockquotes', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('> text'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], cancellation_1.noopToken), true);
        });
        test('Smart should be disabled in indented code blocks', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('    code'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 4)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in fenced code blocks', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('```\r\n\r\n```'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], cancellation_1.noopToken), false);
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('~~~\r\n\r\n~~~'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in math blocks', async () => {
            let katex = (await Promise.resolve().then(() => __importStar(require('@vscode/markdown-it-katex')))).default;
            if (typeof katex === 'object') {
                katex = katex.default;
            }
            const engine = (0, engine_1.createNewMarkdownEngine)();
            (await engine.getEngine(undefined)).use(katex);
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)(engine, makeTestDoc('$$\r\n\r\n$$'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in link definitions', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('[ref]: http://example.com'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 6)], cancellation_1.noopToken), false);
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('[ref]: '), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 7, 0, 7)], cancellation_1.noopToken), false);
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('[ref]: '), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in html blocks', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('<p>\na\n</p>'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in html blocks where paste creates the block', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('<p>\n\n</p>'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], cancellation_1.noopToken), false, 'Between two html tags should be treated as html block');
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('<p>\n\ntext'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], cancellation_1.noopToken), false, 'Between opening html tag and text should be treated as html block');
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('<p>\n\n\n</p>'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], cancellation_1.noopToken), true, 'Extra new line after paste should not be treated as html block');
        });
        test('Smart should be disabled in Markdown links', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('[a](bcdef)'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 6)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in Markdown images', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('![a](bcdef)'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 10)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in inline code', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('``'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 1, 0, 1)], cancellation_1.noopToken), false, 'Should be disabled inside of inline code');
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('``'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], cancellation_1.noopToken), true, 'Should be enabled when cursor is outside but next to inline code');
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('`a`'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], cancellation_1.noopToken), true, 'Should be enabled when cursor is outside but next to inline code');
        });
        test('Smart should be enabled when pasting over inline code ', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('`xyz`'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 5)], cancellation_1.noopToken), true);
        });
        test('Smart should be disabled in inline math', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('$$'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 1)], cancellation_1.noopToken), false);
        });
        test('Smart should be enabled for empty selection', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('xyz'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], cancellation_1.noopToken), true);
        });
        test('SmartWithSelection should disable for empty selection', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('xyz'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 0)], cancellation_1.noopToken), false);
        });
        test('Smart should disable for selected link', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('https://www.microsoft.com'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 25)], cancellation_1.noopToken), false);
        });
        test('Smart should disable for selected link with trailing whitespace', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('   https://www.microsoft.com  '), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 30)], cancellation_1.noopToken), false);
        });
        test('Should evaluate pasteAsMarkdownLink as true for a link pasted in square brackets', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('[abc]'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 4)], cancellation_1.noopToken), true);
        });
        test('Should evaluate pasteAsMarkdownLink as false for selected whitespace and new lines', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('   \r\n\r\n'), smartDropOrPaste_1.InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 7)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled inside of autolinks', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc('<>'), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 1, 0, 1)], cancellation_1.noopToken), false);
        });
        test('Smart should be disabled in frontmatter', async () => {
            const textDoc = makeTestDoc((0, util_1.joinLines)(`---`, `layout: post`, `title: Blogging Like a Hacker`, `---`, ``, `Link Text`));
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), textDoc, smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], cancellation_1.noopToken), false);
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), textDoc, smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], cancellation_1.noopToken), false);
        });
        test('Smart should enabled after frontmatter', async () => {
            assert.strictEqual(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)((0, engine_1.createNewMarkdownEngine)(), makeTestDoc((0, util_1.joinLines)(`---`, `layout: post`, `title: Blogging Like a Hacker`, `---`, ``, `Link Text`)), smartDropOrPaste_1.InsertMarkdownLink.Smart, [new vscode.Range(5, 0, 5, 0)], cancellation_1.noopToken), true);
        });
    });
});
//# sourceMappingURL=pasteUrl.test.js.map