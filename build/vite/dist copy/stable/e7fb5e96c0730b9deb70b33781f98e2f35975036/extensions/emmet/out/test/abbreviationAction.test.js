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
require("mocha");
const assert = __importStar(require("assert"));
const vscode_1 = require("vscode");
const testUtils_1 = require("./testUtils");
const abbreviationActions_1 = require("../abbreviationActions");
const defaultCompletionProvider_1 = require("../defaultCompletionProvider");
const completionProvider = new defaultCompletionProvider_1.DefaultCompletionItemProvider();
const htmlContents = `
<body class="header">
	<ul class="nav main">
		<li class="item1">img</li>
		<li class="item2">hithere</li>
		ul>li
		ul>li*2
		ul>li.item$*2
		ul>li.item$@44*2
		<div i
	</ul>
	<style>
		.boo {
			display: dn; m10
		}
	</style>
	<span></span>
	(ul>li.item$)*2
	(ul>li.item$)*2+span
	(div>dl>(dt+dd)*2)
	<script type="text/html">
		span.hello
	</script>
	<script type="text/javascript">
		span.bye
	</script>
</body>
`;
const invokeCompletionContext = {
    triggerKind: vscode_1.CompletionTriggerKind.Invoke,
    triggerCharacter: undefined,
};
suite('Tests for Expand Abbreviations (HTML)', () => {
    teardown(testUtils_1.closeAllEditors);
    test('Expand snippets (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(3, 23, 3, 23), 'img', '<img src=\"\" alt=\"\">');
    });
    test('Expand snippets in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(3, 23, 3, 23), 'img', '<img src=\"\" alt=\"\">');
    });
    test('Expand snippets when no parent node (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)('img', 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 3, 0, 3);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), '<img src=\"\" alt=\"\">');
            return Promise.resolve();
        });
    });
    test('Expand snippets when no parent node in completion list (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)('img', 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 3, 0, 3);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (!completionPromise) {
                assert.strictEqual(!completionPromise, false, `Got unexpected undefined instead of a completion promise`);
                return Promise.resolve();
            }
            const completionList = await completionPromise;
            assert.strictEqual(completionList && completionList.items && completionList.items.length > 0, true);
            if (completionList) {
                assert.strictEqual(completionList.items[0].label, 'img');
                assert.strictEqual((completionList.items[0].documentation || '').replace(/\|/g, ''), '<img src=\"\" alt=\"\">');
            }
            return Promise.resolve();
        });
    });
    test('Expand abbreviation (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(5, 25, 5, 25), 'ul>li', '<ul>\n\t\t\t<li></li>\n\t\t</ul>');
    });
    test('Expand abbreviation in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(5, 25, 5, 25), 'ul>li', '<ul>\n\t<li></li>\n</ul>');
    });
    test('Expand text that is neither an abbreviation nor a snippet to tags (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(4, 20, 4, 27), 'hithere', '<hithere></hithere>');
    });
    test('Do not Expand text that is neither an abbreviation nor a snippet to tags in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(4, 20, 4, 27), 'hithere', '<hithere></hithere>', true);
    });
    test('Expand abbreviation with repeaters (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(6, 27, 6, 27), 'ul>li*2', '<ul>\n\t\t\t<li></li>\n\t\t\t<li></li>\n\t\t</ul>');
    });
    test('Expand abbreviation with repeaters in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(6, 27, 6, 27), 'ul>li*2', '<ul>\n\t<li></li>\n\t<li></li>\n</ul>');
    });
    test('Expand abbreviation with numbered repeaters (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(7, 33, 7, 33), 'ul>li.item$*2', '<ul>\n\t\t\t<li class="item1"></li>\n\t\t\t<li class="item2"></li>\n\t\t</ul>');
    });
    test('Expand abbreviation with numbered repeaters in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(7, 33, 7, 33), 'ul>li.item$*2', '<ul>\n\t<li class="item1"></li>\n\t<li class="item2"></li>\n</ul>');
    });
    test('Expand abbreviation with numbered repeaters with offset (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(8, 36, 8, 36), 'ul>li.item$@44*2', '<ul>\n\t\t\t<li class="item44"></li>\n\t\t\t<li class="item45"></li>\n\t\t</ul>');
    });
    test('Expand abbreviation with numbered repeaters with offset in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(8, 36, 8, 36), 'ul>li.item$@44*2', '<ul>\n\t<li class="item44"></li>\n\t<li class="item45"></li>\n</ul>');
    });
    test('Expand abbreviation with numbered repeaters in groups (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(17, 16, 17, 16), '(ul>li.item$)*2', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>');
    });
    test('Expand abbreviation with numbered repeaters in groups in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(17, 16, 17, 16), '(ul>li.item$)*2', '<ul>\n\t<li class="item1"></li>\n</ul>\n<ul>\n\t<li class="item2"></li>\n</ul>');
    });
    test('Expand abbreviation with numbered repeaters in groups with sibling in the end (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(18, 21, 18, 21), '(ul>li.item$)*2+span', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>\n\t<span></span>');
    });
    test('Expand abbreviation with numbered repeaters in groups with sibling in the end in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(18, 21, 18, 21), '(ul>li.item$)*2+span', '<ul>\n\t<li class="item1"></li>\n</ul>\n<ul>\n\t<li class="item2"></li>\n</ul>\n<span></span>');
    });
    test('Expand abbreviation with nested groups (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(19, 19, 19, 19), '(div>dl>(dt+dd)*2)', '<div>\n\t\t<dl>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t</dl>\n\t</div>');
    });
    test('Expand abbreviation with nested groups in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(19, 19, 19, 19), '(div>dl>(dt+dd)*2)', '<div>\n\t<dl>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t</dl>\n</div>');
    });
    test('Expand tag that is opened, but not closed (HTML)', () => {
        return testExpandAbbreviation('html', new vscode_1.Selection(9, 6, 9, 6), '<div', '<div></div>');
    });
    test('Do not Expand tag that is opened, but not closed in completion list (HTML)', () => {
        return testHtmlCompletionProvider(new vscode_1.Selection(9, 6, 9, 6), '<div', '<div></div>', true);
    });
    test('No expanding text inside open tag (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(2, 4, 2, 4);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), htmlContents);
            return Promise.resolve();
        });
    });
    test('No expanding text inside open tag in completion list (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', (editor, _doc) => {
            editor.selection = new vscode_1.Selection(2, 4, 2, 4);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            assert.strictEqual(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
            return Promise.resolve();
        });
    });
    test('No expanding text inside open tag when there is no closing tag (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(9, 8, 9, 8);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), htmlContents);
            return Promise.resolve();
        });
    });
    test('No expanding text inside open tag when there is no closing tag in completion list (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', (editor, _doc) => {
            editor.selection = new vscode_1.Selection(9, 8, 9, 8);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            assert.strictEqual(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
            return Promise.resolve();
        });
    });
    test('No expanding text inside open tag when there is no closing tag when there is no parent node (HTML)', () => {
        const fileContents = '<img s';
        return (0, testUtils_1.withRandomFileEditor)(fileContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), fileContents);
            return Promise.resolve();
        });
    });
    test('No expanding text in completion list inside open tag when there is no closing tag when there is no parent node (HTML)', () => {
        const fileContents = '<img s';
        return (0, testUtils_1.withRandomFileEditor)(fileContents, 'html', (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            assert.strictEqual(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
            return Promise.resolve();
        });
    });
    test('Expand css when inside style tag (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(13, 16, 13, 19);
            const expandPromise = (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'css' });
            if (!expandPromise) {
                return Promise.resolve();
            }
            await expandPromise;
            assert.strictEqual(editor.document.getText(), htmlContents.replace('m10', 'margin: 10px;'));
            return Promise.resolve();
        });
    });
    test('Expand css when inside style tag in completion list (HTML)', () => {
        const abbreviation = 'm10';
        const expandedText = 'margin: 10px;';
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(13, 16, 13, 19);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (!completionPromise) {
                assert.strictEqual(1, 2, `Problem with expanding m10`);
                return Promise.resolve();
            }
            const completionList = await completionPromise;
            if (!completionList || !completionList.items || !completionList.items.length) {
                assert.strictEqual(1, 2, `Problem with expanding m10`);
                return Promise.resolve();
            }
            const emmetCompletionItem = completionList.items[0];
            assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
            assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            assert.strictEqual(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
            return Promise.resolve();
        });
    });
    test('No expanding text inside style tag if position is not for property name (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(13, 14, 13, 14);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), htmlContents);
            return Promise.resolve();
        });
    });
    test('Expand css when inside style attribute (HTML)', () => {
        const styleAttributeContent = '<div style="m10" class="hello"></div>';
        return (0, testUtils_1.withRandomFileEditor)(styleAttributeContent, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 15, 0, 15);
            const expandPromise = (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            if (!expandPromise) {
                return Promise.resolve();
            }
            await expandPromise;
            assert.strictEqual(editor.document.getText(), styleAttributeContent.replace('m10', 'margin: 10px;'));
            return Promise.resolve();
        });
    });
    test('Expand css when inside style attribute in completion list (HTML)', () => {
        const abbreviation = 'm10';
        const expandedText = 'margin: 10px;';
        return (0, testUtils_1.withRandomFileEditor)('<div style="m10" class="hello"></div>', 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 15, 0, 15);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (!completionPromise) {
                assert.strictEqual(1, 2, `Problem with expanding m10`);
                return Promise.resolve();
            }
            const completionList = await completionPromise;
            if (!completionList || !completionList.items || !completionList.items.length) {
                assert.strictEqual(1, 2, `Problem with expanding m10`);
                return Promise.resolve();
            }
            const emmetCompletionItem = completionList.items[0];
            assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
            assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            assert.strictEqual(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
            return Promise.resolve();
        });
    });
    test('Expand html when inside script tag with html type (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(21, 12, 21, 12);
            const expandPromise = (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            if (!expandPromise) {
                return Promise.resolve();
            }
            await expandPromise;
            assert.strictEqual(editor.document.getText(), htmlContents.replace('span.hello', '<span class="hello"></span>'));
            return Promise.resolve();
        });
    });
    test('Expand html in completion list when inside script tag with html type (HTML)', () => {
        const abbreviation = 'span.hello';
        const expandedText = '<span class="hello"></span>';
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(21, 12, 21, 12);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (!completionPromise) {
                assert.strictEqual(1, 2, `Problem with expanding span.hello`);
                return Promise.resolve();
            }
            const completionList = await completionPromise;
            if (!completionList || !completionList.items || !completionList.items.length) {
                assert.strictEqual(1, 2, `Problem with expanding span.hello`);
                return Promise.resolve();
            }
            const emmetCompletionItem = completionList.items[0];
            assert.strictEqual(emmetCompletionItem.label, abbreviation, `Label of completion item doesnt match.`);
            assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            return Promise.resolve();
        });
    });
    test('No expanding text inside script tag with javascript type (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(24, 12, 24, 12);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            assert.strictEqual(editor.document.getText(), htmlContents);
            return Promise.resolve();
        });
    });
    test('No expanding text in completion list inside script tag with javascript type (HTML)', () => {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', (editor, _doc) => {
            editor.selection = new vscode_1.Selection(24, 12, 24, 12);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            assert.strictEqual(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
            return Promise.resolve();
        });
    });
    test('Expand html when inside script tag with javascript type if js is mapped to html (HTML)', async () => {
        const oldConfig = vscode_1.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
        await vscode_1.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': 'html' }, vscode_1.ConfigurationTarget.Global);
        await (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(24, 10, 24, 10);
            const expandPromise = (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
            if (!expandPromise) {
                return Promise.resolve();
            }
            await expandPromise;
            assert.strictEqual(editor.document.getText(), htmlContents.replace('span.bye', '<span class="bye"></span>'));
        });
        await vscode_1.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode_1.ConfigurationTarget.Global);
    });
    test('Expand html in completion list when inside script tag with javascript type if js is mapped to html (HTML)', async () => {
        const abbreviation = 'span.bye';
        const expandedText = '<span class="bye"></span>';
        const oldConfig = vscode_1.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
        await vscode_1.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': 'html' }, vscode_1.ConfigurationTarget.Global);
        await (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(24, 10, 24, 10);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (!completionPromise) {
                assert.strictEqual(1, 2, `Problem with expanding span.bye`);
                return Promise.resolve();
            }
            const completionList = await completionPromise;
            if (!completionList || !completionList.items || !completionList.items.length) {
                assert.strictEqual(1, 2, `Problem with expanding span.bye`);
                return Promise.resolve();
            }
            const emmetCompletionItem = completionList.items[0];
            assert.strictEqual(emmetCompletionItem.label, abbreviation, `Label of completion item (${emmetCompletionItem.label}) doesnt match.`);
            assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            return Promise.resolve();
        });
        await vscode_1.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode_1.ConfigurationTarget.Global);
    });
    // test('No expanding when html is excluded in the settings', () => {
    // 	return workspace.getConfiguration('emmet').update('excludeLanguages', ['html'], ConfigurationTarget.Global).then(() => {
    // 		return testExpandAbbreviation('html', new Selection(9, 6, 9, 6), '', '', true).then(() => {
    // 			return workspace.getConfiguration('emmet').update('excludeLanguages', oldValueForExcludeLanguages ? oldValueForExcludeLanguages.globalValue : undefined, ConfigurationTarget.Global);
    // 		});
    // 	});
    // });
    test('No expanding when html is excluded in the settings in completion list', async () => {
        const oldConfig = vscode_1.workspace.getConfiguration('emmet').inspect('excludeLanguages')?.globalValue;
        await vscode_1.workspace.getConfiguration('emmet').update('excludeLanguages', ['html'], vscode_1.ConfigurationTarget.Global);
        await testHtmlCompletionProvider(new vscode_1.Selection(9, 6, 9, 6), '', '', true);
        await vscode_1.workspace.getConfiguration('emmet').update('excludeLanguages', oldConfig, vscode_1.ConfigurationTarget.Global);
    });
    // test('No expanding when php (mapped syntax) is excluded in the settings', () => {
    // 	return workspace.getConfiguration('emmet').update('excludeLanguages', ['php'], ConfigurationTarget.Global).then(() => {
    // 		return testExpandAbbreviation('php', new Selection(9, 6, 9, 6), '', '', true).then(() => {
    // 			return workspace.getConfiguration('emmet').update('excludeLanguages', oldValueForExcludeLanguages ? oldValueForExcludeLanguages.globalValue : undefined, ConfigurationTarget.Global);
    // 		});
    // 	});
    // });
});
suite('Tests for jsx, xml and xsl', () => {
    const oldValueForSyntaxProfiles = vscode_1.workspace.getConfiguration('emmet').inspect('syntaxProfiles');
    teardown(testUtils_1.closeAllEditors);
    test('Expand abbreviation with className instead of class in jsx', () => {
        return (0, testUtils_1.withRandomFileEditor)('ul.nav', 'javascriptreact', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'javascriptreact' });
            assert.strictEqual(editor.document.getText(), '<ul className="nav"></ul>');
            return Promise.resolve();
        });
    });
    test('Expand abbreviation with self closing tags for jsx', () => {
        return (0, testUtils_1.withRandomFileEditor)('img', 'javascriptreact', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'javascriptreact' });
            assert.strictEqual(editor.document.getText(), '<img src="" alt="" />');
            return Promise.resolve();
        });
    });
    test('Expand abbreviation with single quotes for jsx', async () => {
        await vscode_1.workspace.getConfiguration('emmet').update('syntaxProfiles', { jsx: { 'attr_quotes': 'single' } }, vscode_1.ConfigurationTarget.Global);
        return (0, testUtils_1.withRandomFileEditor)('img', 'javascriptreact', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'javascriptreact' });
            assert.strictEqual(editor.document.getText(), '<img src=\'\' alt=\'\' />');
            return vscode_1.workspace.getConfiguration('emmet').update('syntaxProfiles', oldValueForSyntaxProfiles ? oldValueForSyntaxProfiles.globalValue : undefined, vscode_1.ConfigurationTarget.Global);
        });
    });
    test('Expand abbreviation with self closing tags for xml', () => {
        return (0, testUtils_1.withRandomFileEditor)('img', 'xml', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'xml' });
            assert.strictEqual(editor.document.getText(), '<img src="" alt=""/>');
            return Promise.resolve();
        });
    });
    test('Expand abbreviation with no self closing tags for html', () => {
        return (0, testUtils_1.withRandomFileEditor)('img', 'html', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 6, 0, 6);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'html' });
            assert.strictEqual(editor.document.getText(), '<img src="" alt="">');
            return Promise.resolve();
        });
    });
    test('Expand abbreviation with condition containing less than sign for jsx', () => {
        return (0, testUtils_1.withRandomFileEditor)('if (foo < 10) { span.bar', 'javascriptreact', async (editor, _doc) => {
            editor.selection = new vscode_1.Selection(0, 27, 0, 27);
            await (0, abbreviationActions_1.expandEmmetAbbreviation)({ language: 'javascriptreact' });
            assert.strictEqual(editor.document.getText(), 'if (foo < 10) { <span className="bar"></span>');
            return Promise.resolve();
        });
    });
    test('No expanding text inside open tag in completion list (jsx)', () => {
        return testNoCompletion('jsx', htmlContents, new vscode_1.Selection(2, 4, 2, 4));
    });
    test('No expanding tag that is opened, but not closed in completion list (jsx)', () => {
        return testNoCompletion('jsx', htmlContents, new vscode_1.Selection(9, 6, 9, 6));
    });
    test('No expanding text inside open tag when there is no closing tag in completion list (jsx)', () => {
        return testNoCompletion('jsx', htmlContents, new vscode_1.Selection(9, 8, 9, 8));
    });
    test('No expanding text in completion list inside open tag when there is no closing tag when there is no parent node (jsx)', () => {
        return testNoCompletion('jsx', '<img s', new vscode_1.Selection(0, 6, 0, 6));
    });
});
function testExpandAbbreviation(syntax, selection, abbreviation, expandedText, shouldFail) {
    return (0, testUtils_1.withRandomFileEditor)(htmlContents, syntax, async (editor, _doc) => {
        editor.selection = selection;
        const expandPromise = (0, abbreviationActions_1.expandEmmetAbbreviation)(null);
        if (!expandPromise) {
            if (!shouldFail) {
                assert.strictEqual(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
            }
            return Promise.resolve();
        }
        await expandPromise;
        assert.strictEqual(editor.document.getText(), htmlContents.replace(abbreviation, expandedText));
        return Promise.resolve();
    });
}
function testHtmlCompletionProvider(selection, abbreviation, expandedText, shouldFail) {
    return (0, testUtils_1.withRandomFileEditor)(htmlContents, 'html', async (editor, _doc) => {
        editor.selection = selection;
        const cancelSrc = new vscode_1.CancellationTokenSource();
        const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
        if (!completionPromise) {
            if (!shouldFail) {
                assert.strictEqual(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
            }
            return Promise.resolve();
        }
        const completionList = await completionPromise;
        if (!completionList || !completionList.items || !completionList.items.length) {
            if (!shouldFail) {
                assert.strictEqual(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
            }
            return Promise.resolve();
        }
        const emmetCompletionItem = completionList.items[0];
        assert.strictEqual(emmetCompletionItem.label, abbreviation, `Label of completion item doesnt match.`);
        assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
        return Promise.resolve();
    });
}
function testNoCompletion(syntax, fileContents, selection) {
    return (0, testUtils_1.withRandomFileEditor)(fileContents, syntax, (editor, _doc) => {
        editor.selection = selection;
        const cancelSrc = new vscode_1.CancellationTokenSource();
        const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
        assert.strictEqual(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
        return Promise.resolve();
    });
}
//# sourceMappingURL=abbreviationAction.test.js.map