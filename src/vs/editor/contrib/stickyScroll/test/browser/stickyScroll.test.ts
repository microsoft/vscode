/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { withAsyncTestCodeEditor, withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScroll';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { DocumentSymbol, SymbolKind } from 'vs/editor/common/languages';
import { CoreEditingCommands, CoreNavigationCommands } from 'vs/editor/browser/coreCommands';
import { StickyLineCandidate, StickyLineCandidateProvider } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollProvider';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

// To run this test file : ./test.bat --glob **/stickyScroll.test.js in the scripts folder

suite('Sticky Scroll Tests', () => {

	const serviceCollection = new ServiceCollection(
		[ILanguageFeaturesService, new LanguageFeaturesService()]
	);

	const model = createTextModel([
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
	].join('\n'));

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

	test('Testing the function getCandidateStickyLinesIntersecting', async () => {
		await withAsyncTestCodeEditor(model, { serviceCollection }, async (editor, _viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageFeaturesService);
			languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());
			const provider: StickyLineCandidateProvider = new StickyLineCandidateProvider(editor, languageService);

			/*
			provider.onStickyScrollChange(() => {
				console.log('resolve');
			});
			*/

			// TODO: The below times out doesn't return after 5000 ms
			/*
			await new Promise<void>(resolve => {
				const disposable = provider.onStickyScrollChange(() => {
					console.log('resolve');
					resolve();
				});
				disposable.dispose();
			});
			*/

			// console.log('before update of provider');
			await provider.update();

			assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 4 }), [new StickyLineCandidate(1, 2, 1)]);
			assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 10 }), [new StickyLineCandidate(1, 2, 1), new StickyLineCandidate(7, 11, 1), new StickyLineCandidate(9, 11, 2), new StickyLineCandidate(10, 10, 3)]);
			assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 13 }), [new StickyLineCandidate(1, 2, 1), new StickyLineCandidate(7, 11, 1), new StickyLineCandidate(9, 11, 2), new StickyLineCandidate(10, 10, 3), new StickyLineCandidate(13, 13, 1)]);

			provider.dispose();
		});
	});

	test('issue #157180: Render the correct line corresponding to the scope definition', async () => {

		await withAsyncTestCodeEditor(model, { serviceCollection }, async (editor, _viewModel, instantiationService) => {

			const stickyScrollController: StickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
			await stickyScrollController.stickyScrollCandidateProvider.update();

			const lineHeight: number = editor.getOption(EditorOption.lineHeight);
			const languageService: ILanguageFeaturesService = instantiationService.get(ILanguageFeaturesService);
			languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());
			let state;

			editor.setScrollTop(lineHeight + 1);
			state = stickyScrollController.getScrollWidgetState();
			assert.deepStrictEqual(state.lineNumbers, [1]);

			editor.setScrollTop(4 * lineHeight + 1);
			state = stickyScrollController.getScrollWidgetState();
			assert.deepStrictEqual(state.lineNumbers, []);

			editor.setScrollTop(8 * lineHeight + 1);
			state = stickyScrollController.getScrollWidgetState();
			assert.deepStrictEqual(state.lineNumbers, [7, 9]);

			editor.setScrollTop(9 * lineHeight + 1);
			state = stickyScrollController.getScrollWidgetState();
			assert.deepStrictEqual(state.lineNumbers, [7, 9]);

			editor.setScrollTop(10 * lineHeight + 1);
			state = stickyScrollController.getScrollWidgetState();
			assert.deepStrictEqual(state.lineNumbers, [7]);

			stickyScrollController.dispose();
		});
	});

	test('issue #157809: Reveal the correct range taking into account the widget height', async () => {

		await withAsyncTestCodeEditor(model, { serviceCollection }, async (editor, viewModel, instantiationService) => {

			const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
			await stickyScrollController.stickyScrollCandidateProvider.update();
			const lineHeight = editor.getOption(EditorOption.lineHeight);

			const languageService = instantiationService.get(ILanguageFeaturesService);
			languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());

			// editor.setPosition({ lineNumber: 5, column: 1 }, 'test');
			editor.setScrollTop(11 * lineHeight);

			/*
			CoreNavigationCommands.CreateCursor.runCoreEditorCommand(viewModel, {
				source: 'mouse',
				position: new Position(2, 1),
				viewPosition: new Position(2, 1),
				wholeLine: true
			});
			*/
			// CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 1) });


			console.log('visible ranges : ', editor.getVisibleRanges()[0].startLineNumber);
			console.log('scroll top : ', Math.floor(editor.getScrollTop() / lineHeight));
			console.log('position : ', editor.getPosition().lineNumber);

			/*
			editor.trigger('keyboard', Handler.Type, { text: 'd' });
			CoreNavigationCommands.RevealLine.runCoreEditorCommand(viewModel, { lineNumber: 5, source: undefined });
			*/
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);

			console.log('visible ranges : ', editor.getVisibleRanges()[0].startLineNumber);
			console.log('scroll top : ', Math.floor(editor.getScrollTop() / lineHeight));
			console.log('position : ', editor.getPosition().lineNumber);

			stickyScrollController.dispose();

		});
	});

	test('issue #156268 : Do not reveal sticky lines when they are in a folded region ', async () => {

		await withAsyncTestCodeEditor(model, { serviceCollection }, async (editor, viewModel, instantiationService) => {

			const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
			await stickyScrollController.stickyScrollCandidateProvider.update();
			const lineHeight = editor.getOption(EditorOption.lineHeight);

			const languageService = instantiationService.get(ILanguageFeaturesService);
			languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel());

			stickyScrollController.dispose();

		});
	});
});

