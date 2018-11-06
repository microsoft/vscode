/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Selection, workspace, ConfigurationTarget } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { wrapWithAbbreviation, wrapIndividualLinesWithAbbreviation } from '../abbreviationActions';

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

const wrapInlineElementExpectedFormatFalse = `
	<ul class="nav main">
		<h1><li class="item1">img</li></h1>
		<h1><li class="item2">$hithere</li></h1>
	</ul>
`;

suite('Tests for Wrap with Abbreviations', () => {
	teardown(closeAllEditors);

	const multiCursors = [new Selection(2, 6, 2, 6), new Selection(3, 6, 3, 6)];
	const multiCursorsWithSelection = [new Selection(2, 2, 2, 28), new Selection(3, 2, 3, 33)];
	const multiCursorsWithFullLineSelection = [new Selection(2, 0, 2, 28), new Selection(3, 0, 4, 0)];

	const oldValueForSyntaxProfiles = workspace.getConfiguration('emmet').inspect('syntaxProfile');

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

	test('Wrap with abbreviation and comment filter', () => {
		const contents = `
	<ul class="nav main">
		line
	</ul>
	`;
		const expectedContents = `
	<ul class="nav main">
		<li class="hello">
			line
		</li>
		<!-- /.hello -->
	</ul>
	`;

		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(2, 0, 2, 0)];
			const promise = wrapWithAbbreviation({ abbreviation: 'li.hello|c' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap returned undefined instead of promise.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('Wrap with abbreviation entire node when cursor is on opening tag', () => {
		const contents = `
	<div class="nav main">
		hello
	</div>
	`;
		const expectedContents = `
	<div>
		<div class="nav main">
			hello
		</div>
	</div>
	`;

		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(1, 1, 1, 1)];
			const promise = wrapWithAbbreviation({ abbreviation: 'div' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap returned undefined instead of promise.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('Wrap with abbreviation entire node when cursor is on closing tag', () => {
		const contents = `
	<div class="nav main">
		hello
	</div>
	`;
		const expectedContents = `
	<div>
		<div class="nav main">
			hello
		</div>
	</div>
	`;

		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(3, 1, 3, 1)];
			const promise = wrapWithAbbreviation({ abbreviation: 'div' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap returned undefined instead of promise.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('Wrap with multiline abbreviation doesnt add extra spaces', () => {
		// Issue #29898
		const contents = `
	hello
	`;
		const expectedContents = `
	<ul>
		<li><a href="">hello</a></li>
	</ul>
	`;

		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(1, 2, 1, 2)];
			const promise = wrapWithAbbreviation({ abbreviation: 'ul>li>a' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap returned undefined instead of promise.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('Wrap individual lines with abbreviation', () => {
		const contents = `
	<ul class="nav main">
		<li class="item1">This $10 is not a tabstop</li>
		<li class="item2">hi.there</li>
	</ul>
`;
		const wrapIndividualLinesExpected = `
	<ul class="nav main">
		<ul>
			<li class="hello1"><li class="item1">This $10 is not a tabstop</li></li>
			<li class="hello2"><li class="item2">hi.there</li></li>
		</ul>
	</ul>
`;
		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(2, 2, 3, 33)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned undefined.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), wrapIndividualLinesExpected);
				return Promise.resolve();
			});
		});
	});

	test('Wrap individual lines with abbreviation with extra space selected', () => {
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
		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(2, 1, 4, 0)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned undefined.');
				return Promise.resolve();
			}
			return promise.then(() => {
				assert.equal(editor.document.getText(), wrapIndividualLinesExpected);
				return Promise.resolve();
			});
		});
	});

	test('Wrap individual lines with abbreviation with comment filter', () => {
		const contents = `
	<ul class="nav main">
		<li class="item1">img</li>
		<li class="item2">hi.there</li>
	</ul>
`;
		const wrapIndividualLinesExpected = `
	<ul class="nav main">
		<ul>
			<li class="hello"><li class="item1">img</li></li>
			<!-- /.hello -->
			<li class="hello"><li class="item2">hi.there</li></li>
			<!-- /.hello -->
		</ul>
	</ul>
`;
		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(2, 2, 3, 33)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello*|c' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned undefined.');
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
		return withRandomFileEditor(contents, 'html', (editor, _) => {
			editor.selections = [new Selection(2, 3, 3, 16)];
			const promise = wrapIndividualLinesWithAbbreviation({ abbreviation: 'ul>li.hello$*|t' });
			if (!promise) {
				assert.equal(1, 2, 'Wrap Individual Lines with Abbreviation returned undefined.');
				return Promise.resolve();
			}

			return promise.then(() => {
				assert.equal(editor.document.getText(), wrapIndividualLinesExpected);
				return Promise.resolve();
			});
		});
	});

	test('Wrap with abbreviation and format set to false', () => {
		return workspace.getConfiguration('emmet').update('syntaxProfiles',{ 'html' : { 'format': false } } , ConfigurationTarget.Global).then(() => {
			return testWrapWithAbbreviation(multiCursors,'h1',wrapInlineElementExpectedFormatFalse).then(() => {
				return workspace.getConfiguration('emmet').update('syntaxProfiles',oldValueForSyntaxProfiles ? oldValueForSyntaxProfiles.globalValue : undefined, ConfigurationTarget.Global);
			});
		});
	});

	test('Wrap multi line selections with abbreviation', () => {
		const htmlContentsForWrapMultiLineTests = `
			<ul class="nav main">
				line1
				line2

				line3
				line4
			</ul>
		`;

		const wrapMultiLineExpected = `
			<ul class="nav main">
				<div>
					line1
					line2
				</div>

				<div>
					line3
					line4
				</div>
			</ul>
		`;

		return testWrapWithAbbreviation([new Selection(2, 4, 3, 9), new Selection(5, 4, 6, 9)], 'div', wrapMultiLineExpected, htmlContentsForWrapMultiLineTests);
	});
});


function testWrapWithAbbreviation(selections: Selection[], abbreviation: string, expectedContents: string, input: string = htmlContentsForWrapTests): Thenable<any> {
	return withRandomFileEditor(input, 'html', (editor, _) => {
		editor.selections = selections;
		const promise = wrapWithAbbreviation({ abbreviation });
		if (!promise) {
			assert.equal(1, 2, 'Wrap  with Abbreviation returned undefined.');
			return Promise.resolve();
		}

		return promise.then(() => {
			assert.equal(editor.document.getText(), expectedContents);
			return Promise.resolve();
		});
	});
}
