/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StandardTokenType } from '../../../../common/encodedTokenAttributes.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { IndentationContextProcessor, ProcessedIndentRulesSupport } from '../../../../common/languages/supports/indentationLineProcessor.js';
import { Language, registerLanguage, registerLanguageConfiguration, registerTokenizationSupport, StandardTokenTypeData } from './indentation.test.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { Range } from '../../../../common/core/range.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { ILanguageService } from '../../../../common/languages/language.js';

suite('Indentation Context Processor - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;
	let serviceCollection: ServiceCollection;

	setup(() => {
		disposables = new DisposableStore();
		const languageService = new LanguageService();
		const languageConfigurationService = new TestLanguageConfigurationService();
		disposables.add(languageService);
		disposables.add(languageConfigurationService);
		disposables.add(registerLanguage(languageService, languageId));
		disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
		serviceCollection = new ServiceCollection(
			[ILanguageService, languageService],
			[ILanguageConfigurationService, languageConfigurationService]
		);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('brackets inside of string', () => {

		const model = createTextModel([
			'const someVar = "{some text}"',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 16, standardTokenType: StandardTokenType.String },
				{ startIndex: 28, standardTokenType: StandardTokenType.String }
			]];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
			const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(1, 23, 1, 23));
			assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someVar = "some');
			assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), ' text"');
			assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), '');
		});
	});

	test('brackets inside of comment', () => {

		const model = createTextModel([
			'const someVar2 = /*(a])*/',
			'const someVar = /* [()] some other t{e}xt() */ "some text"',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 17, standardTokenType: StandardTokenType.Comment },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 16, standardTokenType: StandardTokenType.Comment },
					{ startIndex: 46, standardTokenType: StandardTokenType.Other },
					{ startIndex: 47, standardTokenType: StandardTokenType.String }
				]];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
			const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(2, 29, 2, 35));
			assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someVar = /*  some');
			assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), ' text */ "some text"');
			assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), 'const someVar2 = /*a*/');
		});
	});

	test('brackets inside of regex', () => {

		const model = createTextModel([
			'const someRegex2 = /(()))]/;',
			'const someRegex = /()a{h}{s}[(a}87(9a9()))]/;',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 19, standardTokenType: StandardTokenType.RegEx },
					{ startIndex: 27, standardTokenType: StandardTokenType.Other },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 18, standardTokenType: StandardTokenType.RegEx },
					{ startIndex: 44, standardTokenType: StandardTokenType.Other },
				]
			];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
			const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(1, 25, 2, 33));
			assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someRegex2 = /');
			assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), '879a9/;');
			assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), '');
		});
	});
});

suite('Processed Indent Rules Support - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;
	let serviceCollection: ServiceCollection;

	setup(() => {
		disposables = new DisposableStore();
		const languageService = new LanguageService();
		const languageConfigurationService = new TestLanguageConfigurationService();
		disposables.add(languageService);
		disposables.add(languageConfigurationService);
		disposables.add(registerLanguage(languageService, languageId));
		disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
		serviceCollection = new ServiceCollection(
			[ILanguageService, languageService],
			[ILanguageConfigurationService, languageConfigurationService]
		);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should increase', () => {

		const model = createTextModel([
			'const someVar = {',
			'const someVar2 = "{"',
			'const someVar3 = /*{*/'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other }
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 17, standardTokenType: StandardTokenType.String },
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 17, standardTokenType: StandardTokenType.Comment },
				]
			];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
			if (!indentationRulesSupport) {
				assert.fail('indentationRulesSupport should be defined');
			}
			const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
			assert.strictEqual(processedIndentRulesSupport.shouldIncrease(1), true);
			assert.strictEqual(processedIndentRulesSupport.shouldIncrease(2), false);
			assert.strictEqual(processedIndentRulesSupport.shouldIncrease(3), false);
		});
	});

	test('should decrease', () => {

		const model = createTextModel([
			'}',
			'"])some text}"',
			'])*/'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[{ startIndex: 0, standardTokenType: StandardTokenType.Other }],
				[{ startIndex: 0, standardTokenType: StandardTokenType.String }],
				[{ startIndex: 0, standardTokenType: StandardTokenType.Comment }]
			];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
			if (!indentationRulesSupport) {
				assert.fail('indentationRulesSupport should be defined');
			}
			const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
			assert.strictEqual(processedIndentRulesSupport.shouldDecrease(1), true);
			assert.strictEqual(processedIndentRulesSupport.shouldDecrease(2), false);
			assert.strictEqual(processedIndentRulesSupport.shouldDecrease(3), false);
		});
	});

	test('should increase next line', () => {

		const model = createTextModel([
			'if()',
			'const someString = "if()"',
			'const someRegex = /if()/'
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other }
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 19, standardTokenType: StandardTokenType.String }
				],
				[
					{ startIndex: 0, standardTokenType: StandardTokenType.Other },
					{ startIndex: 18, standardTokenType: StandardTokenType.RegEx }
				]
			];
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
			if (!indentationRulesSupport) {
				assert.fail('indentationRulesSupport should be defined');
			}
			const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
			assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(1), true);
			assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(2), false);
			assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(3), false);
		});
	});
});
