/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import assert from 'assert';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { getReindentEditOperations } from 'vs/editor/contrib/indentation/common/indentation';
import { IRelaxedTextModelCreationOptions, createModelServices, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILanguageConfiguration, LanguageConfigurationFileHandler } from 'vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint';
import { parse } from 'vs/base/common/json';
import { IRange } from 'vs/editor/common/core/range';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { execSync } from 'child_process';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { EncodedTokenizationResult, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { MetadataConsts, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ITextModel } from 'vs/editor/common/model';

function getIRange(range: IRange): IRange {
	return {
		startLineNumber: range.startLineNumber,
		startColumn: range.startColumn,
		endLineNumber: range.endLineNumber,
		endColumn: range.endColumn
	};
}

const enum LanguageId {
	TypeScript = 'ts-test'
}

function forceTokenizationFromLineToLine(model: ITextModel, startLine: number, endLine: number): void {
	for (let line = startLine; line <= endLine; line++) {
		model.tokenization.forceTokenization(line);
	}
}

function registerLanguage(instantiationService: TestInstantiationService, languageId: LanguageId): IDisposable {
	const disposables = new DisposableStore();
	const languageService = instantiationService.get(ILanguageService);
	disposables.add(registerLanguageConfiguration(instantiationService, languageId));
	disposables.add(languageService.registerLanguage({ id: languageId }));
	return disposables;
}

function registerLanguageConfiguration(instantiationService: TestInstantiationService, languageId: LanguageId): IDisposable {
	const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
	let configPath: string;
	switch (languageId) {
		case LanguageId.TypeScript:
			configPath = path.join('extensions', 'typescript-basics', 'language-configuration.json');
			break;
		default:
			throw new Error('Unknown languageId');
	}
	const configContent = fs.readFileSync(configPath, { encoding: 'utf-8' });
	const parsedConfig = <ILanguageConfiguration>parse(configContent, []);
	const languageConfig = LanguageConfigurationFileHandler.extractValidConfig(languageId, parsedConfig);
	return languageConfigurationService.register(languageId, languageConfig);
}

interface StandardTokenTypeData {
	startIndex: number;
	standardTokenType: StandardTokenType;
}

function registerTokenizationSupport(instantiationService: TestInstantiationService, tokens: StandardTokenTypeData[][], languageId: LanguageId): IDisposable {
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
					((encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
						| (tokensOnLine[i].standardTokenType << MetadataConsts.TOKEN_TYPE_OFFSET));
			}
			return new EncodedTokenizationResult(result, state);
		}
	};
	return TokenizationRegistry.register(languageId, tokenizationSupport);
}

suite('Auto-Reindentation - TypeScript/JavaScript', () => {

	const languageId = LanguageId.TypeScript;
	const options: IRelaxedTextModelCreationOptions = {};
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
		languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		disposables.add(instantiationService);
		disposables.add(registerLanguage(instantiationService, languageId));
		disposables.add(registerLanguageConfiguration(instantiationService, languageId));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// Test which can be ran to find cases of incorrect indentation...
	test.skip('Find Cases of Incorrect Indentation with the Reindent Lines Command', () => {

		// ./scripts/test.sh --inspect --grep='Find Cases of Incorrect Indentation with the Reindent Lines Command' --timeout=15000

		function walkDirectoryAndReindent(directory: string, languageId: string) {
			const files = fs.readdirSync(directory, { withFileTypes: true });
			const directoriesToRecurseOn: string[] = [];
			for (const file of files) {
				if (file.isDirectory()) {
					directoriesToRecurseOn.push(path.join(directory, file.name));
				} else {
					const filePathName = path.join(directory, file.name);
					const fileExtension = path.extname(filePathName);
					if (fileExtension !== '.ts') {
						continue;
					}
					const fileContents = fs.readFileSync(filePathName, { encoding: 'utf-8' });
					const modelOptions: IRelaxedTextModelCreationOptions = {
						tabSize: 4,
						insertSpaces: false
					};
					const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, modelOptions));
					const lineCount = model.getLineCount();
					const editOperations: ISingleEditOperation[] = [];
					for (let line = 1; line <= lineCount - 1; line++) {
						/*
						NOTE: Uncomment in order to ignore incorrect JS DOC indentation
						const lineContent = model.getLineContent(line);
						const trimmedLineContent = lineContent.trim();
						if (trimmedLineContent.length === 0 || trimmedLineContent.startsWith('*') || trimmedLineContent.startsWith('/*')) {
							continue;
						}
						*/
						const lineContent = model.getLineContent(line);
						const trimmedLineContent = lineContent.trim();
						if (trimmedLineContent.length === 0) {
							continue;
						}
						const editOperation = getReindentEditOperations(model, languageConfigurationService, line, line + 1);
						/*
						NOTE: Uncomment in order to see actual incorrect indentation diff
						model.applyEdits(editOperation);
						*/
						editOperations.push(...editOperation);
					}
					model.applyEdits(editOperations);
					model.applyEdits(trimTrailingWhitespace(model, [], true));
					fs.writeFileSync(filePathName, model.getValue());
				}
			}
			for (const directory of directoriesToRecurseOn) {
				walkDirectoryAndReindent(directory, languageId);
			}
		}

		walkDirectoryAndReindent('/Users/aiday/Desktop/Test/vscode-test', 'ts-test');
		const output = execSync('cd /Users/aiday/Desktop/Test/vscode-test && git diff --shortstat', { encoding: 'utf-8' });
		console.log('\ngit diff --shortstat:\n', output);
	});

	// Unit tests for increase and decrease indent patterns...

	/**
	 * First increase indent and decrease indent patterns:
	 *
	 * - decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/
	 *  - In (https://macromates.com/manual/en/appendix)
	 * 	  Either we have white space before the closing bracket, or we have a multi line comment ending on that line followed by whitespaces
	 *    This is followed by any character.
	 *    Textmate decrease indent pattern is as follows: /^(.*\*\/)?\s*\}[;\s]*$/
	 *    Presumably allowing multi line comments ending on that line implies that } is itself not part of a multi line comment
	 *
	 * - increaseIndentPattern: /^.*\{[^}"']*$/
	 *  - In (https://macromates.com/manual/en/appendix)
	 *    This regex means that we increase the indent when we have any characters followed by the opening brace, followed by characters
	 *    except for closing brace }, double quotes " or single quote '.
	 *    The } is checked in order to avoid the indentation in the following case `int arr[] = { 1, 2, 3 };`
	 *    The double quote and single quote are checked in order to avoid the indentation in the following case: str = "foo {";
	 */

	test('Issue #25437', () => {
		// issue: https://github.com/microsoft/vscode/issues/25437
		// fix: https://github.com/microsoft/vscode/commit/8c82a6c6158574e098561c28d470711f1b484fc8
		// explanation: var foo = `{`; should not increase indentation

		// increaseIndentPattern: /^.*\{[^}"']*$/ -> /^.*\{[^}"'`]*$/

		const fileContents = [
			'const foo = `{`;',
			'    ',
		].join('\n');
		const tokens: StandardTokenTypeData[][] = [
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 5, standardTokenType: StandardTokenType.Other },
				{ startIndex: 6, standardTokenType: StandardTokenType.Other },
				{ startIndex: 9, standardTokenType: StandardTokenType.Other },
				{ startIndex: 10, standardTokenType: StandardTokenType.Other },
				{ startIndex: 11, standardTokenType: StandardTokenType.Other },
				{ startIndex: 12, standardTokenType: StandardTokenType.String },
				{ startIndex: 13, standardTokenType: StandardTokenType.String },
				{ startIndex: 14, standardTokenType: StandardTokenType.String },
				{ startIndex: 15, standardTokenType: StandardTokenType.Other },
				{ startIndex: 16, standardTokenType: StandardTokenType.Other }
			],
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 4, standardTokenType: StandardTokenType.Other }]
		];
		disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		forceTokenizationFromLineToLine(model, 1, 2);
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 1);
		const operation = editOperations[0];
		assert.deepStrictEqual(getIRange(operation.range), {
			"startLineNumber": 2,
			"startColumn": 1,
			"endLineNumber": 2,
			"endColumn": 5,
		});
		assert.deepStrictEqual(operation.text, '');
	});

	test('Enriching the hover', () => {
		// issue: -
		// fix: https://github.com/microsoft/vscode/commit/19ae0932c45b1096443a8c1335cf1e02eb99e16d
		// explanation:
		//  - decrease indent on ) and ] also
		//  - increase indent on ( and [ also

		// decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/ -> /^(.*\*\/)?\s*[\}\]\)].*$/
		// increaseIndentPattern: /^.*\{[^}"'`]*$/ -> /^.*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/

		let fileContents = [
			'function foo(',
			'    bar: string',
			'    ){}',
		].join('\n');
		let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 1);
		let operation = editOperations[0];
		assert.deepStrictEqual(getIRange(operation.range), {
			"startLineNumber": 3,
			"startColumn": 1,
			"endLineNumber": 3,
			"endColumn": 5,
		});
		assert.deepStrictEqual(operation.text, '');

		fileContents = [
			'function foo(',
			'bar: string',
			'){}',
		].join('\n');
		model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 1);
		operation = editOperations[0];
		assert.deepStrictEqual(getIRange(operation.range), {
			"startLineNumber": 2,
			"startColumn": 1,
			"endLineNumber": 2,
			"endColumn": 1,
		});
		assert.deepStrictEqual(operation.text, '    ');
	});

	test('Issue #86176', () => {
		// issue: https://github.com/microsoft/vscode/issues/86176
		// fix: https://github.com/microsoft/vscode/commit/d89e2e17a5d1ba37c99b1d3929eb6180a5bfc7a8
		// explanation: When quotation marks are present on the first line of an if statement or for loop, following line should not be indented

		// increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/ -> /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/
		// explanation: after open brace, do not decrease indent if it is followed on the same line by "<whitespace characters> // <any characters>"
		// todo@aiday-mar: should also apply for when it follows ( and [

		const fileContents = [
			`if () { // '`,
			`x = 4`,
			`}`
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 1);
		const operation = editOperations[0];
		assert.deepStrictEqual(getIRange(operation.range), {
			"startLineNumber": 2,
			"startColumn": 1,
			"endLineNumber": 2,
			"endColumn": 1,
		});
		assert.deepStrictEqual(operation.text, '    ');
	});

	test('Issue #141816', () => {

		// issue: https://github.com/microsoft/vscode/issues/141816
		// fix: https://github.com/microsoft/vscode/pull/141997/files
		// explanation: if (, [, {, is followed by a forward slash then assume we are in a regex pattern, and do not indent

		// increaseIndentPattern: /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/ -> /^((?!\/\/).)*(\{([^}"'`/]*|(\t|[ ])*\/\/.*)|\([^)"'`/]*|\[[^\]"'`/]*)$/
		// -> Final current increase indent pattern at of writing

		const fileContents = [
			'const r = /{/;',
			'   ',
		].join('\n');
		const tokens: StandardTokenTypeData[][] = [
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 5, standardTokenType: StandardTokenType.Other },
				{ startIndex: 6, standardTokenType: StandardTokenType.Other },
				{ startIndex: 7, standardTokenType: StandardTokenType.Other },
				{ startIndex: 8, standardTokenType: StandardTokenType.Other },
				{ startIndex: 9, standardTokenType: StandardTokenType.RegEx },
				{ startIndex: 10, standardTokenType: StandardTokenType.RegEx },
				{ startIndex: 11, standardTokenType: StandardTokenType.RegEx },
				{ startIndex: 12, standardTokenType: StandardTokenType.RegEx },
				{ startIndex: 13, standardTokenType: StandardTokenType.Other },
				{ startIndex: 14, standardTokenType: StandardTokenType.Other }
			],
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 4, standardTokenType: StandardTokenType.Other }
			]
		];
		disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		forceTokenizationFromLineToLine(model, 1, 2);
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 1);
		const operation = editOperations[0];
		assert.deepStrictEqual(getIRange(operation.range), {
			"startLineNumber": 2,
			"startColumn": 1,
			"endLineNumber": 2,
			"endColumn": 4,
		});
		assert.deepStrictEqual(operation.text, '');
	});

	test('Issue #29886', () => {
		// issue: https://github.com/microsoft/vscode/issues/29886
		// fix: https://github.com/microsoft/vscode/commit/7910b3d7bab8a721aae98dc05af0b5e1ea9d9782

		// decreaseIndentPattern: /^(.*\*\/)?\s*[\}\]\)].*$/ -> /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/
		// -> Final current decrease indent pattern at the time of writing

		// explanation: Positive lookahead: (?= «pattern») matches if pattern matches what comes after the current location in the input string.
		// Negative lookahead: (?! «pattern») matches if pattern does not match what comes after the current location in the input string
		// The change proposed is to not decrease the indent if there is a multi-line comment ending on the same line before the closing parentheses

		const fileContents = [
			'function foo() {',
			'    bar(/*  */)',
			'};',
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	test('Issue #209859: do not do reindentation for tokens inside of a string', () => {

		// issue: https://github.com/microsoft/vscode/issues/209859

		const tokens: StandardTokenTypeData[][] = [
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 12, standardTokenType: StandardTokenType.String },
			],
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.String },
			],
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.String },
			],
			[
				{ startIndex: 0, standardTokenType: StandardTokenType.String },
			]
		];
		disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
		const fileContents = [
			'const foo = `some text',
			'         which is strangely',
			'    indented. It should',
			'   not be reindented.`'
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		forceTokenizationFromLineToLine(model, 1, 4);
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	// Failing tests inferred from the current regexes...

	test.skip('Incorrect deindentation after `*/}` string', () => {

		// explanation: If */ was not before the }, the regex does not allow characters before the }, so there would not be an indent
		// Here since there is */ before the }, the regex allows all the characters before, hence there is a deindent

		const fileContents = [
			`const obj = {`,
			`    obj1: {`,
			`        brace : '*/}'`,
			`    }`,
			`}`,
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	// Failing tests from issues...

	test.skip('Issue #56275', () => {

		// issue: https://github.com/microsoft/vscode/issues/56275
		// explanation: If */ was not before the }, the regex does not allow characters before the }, so there would not be an indent
		// Here since there is */ before the }, the regex allows all the characters before, hence there is a deindent

		let fileContents = [
			'function foo() {',
			'    var bar = (/b*/);',
			'}',
		].join('\n');
		let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);

		fileContents = [
			'function foo() {',
			'    var bar = "/b*/)";',
			'}',
		].join('\n');
		model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	test.skip('Issue #116843', () => {

		// issue: https://github.com/microsoft/vscode/issues/116843
		// related: https://github.com/microsoft/vscode/issues/43244
		// explanation: When you have an arrow function, you don't have { or }, but you would expect indentation to still be done in that way

		// TODO: requires exploring indent/outdent pairs instead

		const fileContents = [
			'const add1 = (n) =>',
			'	n + 1;',
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	test.skip('Issue #185252', () => {

		// issue: https://github.com/microsoft/vscode/issues/185252
		// explanation: Reindenting the comment correctly

		const fileContents = [
			'/*',
			' * This is a comment.',
			' */',
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});

	test.skip('Issue 43244: incorrect indentation when signature of function call spans several lines', () => {

		// issue: https://github.com/microsoft/vscode/issues/43244

		const fileContents = [
			'function callSomeOtherFunction(one: number, two: number) { }',
			'function someFunction() {',
			'    callSomeOtherFunction(4,',
			'        5)',
			'}',
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepStrictEqual(editOperations.length, 0);
	});
});
