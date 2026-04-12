/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { StickyScrollController } from '../../browser/stickyScrollController.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { StickyLineCandidate, StickyLineCandidateProvider } from '../../browser/stickyScrollProvider.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
suite('Sticky Scroll Tests', () => {
    const disposables = new DisposableStore();
    const serviceCollection = new ServiceCollection([ILanguageFeaturesService, new LanguageFeaturesService()], [ILogService, new NullLogService()], [IContextMenuService, new class extends mock() {
        }], [ILanguageConfigurationService, new TestLanguageConfigurationService()], [IEnvironmentService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.isBuilt = true;
                this.isExtensionDevelopment = false;
            }
        }], [ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService)]);
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
    setup(() => {
        disposables.clear();
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function documentSymbolProviderForTestModel() {
        return {
            provideDocumentSymbols() {
                return [
                    {
                        name: 'foo',
                        detail: 'foo',
                        kind: 11 /* SymbolKind.Function */,
                        tags: [],
                        range: { startLineNumber: 1, endLineNumber: 3, startColumn: 1, endColumn: 1 },
                        selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 }
                    },
                    {
                        name: 'TestClass',
                        detail: 'TestClass',
                        kind: 4 /* SymbolKind.Class */,
                        tags: [],
                        range: { startLineNumber: 4, endLineNumber: 12, startColumn: 1, endColumn: 1 },
                        selectionRange: { startLineNumber: 7, endLineNumber: 7, startColumn: 1, endColumn: 1 },
                        children: [
                            {
                                name: 'functionOfClass',
                                detail: 'functionOfClass',
                                kind: 11 /* SymbolKind.Function */,
                                tags: [],
                                range: { startLineNumber: 8, endLineNumber: 12, startColumn: 1, endColumn: 1 },
                                selectionRange: { startLineNumber: 9, endLineNumber: 9, startColumn: 1, endColumn: 1 },
                                children: [
                                    {
                                        name: 'function1',
                                        detail: 'function1',
                                        kind: 11 /* SymbolKind.Function */,
                                        tags: [],
                                        range: { startLineNumber: 10, endLineNumber: 11, startColumn: 1, endColumn: 1 },
                                        selectionRange: { startLineNumber: 10, endLineNumber: 10, startColumn: 1, endColumn: 1 },
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        name: 'bar',
                        detail: 'bar',
                        kind: 11 /* SymbolKind.Function */,
                        tags: [],
                        range: { startLineNumber: 13, endLineNumber: 14, startColumn: 1, endColumn: 1 },
                        selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
                        children: [
                            {
                                name: 'insideBar',
                                detail: 'insideBar',
                                kind: 11 /* SymbolKind.Function */,
                                tags: [],
                                range: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
                                selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
                            }
                        ]
                    }
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
                },
                envConfig: {
                    outerHeight: 500
                },
                serviceCollection: serviceCollection
            }, async (editor, _viewModel, instantiationService) => {
                const languageService = instantiationService.get(ILanguageFeaturesService);
                const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
                disposables.add(languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel()));
                const provider = new StickyLineCandidateProvider(editor, languageService, languageConfigurationService);
                await provider.update();
                assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 4 }), [new StickyLineCandidate(1, 2, 0, 19)]);
                assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 8, endLineNumber: 10 }), [new StickyLineCandidate(7, 11, 0, 19), new StickyLineCandidate(9, 11, 19, 19)]);
                assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 10, endLineNumber: 13 }), [new StickyLineCandidate(7, 11, 0, 19), new StickyLineCandidate(9, 11, 19, 19)]);
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
                },
                envConfig: {
                    outerHeight: 500
                },
                serviceCollection
            }, async (editor, _viewModel, instantiationService) => {
                const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
                const lineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
                const languageService = instantiationService.get(ILanguageFeaturesService);
                disposables.add(languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel()));
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
                },
                envConfig: {
                    outerHeight: 500
                },
                serviceCollection
            }, async (editor, viewModel, instantiationService) => {
                const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
                const lineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
                const languageService = instantiationService.get(ILanguageFeaturesService);
                disposables.add(languageService.documentSymbolProvider.register('*', documentSymbolProviderForTestModel()));
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
                        kind: 4 /* SymbolKind.Class */,
                        tags: [],
                        range: { startLineNumber: 1, endLineNumber: 5, startColumn: 1, endColumn: 1 },
                        selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
                        children: [
                            {
                                name: 'foo',
                                detail: 'foo',
                                kind: 11 /* SymbolKind.Function */,
                                tags: [],
                                range: { startLineNumber: 1, endLineNumber: 4, startColumn: 1, endColumn: 1 },
                                selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
                                children: [
                                    {
                                        name: 'bar',
                                        detail: 'bar',
                                        kind: 11 /* SymbolKind.Function */,
                                        tags: [],
                                        range: { startLineNumber: 2, endLineNumber: 4, startColumn: 1, endColumn: 1 },
                                        selectionRange: { startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 1 },
                                        children: []
                                    }
                                ]
                            },
                        ]
                    }
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
                },
                envConfig: {
                    outerHeight: 500
                },
                serviceCollection
            }, async (editor, _viewModel, instantiationService) => {
                const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
                await stickyScrollController.stickyScrollCandidateProvider.update();
                const lineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
                const languageService = instantiationService.get(ILanguageFeaturesService);
                disposables.add(languageService.documentSymbolProvider.register('*', documentSymbolProviderForSecondTestModel()));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RpY2t5U2Nyb2xsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdGlja3lTY3JvbGwvdGVzdC9icm93c2VyL3N0aWNreVNjcm9sbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFakcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFekcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDOUcsT0FBTyxFQUFFLCtCQUErQixFQUFFLDhCQUE4QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekksT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDckgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZEQUE2RCxDQUFD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