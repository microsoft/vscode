/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { MetadataConsts, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IState, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { AutoIndentOnPaste, IndentationToSpacesCommand, IndentationToTabsCommand } from 'vs/editor/contrib/indentation/browser/indentation';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { testCommand } from 'vs/editor/test/browser/testCommand';
import { javascriptIndentationRules } from 'vs/editor/test/common/modes/supports/javascriptIndentationRules';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

function testIndentationToSpacesCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}

function testIndentationToTabsCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}

suite('Editor Contrib - Indentation to Spaces', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('single tabs only at start of line', function () {
		testIndentationToSpacesCommand(
			[
				'first',
				'second line',
				'third line',
				'\tfourth line',
				'\tfifth'
			],
			new Selection(2, 3, 2, 3),
			4,
			[
				'first',
				'second line',
				'third line',
				'    fourth line',
				'    fifth'
			],
			new Selection(2, 3, 2, 3)
		);
	});

	test('multiple tabs at start of line', function () {
		testIndentationToSpacesCommand(
			[
				'\t\tfirst',
				'\tsecond line',
				'\t\t\t third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5),
			3,
			[
				'      first',
				'   second line',
				'          third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 1, 9)
		);
	});

	test('multiple tabs', function () {
		testIndentationToSpacesCommand(
			[
				'\t\tfirst\t',
				'\tsecond  \t line \t',
				'\t\t\t third line',
				' \tfourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5),
			2,
			[
				'    first\t',
				'  second  \t line \t',
				'       third line',
				'   fourth line',
				'fifth'
			],
			new Selection(1, 7, 1, 7)
		);
	});

	test('empty lines', function () {
		testIndentationToSpacesCommand(
			[
				'\t\t\t',
				'\t',
				'\t\t'
			],
			new Selection(1, 4, 1, 4),
			2,
			[
				'      ',
				'  ',
				'    '
			],
			new Selection(1, 4, 1, 4)
		);
	});
});

suite('Editor Contrib - Indentation to Tabs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('spaces only at start of line', function () {
		testIndentationToTabsCommand(
			[
				'    first',
				'second line',
				'    third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3),
			4,
			[
				'\tfirst',
				'second line',
				'\tthird line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3)
		);
	});

	test('multiple spaces at start of line', function () {
		testIndentationToTabsCommand(
			[
				'first',
				'   second line',
				'          third line',
				'fourth line',
				'     fifth'
			],
			new Selection(1, 5, 1, 5),
			3,
			[
				'first',
				'\tsecond line',
				'\t\t\t third line',
				'fourth line',
				'\t  fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('multiple spaces', function () {
		testIndentationToTabsCommand(
			[
				'      first   ',
				'  second     line \t',
				'       third line',
				'   fourth line',
				'fifth'
			],
			new Selection(1, 8, 1, 8),
			2,
			[
				'\t\t\tfirst   ',
				'\tsecond     line \t',
				'\t\t\t third line',
				'\t fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('issue #45996', function () {
		testIndentationToSpacesCommand(
			[
				'\tabc',
			],
			new Selection(1, 3, 1, 3),
			4,
			[
				'    abc',
			],
			new Selection(1, 6, 1, 6)
		);
	});
});

suite('Editor Contrib - Auto Indent On Paste', () => {
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #119225: Do not add extra leading space when pasting JSDoc', () => {
		const languageId = 'leadingSpacePaste';
		const model = createTextModel("", languageId, {});
		disposables.add(model);
		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageService);
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			disposables.add(languageService.registerLanguage({ id: languageId }));
			disposables.add(TokenizationRegistry.register(languageId, {
				getInitialState: (): IState => NullState,
				tokenize: () => {
					throw new Error('not implemented');
				},
				tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
					const tokensArr: number[] = [];
					if (line.indexOf('*') !== -1) {
						tokensArr.push(0);
						tokensArr.push(StandardTokenType.Comment << MetadataConsts.TOKEN_TYPE_OFFSET);
					} else {
						tokensArr.push(0);
						tokensArr.push(StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET);
					}
					const tokens = new Uint32Array(tokensArr.length);
					for (let i = 0; i < tokens.length; i++) {
						tokens[i] = tokensArr[i];
					}
					return new EncodedTokenizationResult(tokens, state);
				}
			}));
			disposables.add(languageConfigurationService.register(languageId, {
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')']
				],
				comments: {
					lineComment: '//',
					blockComment: ['/*', '*/']
				},
				indentationRules: javascriptIndentationRules,
				onEnterRules: javascriptOnEnterRules
			}));

			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			const pasteText = [
				'/**',
				' * JSDoc',
				' */',
				'function a() {}'
			].join('\n');

			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 16));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});
});

suite('Editor Contrib - Keep Indent On Paste', () => {
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #167299: Blank line removes indent', () => {
		const languageId = 'blankLineRemovesIndent';
		const model = createTextModel("", languageId, {});
		disposables.add(model);
		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageService);
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			disposables.add(languageService.registerLanguage({ id: languageId }));
			disposables.add(languageConfigurationService.register(languageId, {
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')']
				],
				indentationRules: javascriptIndentationRules,
				onEnterRules: javascriptOnEnterRules
			}));

			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			const pasteText = [
				'',
				'export type IncludeReference =',
				'	| BaseReference',
				'	| SelfReference',
				'	| RelativeReference;',
				'',
				'export const enum IncludeReferenceKind {',
				'	Base,',
				'	Self,',
				'	RelativeReference,',
				'}'
			].join('\n');

			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 11, 2));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});
});
