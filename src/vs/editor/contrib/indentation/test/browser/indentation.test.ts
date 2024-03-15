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
import { createModelServices, createTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

function testIndentationToSpacesCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}

function testIndentationToTabsCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}

suite('Indentation - TypeScript/Javascript', () => {

	let languageId: string;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
		languageId = 'ts-test';
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Change Indentation to Spaces', () => {

		setup(() => {
			const instantiationService = createModelServices(disposables);
			instantiateContext(instantiationService, true);
		});

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

	suite('Change Indentation to Tabs', () => {

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

	suite('Auto Indent On Paste', () => {

		test('issue #119225: Do not add extra leading space when pasting JSDoc', () => {
			const model = createTextModel("", languageId, {});
			disposables.add(model);
			withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {

				instantiateContext(instantiationService);
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

	suite('Keep Indent On Paste', () => {

		test('issue #167299: Blank line removes indent', () => {
			const model = createTextModel("", languageId, {});
			disposables.add(model);
			withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {

				instantiateContext(instantiationService);
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

		// TODO: tokenization is not corerct, hence why the test does not reflect the real behavior
		test('issue #181065: Incorrect paste', () => {
			const model = createTextModel("", languageId, {});
			disposables.add(model);
			withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {

				instantiateContext(instantiationService);
				const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
				const pasteText = [
					'/**',
					' * @typedef {',
					' * }',
					' */',
				].join('\n');

				viewModel.paste(pasteText, true, undefined, 'keyboard');
				autoIndentOnPasteController.trigger(new Range(1, 1, 4, 4));
				assert.strictEqual(model.getValue(), pasteText);
			});
		});
	});

	// suite('Auto Indent On Type', () => {
	// 	test('issue #193875: incorrect indentation', () => {
	// 		const model = createTextModel([
	// 			'{',
	// 			'	for(;;)',
	// 			'	for(;;) {}',
	// 			'}'
	// 		].join('\n'), languageId, {});
	// 		disposables.add(model);
	// 		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
	// 			instantiateContext(instantiationService);
	// 			// viewModel.type([
	// 			// 	'{',
	// 			// 	'	for(;;)',
	// 			// 	'	for(;;) {}',
	// 			// 	'}'
	// 			// ].join('\n'));
	// 			viewModel.setSelections('test', [new Selection(3, 11, 3, 11)]);
	// 			viewModel.type("\n", 'keyboard');
	// 			assert.strictEqual(model.getValue(), [
	// 				'{',
	// 				'	for(;;)',
	// 				'	for(;;) {',
	// 				'}',
	// 				'}'
	// 			].join('\n'));
	// 		});
	// 	});
	// });

	function instantiateContext(instantiationService: TestInstantiationService, includeTokenization: boolean = false) {
		const languageService = instantiationService.get(ILanguageService);
		const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		disposables.add(languageService.registerLanguage({ id: languageId }));
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
		if (includeTokenization) {
			disposables.add(TokenizationRegistry.register(languageId, {
				getInitialState: (): IState => NullState,
				tokenize: () => {
					throw new Error('not implemented');
				},
				tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
					console.log('tokenizeEncoded', line, hasEOL, state);
					const tokensArr: number[] = [];
					if (line.indexOf('*') !== -1) {
						console.log('first');
						tokensArr.push(0);
						tokensArr.push(StandardTokenType.Comment << MetadataConsts.TOKEN_TYPE_OFFSET);
					} else {
						console.log('second');
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
		}
	}
});

suite('Indentation - Ruby', () => {

	let languageId: string;
	let disposables: DisposableStore;

	setup(() => {
		languageId = 'ruby-test';
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Auto Indent On Type', () => {

		test('issue #198350: in or when incorrectly match non keywords for Ruby', () => {
			const model = createTextModel("", languageId, {});
			disposables.add(model);

			withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

				instantiateContext(instantiationService);

				viewModel.type("def foo\n        i");
				viewModel.type("n", 'keyboard');
				assert.strictEqual(model.getValue(), "def foo\n        in");
				viewModel.type(" ", 'keyboard');
				assert.strictEqual(model.getValue(), "def foo\nin ");

				viewModel.model.setValue("");
				viewModel.type("  # in");
				assert.strictEqual(model.getValue(), "  # in");
				viewModel.type(" ", 'keyboard');
				assert.strictEqual(model.getValue(), "  # in ");
			});
		});
	});

	function instantiateContext(instantiationService: TestInstantiationService) {
		const languageService = instantiationService.get(ILanguageService);
		const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
			indentationRules: {
				decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif)\b|(in|when)\s)/,
				increaseIndentPattern: /^\s*((begin|class|(private|protected)\s+def|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|in|while|case)|([^#]*\sdo\b)|([^#]*=\s*(case|if|unless)))\b([^#\{;]|(\"|'|\/).*\4)*(#.*)?$/,
			},
		}));
	}
});
