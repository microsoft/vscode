/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { withAsyncTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollController';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { DocumentSymbol, SymbolKind } from 'vs/editor/common/languages';
import { StickyLineCandidate, StickyLineCandidateProvider } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollProvider';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { mock } from 'vs/base/test/common/mock';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

suite('Sticky Scroll Tests', () => {

	const serviceCollection = new ServiceCollection(
		[ILanguageFeaturesService, new LanguageFeaturesService()],
		[ILogService, new NullLogService()],
		[IContextMenuService, new class extends mock<IContextMenuService>() { }],
		[ILanguageConfigurationService, new TestLanguageConfigurationService()],
		[IEnvironmentService, new class extends mock<IEnvironmentService>() {
			override isBuilt: boolean = true;
			override isExtensionDevelopment: boolean = false;
		}],
		[ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService)],
	);

	const text = [
		'function foo() {',
		'',
		'}',
		'/* comment related to TestClass',
		' end of the comment */',
		'@classDecorator',
		'class TestClass {',
		'// comment related to the function functionOfClass',
		'functionOfClass(){',
		'function function1(){',
		'}',
		'}}',
		'function bar() { function insideBar() {}',
		'}'
	].join('\n');

	function documentSymbolProviderForTestModel() {
		return {
			provideDocumentSymbols() {
				return [
					{
						name: 'foo',
						detail: 'foo',
						kind: SymbolKind.Function,
						tags: [],
						range: { startLineNumber: 1, endLineNumber: 3, startColumn: 1, endColumn: 1 },
						selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 }
					} as DocumentSymbol,
					{
						name: 'TestClass',
						detail: 'TestClass',
						kind: SymbolKind.Class,
						tags: [],
						range: { startLineNumber: 4, endLineNumber: 12, startColumn: 1, endColumn: 1 },
						selectionRange: { startLineNumber: 7, endLineNumber: 7, startColumn: 1, endColumn: 1 },
						children: [
							{
								name: 'functionOfClass',
								detail: 'functionOfClass',
								kind: SymbolKind.Function,
								tags: [],
								range: { startLineNumber: 8, endLineNumber: 12, startColumn: 1, endColumn: 1 },
								selectionRange: { startLineNumber: 9, endLineNumber: 9, startColumn: 1, endColumn: 1 },
								children: [
									{
										name: 'function1',
										detail: 'function1',
										kind: SymbolKind.Function,
										tags: [],
										range: { startLineNumber: 10, endLineNumber: 11, startColumn: 1, endColumn: 1 },
										selectionRange: { startLineNumber: 10, endLineNumber: 10, startColumn: 1, endColumn: 1 },
									}
								]
							} as DocumentSymbol
						]
					} as DocumentSymbol,
					{
						name: 'bar',
						detail: 'bar',
						kind: SymbolKind.Function,
						tags: [],
						range: { startLineNumber: 13, endLineNumber: 14, startColumn: 1, endColumn: 1 },
						selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
						children: [
							{
								name: 'insideBar',
								detail: 'insideBar',
								kind: SymbolKind.Function,
								tags: [],
								range: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
								selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
							} as DocumentSymbol
						]
					} as DocumentSymbol
				];
			}
		};
	}

	test('Testing the function getCandidateStickyLinesIntersecting', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const model = createTextModel(text);
			await withAsyncTestCodeEditor(model, {
				stickyScroll: {
					enabled: true,
					maxLineCount: 5,
					defaultModel: 'outlineModel'
				}, serviceCollection: serviceCollection
			}, async (editor, _viewModel, instantiationService) => {
				const languageService = instantiationService.get(ILanguageFeaturesService);
				const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
				languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());
				const provider: StickyLineCandidateProvider = new StickyLineCandidateProvider(editor, languageService, languageConfigurationService);
				await provider.update();
				assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 4 }), [new StickyLineCandidate(1, 2, 1)]);
				assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 8, endLineNumber: 10 }), [new StickyLineCandidate(7, 11, 1), new StickyLineCandidate(9, 11, 2), new StickyLineCandidate(10, 10, 3)]);
				assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 10, endLineNumber: 13 }), [new StickyLineCandidate(7, 11, 1), new StickyLineCandidate(9, 11, 2), new StickyLineCandidate(10, 10, 3)]);

				provider.dispose();
				model.dispose();
			});
		});
	});

	test('issue #157180: Render the correct line corresponding to the scope definition', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const model = createTextModel(text);
			await withAsyncTestCodeEditor(model, {
				stickyScroll: {
					enabled: true,
					maxLineCount: 5,
					defaultModel: 'outlineModel'
				}, serviceCollection
			}, async (editor, _viewModel, instantiationService) => {

				const stickyScrollController: StickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
				const lineHeight: number = editor.getOption(EditorOption.lineHeight);
				const languageService: ILanguageFeaturesService = instantiationService.get(ILanguageFeaturesService);
				languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());
				await stickyScrollController.stickyScrollCandidateProvider.update();
				let state;

				editor.setScrollTop(1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1]);

				editor.setScrollTop(lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1]);

				editor.setScrollTop(4 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, []);

				editor.setScrollTop(8 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [7, 9]);

				editor.setScrollTop(9 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [7, 9]);

				editor.setScrollTop(10 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [7]);

				stickyScrollController.dispose();
				stickyScrollController.stickyScrollCandidateProvider.dispose();
				model.dispose();
			});
		});
	});

	test('issue #156268 : Do not reveal sticky lines when they are in a folded region ', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const model = createTextModel(text);
			await withAsyncTestCodeEditor(model, {
				stickyScroll: {
					enabled: true,
					maxLineCount: 5,
					defaultModel: 'outlineModel'
				}, serviceCollection
			}, async (editor, viewModel, instantiationService) => {

				const stickyScrollController: StickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
				const lineHeight = editor.getOption(EditorOption.lineHeight);

				const languageService = instantiationService.get(ILanguageFeaturesService);
				languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());
				await stickyScrollController.stickyScrollCandidateProvider.update();
				editor.setHiddenAreas([{ startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 1 }, { startLineNumber: 10, endLineNumber: 11, startColumn: 1, endColumn: 1 }]);
				let state;

				editor.setScrollTop(1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1]);

				editor.setScrollTop(lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, []);

				editor.setScrollTop(6 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [7, 9]);

				editor.setScrollTop(7 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [7]);

				editor.setScrollTop(10 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, []);

				stickyScrollController.dispose();
				stickyScrollController.stickyScrollCandidateProvider.dispose();
				model.dispose();
			});
		});
	});

	const textWithScopesWithSameStartingLines = [
		'class TestClass { foo() {',
		'function bar(){',
		'',
		'}}',
		'}',
		''
	].join('\n');

	function documentSymbolProviderForSecondTestModel() {
		return {
			provideDocumentSymbols() {
				return [
					{
						name: 'TestClass',
						detail: 'TestClass',
						kind: SymbolKind.Class,
						tags: [],
						range: { startLineNumber: 1, endLineNumber: 5, startColumn: 1, endColumn: 1 },
						selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
						children: [
							{
								name: 'foo',
								detail: 'foo',
								kind: SymbolKind.Function,
								tags: [],
								range: { startLineNumber: 1, endLineNumber: 4, startColumn: 1, endColumn: 1 },
								selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
								children: [
									{
										name: 'bar',
										detail: 'bar',
										kind: SymbolKind.Function,
										tags: [],
										range: { startLineNumber: 2, endLineNumber: 4, startColumn: 1, endColumn: 1 },
										selectionRange: { startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 1 },
										children: []
									} as DocumentSymbol
								]
							} as DocumentSymbol,
						]
					} as DocumentSymbol
				];
			}
		};
	}

	test('issue #159271 : render the correct widget state when the child scope starts on the same line as the parent scope', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const model = createTextModel(textWithScopesWithSameStartingLines);
			await withAsyncTestCodeEditor(model, {
				stickyScroll: {
					enabled: true,
					maxLineCount: 5,
					defaultModel: 'outlineModel'
				}, serviceCollection
			}, async (editor, _viewModel, instantiationService) => {

				const stickyScrollController: StickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
				await stickyScrollController.stickyScrollCandidateProvider.update();
				const lineHeight = editor.getOption(EditorOption.lineHeight);

				const languageService = instantiationService.get(ILanguageFeaturesService);
				languageService.documentSymbolProvider.register('*', documentSymbolProviderForSecondTestModel());
				await stickyScrollController.stickyScrollCandidateProvider.update();
				let state;

				editor.setScrollTop(1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1, 2]);

				editor.setScrollTop(lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1, 2]);

				editor.setScrollTop(2 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1]);

				editor.setScrollTop(3 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, [1]);

				editor.setScrollTop(4 * lineHeight + 1);
				state = stickyScrollController.findScrollWidgetState();
				assert.deepStrictEqual(state.startLineNumbers, []);

				stickyScrollController.dispose();
				stickyScrollController.stickyScrollCandidateProvider.dispose();
				model.dispose();
			});
		});
	});
});
