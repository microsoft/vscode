/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { MetadataConsts, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { AutoIndentOnPaste, IndentationToSpacesCommand, IndentationToTabsCommand } from 'vs/editor/contrib/indentation/browser/indentation';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { testCommand } from 'vs/editor/test/browser/testCommand';
import { goIndentationRules, htmlIndentationRules, javascriptIndentationRules, latexIndentationRules, luaIndentationRules, phpIndentationRules, rubyIndentationRules } from 'vs/editor/test/common/modes/supports/indentationRules';
import { cppOnEnterRules, htmlOnEnterRules, javascriptOnEnterRules, phpOnEnterRules } from 'vs/editor/test/common/modes/supports/onEnterRules';
import { TypeOperations } from 'vs/editor/common/cursor/cursorTypeOperations';
import { cppBracketRules, goBracketRules, htmlBracketRules, latexBracketRules, luaBracketRules, phpBracketRules, rubyBracketRules, typescriptBracketRules, vbBracketRules } from 'vs/editor/test/common/modes/supports/bracketRules';
import { latexAutoClosingPairsRules } from 'vs/editor/test/common/modes/supports/autoClosingPairsRules';

enum Language {
	TypeScript = 'ts-test',
	Ruby = 'ruby-test',
	PHP = 'php-test',
	Go = 'go-test',
	CPP = 'cpp-test',
	HTML = 'html-test',
	VB = 'vb-test',
	Latex = 'latex-test',
	Lua = 'lua-test'
}

function testIndentationToSpacesCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}

function testIndentationToTabsCommand(lines: string[], selection: Selection, tabSize: number, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}

function registerLanguage(instantiationService: TestInstantiationService, language: Language): IDisposable {
	const disposables = new DisposableStore();
	const languageService = instantiationService.get(ILanguageService);
	disposables.add(registerLanguageConfiguration(instantiationService, language));
	disposables.add(languageService.registerLanguage({ id: language }));
	return disposables;
}

function registerLanguageConfiguration(instantiationService: TestInstantiationService, language: Language): IDisposable {
	const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
	switch (language) {
		case Language.TypeScript:
			return languageConfigurationService.register(language, {
				brackets: typescriptBracketRules,
				comments: {
					lineComment: '//',
					blockComment: ['/*', '*/']
				},
				indentationRules: javascriptIndentationRules,
				onEnterRules: javascriptOnEnterRules
			});
		case Language.Ruby:
			return languageConfigurationService.register(language, {
				brackets: rubyBracketRules,
				indentationRules: rubyIndentationRules,
			});
		case Language.PHP:
			return languageConfigurationService.register(language, {
				brackets: phpBracketRules,
				indentationRules: phpIndentationRules,
				onEnterRules: phpOnEnterRules
			});
		case Language.Go:
			return languageConfigurationService.register(language, {
				brackets: goBracketRules,
				indentationRules: goIndentationRules
			});
		case Language.CPP:
			return languageConfigurationService.register(language, {
				brackets: cppBracketRules,
				onEnterRules: cppOnEnterRules
			});
		case Language.HTML:
			return languageConfigurationService.register(language, {
				brackets: htmlBracketRules,
				indentationRules: htmlIndentationRules,
				onEnterRules: htmlOnEnterRules
			});
		case Language.VB:
			return languageConfigurationService.register(language, {
				brackets: vbBracketRules,
			});
		case Language.Latex:
			return languageConfigurationService.register(language, {
				brackets: latexBracketRules,
				autoClosingPairs: latexAutoClosingPairsRules,
				indentationRules: latexIndentationRules
			});
		case Language.Lua:
			return languageConfigurationService.register(language, {
				brackets: luaBracketRules,
				indentationRules: luaIndentationRules
			});
	}
}

interface StandardTokenTypeData {
	startIndex: number;
	standardTokenType: StandardTokenType;
}

function registerTokenizationSupport(instantiationService: TestInstantiationService, tokens: StandardTokenTypeData[][], languageId: string): IDisposable {
	let lineIndex = 0;
	const languageService = instantiationService.get(ILanguageService);
	const tokenizationSupport: ITokenizationSupport = {
		getInitialState: () => NullState,
		tokenize: undefined!,
		tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
			const tokensOnLine = tokens[lineIndex++];
			const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
			const result = new Uint32Array(2 * tokensOnLine.length);
			for (let i = 0; i < tokensOnLine.length; i++) {
				result[2 * i] = tokensOnLine[i].startIndex;
				result[2 * i + 1] =
					(
						(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
						| (tokensOnLine[i].standardTokenType << MetadataConsts.TOKEN_TYPE_OFFSET)
					);
			}
			return new EncodedTokenizationResult(result, state);
		}
	};
	return TokenizationRegistry.register(languageId, tokenizationSupport);
}

suite('Change Indentation to Spaces - TypeScript/Javascript', () => {

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

suite('Change Indentation to Tabs -  TypeScript/Javascript', () => {

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

suite('Indent With Tab - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #63388: perserve correct indentation on tab 1', () => {

		// https://github.com/microsoft/vscode/issues/63388

		const model = createTextModel([
			'/*',
			' * Comment',
			' * /',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 1, 3, 5));
			editor.executeCommands('editor.action.indentLines', TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
			assert.strictEqual(model.getValue(), [
				'    /*',
				'     * Comment',
				'     * /',
			].join('\n'));
		});
	});

	test.skip('issue #63388: perserve correct indentation on tab 2', () => {

		// https://github.com/microsoft/vscode/issues/63388

		const model = createTextModel([
			'switch (something) {',
			'  case 1:',
			'    whatever();',
			'    break;',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 1, 5, 2));
			editor.executeCommands('editor.action.indentLines', TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
			assert.strictEqual(model.getValue(), [
				'    switch (something) {',
				'        case 1:',
				'            whatever();',
				'            break;',
				'    }',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Paste - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #119225: Do not add extra leading space when pasting JSDoc', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const pasteText = [
				'/**',
				' * JSDoc',
				' */',
				'function a() {}'
			].join('\n');
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Comment },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 2, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 8, standardTokenType: StandardTokenType.Comment },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 1, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Other },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 8, standardTokenType: StandardTokenType.Other },
					{ startIndex: 9, standardTokenType: StandardTokenType.Other },
					{ startIndex: 10, standardTokenType: StandardTokenType.Other },
					{ startIndex: 11, standardTokenType: StandardTokenType.Other },
					{ startIndex: 12, standardTokenType: StandardTokenType.Other },
					{ startIndex: 13, standardTokenType: StandardTokenType.Other },
					{ startIndex: 14, standardTokenType: StandardTokenType.Other },
					{ startIndex: 15, standardTokenType: StandardTokenType.Other },
				]
			];
			disposables.add(registerLanguage(instantiationService, languageId));
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 16));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});

	test('issue #167299: Blank line removes indent', () => {

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {

			// no need for tokenization because there are no comments
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

			disposables.add(registerLanguage(instantiationService, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(pasteText, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 11, 2));
			assert.strictEqual(model.getValue(), pasteText);
		});
	});

	test('issue #29803: do not indent when pasting text with only one line', () => {

		// https://github.com/microsoft/vscode/issues/29803

		const model = createTextModel([
			'const linkHandler = new Class(a, b, c,',
			'    d)'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 6, 2, 6));
			const text = ', null';
			viewModel.paste(text, true, undefined, 'keyboard');
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			autoIndentOnPasteController.trigger(new Range(2, 6, 2, 11));
			assert.strictEqual(model.getValue(), [
				'const linkHandler = new Class(a, b, c,',
				'    d, null)'
			].join('\n'));
		});
	});

	test('issue #29753: incorrect indentation after comment', () => {

		// https://github.com/microsoft/vscode/issues/29753

		const model = createTextModel([
			'class A {',
			'    /**',
			'     * used only for debug purposes.',
			'     */',
			'    private _codeInfo: KeyMapping[];',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(5, 24, 5, 34));
			const text = 'IMacLinuxKeyMapping';
			viewModel.paste(text, true, undefined, 'keyboard');
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			autoIndentOnPasteController.trigger(new Range(5, 24, 5, 43));
			assert.strictEqual(model.getValue(), [
				'class A {',
				'    /**',
				'     * used only for debug purposes.',
				'     */',
				'    private _codeInfo: IMacLinuxKeyMapping[];',
				'}',
			].join('\n'));
		});
	});

	test('issue #29753: incorrect indentation of header comment', () => {

		// https://github.com/microsoft/vscode/issues/29753

		const model = createTextModel('', languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			const text = [
				'/*----------------',
				' *  Copyright (c) ',
				' *  Licensed under ...',
				' *-----------------*/',
			].join('\n');
			viewModel.paste(text, true, undefined, 'keyboard');
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 22));
			assert.strictEqual(model.getValue(), text);
		});
	});

	// Failing tests found in issues...

	test.skip('issue #181065: Incorrect paste of object within comment', () => {

		// https://github.com/microsoft/vscode/issues/181065

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const text = [
				'/**',
				' * @typedef {',
				' * }',
				' */'
			].join('\n');
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Comment },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 2, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 11, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 12, standardTokenType: StandardTokenType.Other },
					{ startIndex: 13, standardTokenType: StandardTokenType.Other },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 2, standardTokenType: StandardTokenType.Other },
					{ startIndex: 3, standardTokenType: StandardTokenType.Other },
					{ startIndex: 4, standardTokenType: StandardTokenType.Other },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 1, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Other },
				]
			];
			disposables.add(registerLanguage(instantiationService, languageId));
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 4));
			assert.strictEqual(model.getValue(), text);
		});
	});

	test.skip('issue #86301: preserve cursor at inserted indentation level', () => {

		// https://github.com/microsoft/vscode/issues/86301

		const model = createTextModel([
			'() => {',
			'',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			editor.setSelection(new Selection(2, 1, 2, 1));
			const text = [
				'() => {',
				'',
				'}',
				''
			].join('\n');
			disposables.add(registerLanguage(instantiationService, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(2, 1, 5, 1));

			// notes:
			// why is line 3 not indented to the same level as line 2?
			// looks like the indentation is inserted correctly at line 5, but the cursor does not appear at the maximum indentation level?
			assert.strictEqual(model.getValue(), [
				'() => {',
				'    () => {',
				'    ', // <- should also be indented
				'    }',
				'    ', // <- cursor should be at the end of the indentation
				'}',
			].join('\n'));

			const selection = viewModel.getSelection();
			assert.deepStrictEqual(selection, new Selection(5, 5, 5, 5));
		});
	});

	test.skip('issue #85781: indent line with extra white space', () => {

		// https://github.com/microsoft/vscode/issues/85781
		// note: still to determine whether this is a bug or not

		const model = createTextModel([
			'() => {',
			'    console.log("a");',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			editor.setSelection(new Selection(2, 5, 2, 5));
			const text = [
				'() => {',
				'    console.log("b")',
				'}',
				' '
			].join('\n');
			disposables.add(registerLanguage(instantiationService, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			// todo@aiday-mar, make sure range is correct, and make test work as in real life
			autoIndentOnPasteController.trigger(new Range(2, 5, 5, 6));
			assert.strictEqual(model.getValue(), [
				'() => {',
				'    () => {',
				'        console.log("b")',
				'    }',
				'    console.log("a");',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #29589: incorrect indentation of closing brace on paste', () => {

		// https://github.com/microsoft/vscode/issues/29589

		const model = createTextModel('', languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			editor.setSelection(new Selection(2, 5, 2, 5));
			const text = [
				'function makeSub(a,b) {',
				'subsent = sent.substring(a,b);',
				'return subsent;',
				'}',
			].join('\n');
			disposables.add(registerLanguage(instantiationService, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			// todo@aiday-mar, make sure range is correct, and make test work as in real life
			autoIndentOnPasteController.trigger(new Range(1, 1, 4, 2));
			assert.strictEqual(model.getValue(), [
				'function makeSub(a,b) {',
				'subsent = sent.substring(a,b);',
				'return subsent;',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #201420: incorrect indentation when first line is comment', () => {

		// https://github.com/microsoft/vscode/issues/201420

		const model = createTextModel([
			'function bar() {',
			'',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 8, standardTokenType: StandardTokenType.Other },
					{ startIndex: 9, standardTokenType: StandardTokenType.Other },
					{ startIndex: 12, standardTokenType: StandardTokenType.Other },
					{ startIndex: 13, standardTokenType: StandardTokenType.Other },
					{ startIndex: 14, standardTokenType: StandardTokenType.Other },
					{ startIndex: 15, standardTokenType: StandardTokenType.Other },
					{ startIndex: 16, standardTokenType: StandardTokenType.Other }
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 2, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 3, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 10, standardTokenType: StandardTokenType.Comment }
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 5, standardTokenType: StandardTokenType.Other },
					{ startIndex: 6, standardTokenType: StandardTokenType.Other },
					{ startIndex: 9, standardTokenType: StandardTokenType.Other },
					{ startIndex: 10, standardTokenType: StandardTokenType.Other },
					{ startIndex: 11, standardTokenType: StandardTokenType.Other },
					{ startIndex: 12, standardTokenType: StandardTokenType.Other },
					{ startIndex: 14, standardTokenType: StandardTokenType.Other }],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 1, standardTokenType: StandardTokenType.Other }]
			];
			disposables.add(registerLanguage(instantiationService, languageId));
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));

			editor.setSelection(new Selection(2, 1, 2, 1));
			const text = [
				'// comment',
				'const foo = 42',
			].join('\n');
			disposables.add(registerLanguage(instantiationService, languageId));
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(2, 1, 3, 15));
			assert.strictEqual(model.getValue(), [
				'function bar() {',
				'    // comment',
				'    const foo = 42',
				'}',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// Failing tests from issues...

	test('issue #208215: indent after arrow function', () => {

		// https://github.com/microsoft/vscode/issues/208215

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			viewModel.type('const add1 = (n) =>');
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const add1 = (n) =>',
				'    ',
			].join('\n'));
		});
	});

	test('issue #208215: indent after arrow function 2', () => {

		// https://github.com/microsoft/vscode/issues/208215

		const model = createTextModel([
			'const array = [1, 2, 3, 4, 5];',
			'array.map(',
			'    v =>',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 9, 3, 9));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3, 4, 5];',
				'array.map(',
				'    v =>',
				'        '
			].join('\n'));
		});
	});

	test('issue #116843: indent after arrow function', () => {

		// https://github.com/microsoft/vscode/issues/116843

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));

			viewModel.type([
				'const add1 = (n) =>',
				'    n + 1;',
			].join('\n'));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const add1 = (n) =>',
				'    n + 1;',
				'',
			].join('\n'));
		});
	});

	test('issue #29755: do not add indentation on enter if indentation is already valid', () => {

		//https://github.com/microsoft/vscode/issues/29755

		const model = createTextModel([
			'function f() {',
			'    const one = 1;',
			'    const two = 2;',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 1, 3, 1));
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function f() {',
				'    const one = 1;',
				'',
				'    const two = 2;',
				'}',
			].join('\n'));
		});
	});

	test('issue #36090', () => {

		// https://github.com/microsoft/vscode/issues/36090

		const model = createTextModel([
			'class ItemCtrl {',
			'    getPropertiesByItemId(id) {',
			'        return this.fetchItem(id)',
			'            .then(item => {',
			'                return this.getPropertiesOfItem(item);',
			'            });',
			'    }',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'advanced' }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(7, 6, 7, 6));
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(),
				[
					'class ItemCtrl {',
					'    getPropertiesByItemId(id) {',
					'        return this.fetchItem(id)',
					'            .then(item => {',
					'                return this.getPropertiesOfItem(item);',
					'            });',
					'    }',
					'    ',
					'}',
				].join('\n')
			);
			assert.deepStrictEqual(editor.getSelection(), new Selection(8, 5, 8, 5));
		});
	});

	test('issue #115304: indent block comment onEnter', () => {

		// https://github.com/microsoft/vscode/issues/115304

		const model = createTextModel([
			'/** */',
			'function f() {}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: 'advanced' }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 4, 1, 4));
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(),
				[
					'/**',
					' * ',
					' */',
					'function f() {}',
				].join('\n')
			);
			assert.deepStrictEqual(editor.getSelection(), new Selection(2, 4, 2, 4));
		});
	});

	test('issue #43244: indent when lambda arrow function is detected, outdent when end is reached', () => {

		// https://github.com/microsoft/vscode/issues/43244

		const model = createTextModel([
			'const array = [1, 2, 3, 4, 5];',
			'array.map(_)'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 12, 2, 12));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3, 4, 5];',
				'array.map(_',
				'    ',
				')'
			].join('\n'));
		});
	});

	test('issue #43244: incorrect indentation after if/for/while without braces', () => {

		// https://github.com/microsoft/vscode/issues/43244

		const model = createTextModel([
			'function f() {',
			'    if (condition)',
			'}'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 19, 2, 19));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function f() {',
				'    if (condition)',
				'        ',
				'}',
			].join('\n'));

			viewModel.type("return;");
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function f() {',
				'    if (condition)',
				'        return;',
				'    ',
				'}',
			].join('\n'));
		});
	});

	// Failing tests...

	test.skip('issue #208232: incorrect indentation inside of comments', () => {

		// https://github.com/microsoft/vscode/issues/208232

		const model = createTextModel([
			'/**',
			'indentation done for {',
			'*/'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 23, 2, 23));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'/**',
				'indentation done for {',
				'',
				'*/'
			].join('\n'));
		});
	});

	test.skip('issue #43244: indent after equal sign is detected', () => {

		// https://github.com/microsoft/vscode/issues/43244
		// issue: Should indent after an equal sign is detected followed by whitespace characters.
		// This should be outdented when a semi-colon is detected indicating the end of the assignment.

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array ='
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 14, 1, 14));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array =',
				'    '
			].join('\n'));
		});
	});

	test.skip('issue #43244: indent after dot detected after object/array signifying a method call', () => {

		// https://github.com/microsoft/vscode/issues/43244
		// issue: When a dot is written, we should detect that this is a method call and indent accordingly

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array = [1, 2, 3];',
			'array.'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 7, 2, 7));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3];',
				'array.',
				'    '
			].join('\n'));
		});
	});

	test.skip('issue #43244: indent after dot detected on a subsequent line after object/array signifying a method call', () => {

		// https://github.com/microsoft/vscode/issues/43244
		// issue: When a dot is written, we should detect that this is a method call and indent accordingly

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array = [1, 2, 3]',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 7, 2, 7));
			viewModel.type("\n", 'keyboard');
			viewModel.type(".");
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3]',
				'    .'
			].join('\n'));
		});
	});

	test.skip('issue #43244: keep indentation when methods called on object/array', () => {

		// https://github.com/microsoft/vscode/issues/43244
		// Currently passes, but should pass with all the tests above too

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array = [1, 2, 3]',
			'    .filter(() => true)'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 24, 2, 24));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3]',
				'    .filter(() => true)',
				'    '
			].join('\n'));
		});
	});

	test.skip('issue #43244: keep indentation when chained methods called on object/array', () => {

		// https://github.com/microsoft/vscode/issues/43244
		// When the call chain is not finished yet, and we type a dot, we do not want to change the indentation

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array = [1, 2, 3]',
			'    .filter(() => true)',
			'    '
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 5, 3, 5));
			viewModel.type(".");
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3]',
				'    .filter(() => true)',
				'    .' // here we don't want to increase the indentation because we have chained methods
			].join('\n'));
		});
	});

	test.skip('issue #43244: outdent when a semi-color is detected indicating the end of the assignment', () => {

		// https://github.com/microsoft/vscode/issues/43244

		// TODO: requires exploring indent/outdent pairs instead

		const model = createTextModel([
			'const array = [1, 2, 3]',
			'    .filter(() => true);'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 25, 2, 25));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'const array = [1, 2, 3]',
				'    .filter(() => true);',
				''
			].join('\n'));
		});
	});


	test.skip('issue #40115: keep indentation when added', () => {

		// https://github.com/microsoft/vscode/issues/40115

		const model = createTextModel('function foo() {}', languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));

			editor.setSelection(new Selection(1, 17, 1, 17));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function foo() {',
				'    ',
				'}',
			].join('\n'));
			editor.setSelection(new Selection(2, 5, 2, 5));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'function foo() {',
				'    ',
				'    ',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #193875: incorrect indentation on enter', () => {

		// https://github.com/microsoft/vscode/issues/193875

		const model = createTextModel([
			'{',
			'    for(;;)',
			'    for(;;) {}',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 14, 3, 14));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'{',
				'    for(;;)',
				'    for(;;) {',
				'        ',
				'    }',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #67678: indent on typing curly brace', () => {

		// https://github.com/microsoft/vscode/issues/67678

		const model = createTextModel([
			'if (true) {',
			'console.log("a")',
			'console.log("b")',
			'',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(4, 1, 4, 1));
			viewModel.type("}", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'if (true) {',
				'    console.log("a")',
				'    console.log("b")',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #46401: outdent when encountering bracket on line - allman style indentation', () => {

		// https://github.com/microsoft/vscode/issues/46401

		const model = createTextModel([
			'if (true)',
			'    ',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 5, 2, 5));
			viewModel.type("{}", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'if (true)',
				'{}',
			].join('\n'));

			editor.setSelection(new Selection(2, 2, 2, 2));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'if (true)',
				'{',
				'    ',
				'}'
			].join('\n'));
		});
	});

	test.skip('issue #125261: typing closing brace does not keep the current indentation', () => {

		// https://github.com/microsoft/vscode/issues/125261

		const model = createTextModel([
			'foo {',
			'    ',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "keep" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 5, 2, 5));
			viewModel.type("}", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'foo {',
				'}',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - Ruby', () => {

	const languageId = Language.Ruby;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #198350: in or when incorrectly match non keywords for Ruby', () => {

		// https://github.com/microsoft/vscode/issues/198350

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));

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

	// Failing tests...

	test.skip('issue #199846: in or when incorrectly match non keywords for Ruby', () => {

		// https://github.com/microsoft/vscode/issues/199846
		// explanation: happening because the # is detected probably as a comment

		const model = createTextModel("", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));

			viewModel.type("method('#foo') do");
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				"method('#foo') do",
				"    "
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - PHP', () => {

	const languageId = Language.PHP;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #199050: should not indent after { detected in a string', () => {

		// https://github.com/microsoft/vscode/issues/199050

		const model = createTextModel("$phrase = preg_replace('#(\{1|%s).*#su', '', $phrase);", languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 54, 1, 54));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				"$phrase = preg_replace('#(\{1|%s).*#su', '', $phrase);",
				""
			].join('\n'));
		});
	});
});

suite('Auto Indent On Paste - Go', () => {

	const languageId = Language.Go;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #199050: should not indent after { detected in a string', () => {

		// https://github.com/microsoft/vscode/issues/199050

		const model = createTextModel([
			'var s = `',
			'quick  brown',
			'fox',
			'`',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 1, 3, 1));
			const text = '  ';
			const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
			viewModel.paste(text, true, undefined, 'keyboard');
			autoIndentOnPasteController.trigger(new Range(3, 1, 3, 3));
			assert.strictEqual(model.getValue(), [
				'var s = `',
				'quick  brown',
				'  fox',
				'`',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - CPP', () => {

	const languageId = Language.CPP;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #178334: incorrect outdent of } when signature spans multiple lines', () => {

		// https://github.com/microsoft/vscode/issues/178334

		const model = createTextModel([
			'int WINAPI WinMain(bool instance,',
			'    int nshowcmd) {}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 20, 2, 20));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'int WINAPI WinMain(bool instance,',
				'    int nshowcmd) {',
				'    ',
				'}'
			].join('\n'));
		});
	});

	test.skip('issue #118929: incorrect indent when // follows curly brace', () => {

		// https://github.com/microsoft/vscode/issues/118929

		const model = createTextModel([
			'if (true) { // jaja',
			'}',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 20, 1, 20));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'if (true) { // jaja',
				'    ',
				'}',
			].join('\n'));
		});
	});

	test.skip('issue #111265: auto indentation set to "none" still changes the indentation', () => {

		// https://github.com/microsoft/vscode/issues/111265

		const model = createTextModel([
			'int func() {',
			'		',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "none" }, (editor, viewModel, instantiationService) => {

			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 3, 2, 3));
			viewModel.type("}", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'int func() {',
				'		}',
			].join('\n'));
		});
	});

});

suite('Auto Indent On Type - HTML', () => {

	const languageId = Language.HTML;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #61510: incorrect indentation after // in html file', () => {

		// https://github.com/microsoft/vscode/issues/178334

		const model = createTextModel([
			'<pre>',
			'  foo //I press <Enter> at the end of this line',
			'</pre>',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 48, 2, 48));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'<pre>',
				'  foo //I press <Enter> at the end of this line',
				'  ',
				'</pre>',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - Visual Basic', () => {

	const languageId = Language.VB;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #118932: no indentation in visual basic files', () => {

		// https://github.com/microsoft/vscode/issues/118932

		const model = createTextModel([
			'if True then',
			'    Some code',
			'    end i',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(3, 10, 3, 10));
			viewModel.type("f", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'if True then',
				'    Some code',
				'end if',
			].join('\n'));
		});
	});
});


suite('Auto Indent On Type - Latex', () => {

	const languageId = Language.Latex;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #178075: no auto closing pair when indentation done', () => {

		// https://github.com/microsoft/vscode/issues/178075

		const model = createTextModel([
			'\\begin{theorem}',
			'    \\end',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(2, 9, 2, 9));
			viewModel.type("{", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'\\begin{theorem}',
				'\\end{}',
			].join('\n'));
		});
	});
});

suite('Auto Indent On Type - Lua', () => {

	const languageId = Language.Lua;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('temp issue because there should be at least one passing test in a suite', () => {
		assert.ok(true);
	});

	test.skip('issue #178075: no auto closing pair when indentation done', () => {

		// https://github.com/microsoft/vscode/issues/178075

		const model = createTextModel([
			'print("asdf function asdf")',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			disposables.add(registerLanguage(instantiationService, languageId));
			editor.setSelection(new Selection(1, 28, 1, 28));
			viewModel.type("\n", 'keyboard');
			assert.strictEqual(model.getValue(), [
				'print("asdf function asdf")',
				''
			].join('\n'));
		});
	});
});

