/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection, workspace } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { expandEmmetAbbreviation, wrapWithAbbreviation, wrapIndividualLinesWithAbbreviation } from '../abbreviationActions';

const cssContents = `
.boo {
	margin: 20px 10px;
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
`

const htmlContents = `
<body class="header">
	<ul class="nav main">
		<li class="item1">img</li>
		<li class="item2">hithere</li>
		ul>li
		ul>li*2
		ul>li.item$*2
		ul>li.item$@44*2
		<div
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
		return testHtmlExpandAbbreviation(new Selection(3, 23, 3, 23), 'img', '<img src=\"\" alt=\"\">');
	});

	test('Expand abbreviation (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(5, 25, 5, 25), 'ul>li', '<ul>\n\t\t\t<li></li>\n\t\t</ul>');
	});

	test('Expand text that is neither an abbreviation nor a snippet to tags (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(4, 20, 4, 27), 'hithere', '<hithere></hithere>');
	});

	test('Expand abbreviation with repeaters (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(6, 27, 6, 27), 'ul>li*2', '<ul>\n\t\t\t<li></li>\n\t\t\t<li></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(7, 33, 7, 33), 'ul>li.item$*2', '<ul>\n\t\t\t<li class="item1"></li>\n\t\t\t<li class="item2"></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters with offset (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(8, 36, 8, 36), 'ul>li.item$@44*2', '<ul>\n\t\t\t<li class="item44"></li>\n\t\t\t<li class="item45"></li>\n\t\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters in groups (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(17, 16, 17, 16), '(ul>li.item$)*2', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>');
	});

	test('Expand abbreviation with numbered repeaters in groups with sibling in the end (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(18, 21, 18, 21), '(ul>li.item$)*2+span', '<ul>\n\t\t<li class="item1"></li>\n\t</ul>\n\t<ul>\n\t\t<li class="item2"></li>\n\t</ul>\n\t<span></span>');
	});

	test('Expand abbreviation with nested groups (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(19, 19, 19, 19), '(div>dl>(dt+dd)*2)', '<div>\n\t\t<dl>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t</dl>\n\t</div>');
	});

	test('Expand tag that is opened, but not closed (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(9, 6, 9, 6), '<div', '<div></div>');
	});

	test('No expanding text inside open tag (HTML)', () => {
		return testHtmlExpandAbbreviation(new Selection(2, 4, 2, 4), '', '', true);
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

	test('No expanding when html is excluded in the settings', () => {
		return workspace.getConfiguration('emmet').update('excludeLanguages', ['html']).then(() => {
			return testHtmlExpandAbbreviation(new Selection(9, 6, 9, 6), '', '', true).then(() => {
				return workspace.getConfiguration('emmet').update('excludeLanguages', []);
			});
		});
	});

});

suite('Tests for Expand Abbreviations (CSS)', () => {
	teardown(closeAllEditors);

	test('Expand abbreviation (CSS)', () => {
		return withRandomFileEditor(cssContents, 'css', (editor, doc) => {
			editor.selection = new Selection(4, 1, 4, 4);
			return expandEmmetAbbreviation(null).then(() => {
				assert.equal(editor.document.getText(), cssContents.replace('m10', 'margin: 10px;'));
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
		<li class="item2">hithere</li>
	</ul>
`;
		const wrapIndividualLinesExpected = `
	<ul class="nav main">
		<ul>
			<li class="hello1"><li class="item1">img</li></li>
			<li class="hello2"><li class="item2">hithere</li></li>
		</ul>
	</ul>
`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [new Selection(2, 2, 3, 33)];
			return wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*' }).then(() => {
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
			return wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*|t' }).then(() => {
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
				return expandEmmetAbbreviation({language: 'javascriptreact'}).then(() => {
					assert.equal(editor.document.getText(), '<ul className="nav"></ul>');
					return Promise.resolve();
				});
			});
		});

		test('Expand abbreviation with self closing tags for jsx', () => {
			return withRandomFileEditor('img', 'javascriptreact', (editor, doc) => {
				editor.selection = new Selection(0, 6, 0, 6);
				return expandEmmetAbbreviation({language: 'javascriptreact'}).then(() => {
					assert.equal(editor.document.getText(), '<img src="" alt=""/>');
					return Promise.resolve();
				});
			});
		});

		test('Expand abbreviation with self closing tags for xml', () => {
			return withRandomFileEditor('img', 'xml', (editor, doc) => {
				editor.selection = new Selection(0, 6, 0, 6);
				return expandEmmetAbbreviation({language: 'xml'}).then(() => {
					assert.equal(editor.document.getText(), '<img src="" alt=""/>');
					return Promise.resolve();
				});
			});
		});

		test('Expand abbreviation with no self closing tags for html', () => {
			return withRandomFileEditor('img', 'html', (editor, doc) => {
				editor.selection = new Selection(0, 6, 0, 6);
				return expandEmmetAbbreviation({language: 'html'}).then(() => {
					assert.equal(editor.document.getText(), '<img src="" alt="">');
					return Promise.resolve();
				});
			});
		});

});

function testHtmlExpandAbbreviation(selection: Selection, abbreviation: string, expandedText: string, shouldFail?: boolean): Thenable<any> {
	return withRandomFileEditor(htmlContents, 'html', (editor, doc) => {
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

function testWrapWithAbbreviation(selections: Selection[], abbreviation: string, expectedContents: string): Thenable<any> {
	return withRandomFileEditor(htmlContentsForWrapTests, 'html', (editor, doc) => {
		editor.selections = selections;
		return wrapWithAbbreviation({ abbreviation: abbreviation }).then(() => {
			assert.equal(editor.document.getText(), expectedContents);
			return Promise.resolve();
		});
	});
}
