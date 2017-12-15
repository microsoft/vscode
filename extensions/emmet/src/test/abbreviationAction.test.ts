/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Selection, workspace, CompletionList, CancellationTokenSource, Position } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { expandEmmetAbbreviation, wrapWithAbbreviation, wrapIndividualLinesWithAbbreviation } from '../abbreviationActions';
import { DefaultCompletionItemProvider } from '../defaultCompletionProvider';

const completionProvider = new DefaultCompletionItemProvider();
const cssContents = `
.boo {
	margin: 20px 10px;
	m10
	background-image: url('tryme.png');
	m10
}

.boo .hoo {
	margin: 10px;
	ind
}
`;

const scssContents = `
.boo {
	margin: 10px;
	p10
	.hoo {
		p20
	}
}
@include b(alert) {

	margin: 10px;
	p30

	@include b(alert) {
		p40
	}
}
.foo {
	margin: 10px;
	margin: a
	.hoo {
		color: #000;
	}
}
`;

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
			m10
		}
	</style>
	<span></span>
	(ul>li.item$)*2
	(ul>li.item$)*2+span
	(div>dl>(dt+dd)*2)
</body>
`;

const htmlContentsForWrapTests = `
	<ul class="nav main">
		<li class="item1">img</li>
		<li class="item2">$hithere</li>
	</ul>
`;

const wrapBlockElementExpected = `
	<ul class="nav main">
		<div>
			<li class="item1">img</li>
		</div>
		<div>
			<li class="item2">$hithere</li>
		</div>
	</ul>
`;

const wrapInlineElementExpected = `
	<ul class="nav main">
		<span><li class="item1">img</li></span>
		<span><li class="item2">$hithere</li></span>
	</ul>
`;

const wrapSnippetExpected = `
	<ul class="nav main">
		<a href=""><li class="item1">img</li></a>
		<a href=""><li class="item2">$hithere</li></a>
	</ul>
`;

const wrapMultiLineAbbrExpected = `
	<ul class="nav main">
		<ul>
			<li>
				<li class="item1">img</li>
			</li>
		</ul>
		<ul>
			<li>
				<li class="item2">$hithere</li>
			</li>
		</ul>
	</ul>
`;

suite('Tests for Expand Abbreviations (HTML)', () => {
	teardown(() => {
		// Reset config and close all editors
		return workspace.getConfiguration('emmet').update('excludeLanguages', []).then(closeAllEditors);
	});

	test('Expand snippets (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(3, 23, 3, 23), 'img', '<img src=\"\" alt=\"\">');
	});

	test('Expand snippets in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(3, 23, 3, 23), 'img', '<img src=\"\" alt=\"\">');
	});

	test('Expand snippets when no parent node (HTML)', () => {
		return withRandomFileEditor('img', 'html', (editor, doc) => {
			editor.selection = new Selection(0, 3, 0, 3);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), '<img src=\"\" alt=\"\">');
				return Promise.resolve();
			});
		});
	});

	test('Expand snippets when no parent node in completion list (HTML)', () => {
		return withRandomFileEditor('img', 'html', (editor, doc) => {
			editor.selection = new Selection(0, 3, 0, 3);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			if (!completionPromise) {
				assert.equal(!completionPromise, false, `Got unexpected undefined instead of a completion promise`);
				return Promise.resolve();
			}
			return completionPromise.then(completionList => {
				assert.equal(completionList && completionList.items && completionList.items.length > 0, true);
				if (completionList) {
					assert.equal(completionList.items[0].label, 'img');
					assert.equal((<string>completionList.items[0].documentation || '').replace(/\|/g, ''), '<img src=\"\" alt=\"\">');
				}
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(5, 25, 5, 25), 'ul>li', '<ul>\n\t\t\t<li></li>\n\t\t</ul>');
	});

	test('Expand abbreviation in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(5, 25, 5, 25), 'ul>li', '<ul>\n\t<li></li>\n</ul>');
	});

	test('Expand text that is neither an abbreviation nor a snippet to tags (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(4, 20, 4, 27), 'hithere', '<hithere></hithere>');
	});

	test('Do not Expand text that is neither an abbreviation nor a snippet to tags in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(4, 20, 4, 27), 'hithere', '<hithere></hithere>', true);
	});

	test('Expand abbreviation with repeaters (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(6, 27, 6, 27), 'ul>li*2', '<ul>\n\t\t\t<li></li>\n\t\t\t<li></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with repeaters in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(6, 27, 6, 27), 'ul>li*2', '<ul>\n\t<li></li>\n\t<li></li>\n</ul>');
	});

	test('Expand abbreviation with numbered repeaters (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(7, 33, 7, 33), 'ul>li.item$*2', '<ul>\n\t\t\t<li class="item1"></li>\n\t\t\t<li class="item2"></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(7, 33, 7, 33), 'ul>li.item$*2', '<ul>\n\t<li class="item1"></li>\n\t<li class="item2"></li>\n</ul>');
	});

	test('Expand abbreviation with numbered repeaters with offset (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(8, 36, 8, 36), 'ul>li.item$@44*2', '<ul>\n\t\t\t<li class="item44"></li>\n\t\t\t<li class="item45"></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters with offset in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(8, 36, 8, 36), 'ul>li.item$@44*2', '<ul>\n\t<li class="item44"></li>\n\t<li class="item45"></li>\n</ul>');
	});

	test('Expand abbreviation with numbered repeaters in groups (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(17, 16, 17, 16), '(ul>li.item$)*2', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters in groups in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(17, 16, 17, 16), '(ul>li.item$)*2', '<ul>\n\t<li class="item1"></li>\n</ul>\n<ul>\n\t<li class="item2"></li>\n</ul>');
	});

	test('Expand abbreviation with numbered repeaters in groups with sibling in the end (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(18, 21, 18, 21), '(ul>li.item$)*2+span', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>\n\t<span></span>');
	});

	test('Expand abbreviation with numbered repeaters in groups with sibling in the end in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(18, 21, 18, 21), '(ul>li.item$)*2+span', '<ul>\n\t<li class="item1"></li>\n</ul>\n<ul>\n\t<li class="item2"></li>\n</ul>\n<span></span>');
	});

	test('Expand abbreviation with nested groups (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(19, 19, 19, 19), '(div>dl>(dt+dd)*2)', '<div>\n\t\t<dl>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t</dl>\n\t</div>');
	});

	test('Expand abbreviation with nested groups in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(19, 19, 19, 19), '(div>dl>(dt+dd)*2)', '<div>\n\t<dl>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t</dl>\n</div>');
	});

	test('Expand tag that is opened, but not closed (HTML)', () => {
		return testExpandAbbreviation('html', new Selection(9, 6, 9, 6), '<div', '<div></div>');
	});

	test('Do not Expand tag that is opened, but not closed in completion list (HTML)', () => {
		return testHtmlCompletionProvider(new Selection(9, 6, 9, 6), '<div', '<div></div>', true);
	});

	test('No expanding text inside open tag (HTML)', () => {
		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(2, 4, 2, 4);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), htmlContents);
				return Promise.resolve();
			});
		});
	});

	test('No expanding text inside open tag in completion list (HTML)', () => {
		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(2, 4, 2, 4);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			assert.equal(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
			return Promise.resolve();
		});
	});

	test('No expanding text inside open tag when there is no closing tag (HTML)', () => {
		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(9, 8, 9, 8);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), htmlContents);
				return Promise.resolve();
			});
		});
	});

	test('No expanding text inside open tag when there is no closing tag in completion list (HTML)', () => {
		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(9, 8, 9, 8);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			assert.equal(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
			return Promise.resolve();
		});
	});

	test('No expanding text inside open tag when there is no closing tag when there is no parent node (HTML)', () => {
		const fileContents = '<img s';
		return withRandomFileEditor(fileContents, 'html', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), fileContents);
				return Promise.resolve();
			});
		});
	});

	test('No expanding text in completion list inside open tag when there is no closing tag when there is no parent node (HTML)', () => {
		const fileContents = '<img s';
		return withRandomFileEditor(fileContents, 'html', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			assert.equal(!completionPromise, true, `Got unexpected comapletion promise instead of undefined`);
			return Promise.resolve();
		});
	});

	test('Expand css when inside style tag (HTML)', () => {
		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(13, 3, 13, 6);
			let expandPromise = expandEmmetAbbreviation({ language: 'css' });
			if (!expandPromise) {
				return Promise.resolve();
			}
			return expandPromise.then(() => {
				assert.equal(editor.document.getText(), htmlContents.replace('m10', 'margin: 10px;'));
				return Promise.resolve();
			});
		});
	});

	test('Expand css when inside style tag in completion list (HTML)', () => {
		const abbreviation = 'm10';
		const expandedText = 'margin: 10px;';

		return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
			editor.selection = new Selection(13, 3, 13, 6);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			if (!completionPromise) {
				assert.equal(1, 2, `Problem with expanding m10`);
				return Promise.resolve();
			}

			return completionPromise.then((completionList: CompletionList) => {
				if (!completionList.items || !completionList.items.length) {
					assert.equal(1, 2, `Problem with expanding m10`);
					return Promise.resolve();
				}
				const emmetCompletionItem = completionList.items[0];
				assert.equal(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
				assert.equal((<string>emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
				assert.equal(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
				return Promise.resolve();
			});
		});
	});

	test('No expanding when html is excluded in the settings', () => {
		return workspace.getConfiguration('emmet').update('excludeLanguages', ['html']).then(() => {
			return testExpandAbbreviation('html', new Selection(9, 6, 9, 6), '', '', true).then(() => {
				return workspace.getConfiguration('emmet').update('excludeLanguages', []);
			});
		});
	});

	test('No expanding when html is excluded in the settings in completion list', () => {
		return workspace.getConfiguration('emmet').update('excludeLanguages', ['html']).then(() => {
			return testHtmlCompletionProvider(new Selection(9, 6, 9, 6), '', '', true).then(() => {
				return workspace.getConfiguration('emmet').update('excludeLanguages', []);
			});
		});
	});

	test('No expanding when php (mapped syntax) is excluded in the settings', () => {
		return workspace.getConfiguration('emmet').update('excludeLanguages', ['php']).then(() => {
			return testExpandAbbreviation('php', new Selection(9, 6, 9, 6), '', '', true).then(() => {
				return workspace.getConfiguration('emmet').update('excludeLanguages', []);
			});
		});
	});


});

suite('Tests for Expand Abbreviations (CSS)', () => {
	teardown(closeAllEditors);

	test('Expand abbreviation (CSS)', () => {
		return withRandomFileEditor(cssContents, 'css', (editor, doc) => {
			editor.selections = [new Selection(3, 1, 3, 4), new Selection(5, 1, 5, 4)];
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), cssContents.replace(/m10/g, 'margin: 10px;'));
				return Promise.resolve();
			});
		});
	});

	test('Skip when typing property values when there is a property in the next line (CSS)', () => {
		const testContent = `
.foo {
	margin: a
	margin: 10px;
}		
		`;

		return withRandomFileEditor(testContent, 'css', (editor, doc) => {
			editor.selection = new Selection(2, 10, 2, 10);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), testContent);
				const cancelSrc = new CancellationTokenSource();
				const completionPromise = completionProvider.provideCompletionItems(editor.document, new Position(2, 10), cancelSrc.token);
				if (completionPromise) {
					assert.equal(1, 2, `Invalid completion at property value`);
				}
				return Promise.resolve();
			});
		});
	});

	test('Skip when typing property values when there is a property in the previous line (CSS)', () => {
		const testContent = `
.foo {
	margin: 10px;
	margin: a
}
		`;

		return withRandomFileEditor(testContent, 'css', (editor, doc) => {
			editor.selection = new Selection(3, 10, 3, 10);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), testContent);
				const cancelSrc = new CancellationTokenSource();
				const completionPromise = completionProvider.provideCompletionItems(editor.document, new Position(3, 10), cancelSrc.token);
				if (completionPromise) {
					assert.equal(1, 2, `Invalid completion at property value`);
				}
				return Promise.resolve();
			});
		});
	});

	test('Skip when typing property values when it is the only property in the rule (CSS)', () => {
		const testContent = `
.foo {
	margin: a
}		
		`;

		return withRandomFileEditor(testContent, 'css', (editor, doc) => {
			editor.selection = new Selection(2, 10, 2, 10);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), testContent);
				const cancelSrc = new CancellationTokenSource();
				const completionPromise = completionProvider.provideCompletionItems(editor.document, new Position(2, 10), cancelSrc.token);
				if (completionPromise) {
					assert.equal(1, 2, `Invalid completion at property value`);
				}
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation in completion list (CSS)', () => {
		const abbreviation = 'm10';
		const expandedText = 'margin: 10px;';

		return withRandomFileEditor(cssContents, 'css', (editor, doc) => {
			editor.selection = new Selection(3, 1, 3, 4);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new Position(3, 4), cancelSrc.token);
			const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new Position(5, 4), cancelSrc.token);
			if (!completionPromise1 || !completionPromise2) {
				assert.equal(1, 2, `Problem with expanding m10`);
				return Promise.resolve();
			}

			const callBack = (completionList: CompletionList) => {
				if (!completionList.items || !completionList.items.length) {
					assert.equal(1, 2, `Problem with expanding m10`);
					return;
				}
				const emmetCompletionItem = completionList.items[0];
				assert.equal(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
				assert.equal((<string>emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
				assert.equal(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
			};

			return Promise.all<CompletionList>([completionPromise1, completionPromise2]).then(([result1, result2]) => {
				callBack(result1);
				callBack(result2);
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation (SCSS)', () => {
		return withRandomFileEditor(scssContents, 'scss', (editor, doc) => {
			editor.selections = [
				new Selection(3, 4, 3, 4),
				new Selection(5, 5, 5, 5),
				new Selection(11, 4, 11, 4),
				new Selection(14, 5, 14, 5)
			];
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), scssContents.replace(/p(\d\d)/g, 'padding: $1px;'));
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation in completion list (SCSS)', () => {

		return withRandomFileEditor(scssContents, 'scss', (editor, doc) => {
			editor.selection = new Selection(3, 4, 3, 4);
			const cancelSrc = new CancellationTokenSource();
			const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new Position(3, 4), cancelSrc.token);
			const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new Position(5, 5), cancelSrc.token);
			const completionPromise3 = completionProvider.provideCompletionItems(editor.document, new Position(11, 4), cancelSrc.token);
			const completionPromise4 = completionProvider.provideCompletionItems(editor.document, new Position(14, 5), cancelSrc.token);
			if (!completionPromise1) {
				assert.equal(1, 2, `Problem with expanding padding abbreviations at line 3 col 4`);
			}
			if (!completionPromise2) {
				assert.equal(1, 2, `Problem with expanding padding abbreviations at line 5 col 5`);
			}
			if (!completionPromise3) {
				assert.equal(1, 2, `Problem with expanding padding abbreviations at line 11 col 4`);
			}
			if (!completionPromise4) {
				assert.equal(1, 2, `Problem with expanding padding abbreviations at line 14 col 5`);
			}

			if (!completionPromise1 || !completionPromise2 || !completionPromise3 || !completionPromise4) {
				return Promise.resolve();
			}

			const callBack = (completionList: CompletionList, abbreviation, expandedText) => {
				if (!completionList.items || !completionList.items.length) {
					assert.equal(1, 2, `Problem with expanding m10`);
					return;
				}
				const emmetCompletionItem = completionList.items[0];
				assert.equal(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
				assert.equal((<string>emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
				assert.equal(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
			};

			return Promise.all<CompletionList>([completionPromise1, completionPromise2, completionPromise3, completionPromise4]).then(([result1, result2, result3, result4]) => {
				callBack(result1, 'p10', 'padding: 10px;');
				callBack(result2, 'p20', 'padding: 20px;');
				callBack(result3, 'p30', 'padding: 30px;');
				callBack(result4, 'p40', 'padding: 40px;');
				return Promise.resolve();
			});
		});
	});


	test('Invalid locations for abbreviations in scss', () => {
		const scssContentsNoExpand = `
m10
		.boo {
			margin: 10px;
			.hoo {
				background:
			}
		}
		`;

		return withRandomFileEditor(scssContentsNoExpand, 'scss', (editor, doc) => {
			editor.selections = [
				new Selection(1, 3, 1, 3), // outside rule
				new Selection(5, 15, 5, 15) // in the value part of property value
			];
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), scssContentsNoExpand);
				return Promise.resolve();
			});
		});
	});

	test('Invalid locations for abbreviations in scss in completion list', () => {
		const scssContentsNoExpand = `
m10
		.boo {
			margin: 10px;
			.hoo {
				background:
			}
		}
		`;

		return withRandomFileEditor(scssContentsNoExpand, 'scss', (editor, doc) => {
			editor.selection = new Selection(1, 3, 1, 3); // outside rule
			const cancelSrc = new CancellationTokenSource();
			let completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			if (completionPromise) {
				assert.equal(1, 2, `m10 gets expanded in invalid location (outside rule)`);
			}

			editor.selection = new Selection(5, 15, 5, 15); // in the value part of property value
			completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
			if (completionPromise) {
				return completionPromise.then((completionList: CompletionList) => {
					if (completionList && completionList.items && completionList.items.length > 0) {
						assert.equal(1, 2, `m10 gets expanded in invalid location (n the value part of property value)`);
					}
					return Promise.resolve();
				});
			}
			return Promise.resolve();
		});
	});

});

	test('Skip when typing property values when there is a nested rule in the next line (SCSS)', () => {
		return withRandomFileEditor(scssContents, 'scss', (editor, doc) => {
			editor.selection = new Selection(19, 10, 19, 10);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), scssContents);
				const cancelSrc = new CancellationTokenSource();
				const completionPromise = completionProvider.provideCompletionItems(editor.document, new Position(19, 10), cancelSrc.token);
				if (completionPromise) {
					assert.equal(1, 2, `Invalid completion at property value`);
				}
				return Promise.resolve();
			});
		});
});

suite('Tests for Wrap with Abbreviations', () => {
	teardown(closeAllEditors);

	const multiCursors = [new Selection(2, 6, 2, 6), new Selection(3, 6, 3, 6)];
	const multiCursorsWithSelection = [new Selection(2, 2, 2, 28), new Selection(3, 2, 3, 33)];
	const multiCursorsWithFullLineSelection = [new Selection(2, 0, 2, 28), new Selection(3, 0, 3, 33)];


	test('Wrap with block element using multi cursor', () => {
		return testWrapWithAbbreviation(multiCursors, 'div', wrapBlockElementExpected);
	});

	test('Wrap with inline element using multi cursor', () => {
		return testWrapWithAbbreviation(multiCursors, 'span', wrapInlineElementExpected);
	});

	test('Wrap with snippet using multi cursor', () => {
		return testWrapWithAbbreviation(multiCursors, 'a', wrapSnippetExpected);
	});

	test('Wrap with multi line abbreviation using multi cursor', () => {
		return testWrapWithAbbreviation(multiCursors, 'ul>li', wrapMultiLineAbbrExpected);
	});

	test('Wrap with block element using multi cursor selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithSelection, 'div', wrapBlockElementExpected);
	});

	test('Wrap with inline element using multi cursor selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithSelection, 'span', wrapInlineElementExpected);
	});

	test('Wrap with snippet using multi cursor selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithSelection, 'a', wrapSnippetExpected);
	});

	test('Wrap with multi line abbreviation using multi cursor selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithSelection, 'ul>li', wrapMultiLineAbbrExpected);
	});

	test('Wrap with block element using multi cursor full line selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithFullLineSelection, 'div', wrapBlockElementExpected);
	});

	test('Wrap with inline element using multi cursor full line selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithFullLineSelection, 'span', wrapInlineElementExpected);
	});

	test('Wrap with snippet using multi cursor full line selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithFullLineSelection, 'a', wrapSnippetExpected);
	});

	test('Wrap with multi line abbreviation using multi cursor full line selection', () => {
		return testWrapWithAbbreviation(multiCursorsWithFullLineSelection, 'ul>li', wrapMultiLineAbbrExpected);
	});

	test('Wrap individual lines with abbreviation', () => {
		const contents = `
	<ul class="nav main">
		<li class="item1">img</li>
		<li class="item2">hi.there</li>
	</ul>
`;
		const wrapIndividualLinesExpected = `
	<ul class="nav main">
		<ul>
			<li class="hello1"><li class="item1">img</li></li>
			<li class="hello2"><li class="item2">hi.there</li></li>
		</ul>
	</ul>
`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [new Selection(2, 2, 3, 33)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned udnefined.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), wrapIndividualLinesExpected);
				return Promise.resolve();
			});
		});
	});

	test('Wrap individual lines with abbreviation and trim', () => {
		const contents = `
		<ul class="nav main">
			• lorem ipsum
			• lorem ipsum
		</ul>
	`;
		const wrapIndividualLinesExpected = `
		<ul class="nav main">
			<ul>
				<li class="hello1">lorem ipsum</li>
				<li class="hello2">lorem ipsum</li>
			</ul>
		</ul>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [new Selection(2, 3, 3, 16)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*|t' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned udnefined.');
				return Promise.resolve();
			}

			return promise.then(() => {
				assert.equal(editor.document.getText(), wrapIndividualLinesExpected);
				return Promise.resolve();
			});
		});
	});
});

suite('Tests for jsx, xml and xsl', () => {
	teardown(closeAllEditors);

	test('Expand abbreviation with className instead of class in jsx', () => {
		return withRandomFileEditor('ul.nav', 'javascriptreact', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			return expandEmmetAbbreviation({ language: 'javascriptreact' }).then(() => {
				assert.equal(editor.document.getText(), '<ul className="nav"></ul>');
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation with self closing tags for jsx', () => {
		return withRandomFileEditor('img', 'javascriptreact', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			return expandEmmetAbbreviation({ language: 'javascriptreact' }).then(() => {
				assert.equal(editor.document.getText(), '<img src="" alt=""/>');
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation with self closing tags for xml', () => {
		return withRandomFileEditor('img', 'xml', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			return expandEmmetAbbreviation({ language: 'xml' }).then(() => {
				assert.equal(editor.document.getText(), '<img src="" alt=""/>');
				return Promise.resolve();
			});
		});
	});

	test('Expand abbreviation with no self closing tags for html', () => {
		return withRandomFileEditor('img', 'html', (editor, doc) => {
			editor.selection = new Selection(0, 6, 0, 6);
			return expandEmmetAbbreviation({ language: 'html' }).then(() => {
				assert.equal(editor.document.getText(), '<img src="" alt="">');
				return Promise.resolve();
			});
		});
	});

});

function testExpandAbbreviation(syntax: string, selection: Selection, abbreviation: string, expandedText: string, shouldFail?: boolean): Thenable<any> {
	return withRandomFileEditor(htmlContents, syntax, (editor, doc) => {
		editor.selection = selection;
		let expandPromise = expandEmmetAbbreviation(null);
		if (!expandPromise) {
			if (!shouldFail) {
				assert.equal(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
			}
			return Promise.resolve();
		}
		return expandPromise.then(() => {
			assert.equal(editor.document.getText(), htmlContents.replace(abbreviation, expandedText));
			return Promise.resolve();
		});
	});
}

function testHtmlCompletionProvider(selection: Selection, abbreviation: string, expandedText: string, shouldFail?: boolean): Thenable<any> {
	return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
		editor.selection = selection;
		const cancelSrc = new CancellationTokenSource();
		const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token);
		if (!completionPromise) {
			if (!shouldFail) {
				assert.equal(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
			}
			return Promise.resolve();
		}

		return completionPromise.then((completionList: CompletionList) => {
			if (!completionList.items || !completionList.items.length) {
				if (!shouldFail) {
					assert.equal(1, 2, `Problem with expanding ${abbreviation} to ${expandedText}`);
				}
				return Promise.resolve();
			}
			const emmetCompletionItem = completionList.items[0];
			assert.equal(emmetCompletionItem.label, abbreviation, `Label of completion item doesnt match.`);
			assert.equal((<string>emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
			return Promise.resolve();
		});
	});
}

function testWrapWithAbbreviation(selections: Selection[], abbreviation: string, expectedContents: string): Thenable<any> {
	return withRandomFileEditor(htmlContentsForWrapTests, 'html', (editor, doc) => {
		editor.selections = selections;
		const promise = wrapWithAbbreviation({ abbreviation });
		if (!promise) {
			assert.equal(1, 2, 'Wrap  with Abbreviation returned udnefined.');
			return Promise.resolve();
		}

		return promise.then(() => {
			assert.equal(editor.document.getText(), expectedContents);
			return Promise.resolve();
		});
	});
}
