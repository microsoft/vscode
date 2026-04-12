/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { Range } from '../../../../common/core/range.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';
import { GhostTextContext } from './utils.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { SuggestController } from '../../../suggest/browser/suggestController.js';
import { ISuggestMemoryService } from '../../../suggest/browser/suggestMemory.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import assert from 'assert';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { InlineCompletionsController } from '../../browser/controller/inlineCompletionsController.js';
import { autorun } from '../../../../../base/common/observable.js';
import { setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { InlineSuggestionsView } from '../../browser/view/inlineSuggestionsView.js';
suite('Suggest Widget Model', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        setUnexpectedErrorHandler(function (err) {
            throw err;
        });
    });
    // This test is skipped because the fix for this causes https://github.com/microsoft/vscode/issues/166023
    test.skip('Active', async () => {
        await withAsyncTestCodeEditorAndInlineCompletionsModel('', { fakeClock: true, provider, }, async ({ editor, editorViewModel, context, model }) => {
            let last = undefined;
            const history = new Array();
            const d = autorun(reader => {
                /** @description debug */
                const selectedSuggestItem = !!model.debugGetSelectedSuggestItem().read(reader);
                if (last !== selectedSuggestItem) {
                    last = selectedSuggestItem;
                    history.push(last);
                }
            });
            context.keyboardType('h');
            const suggestController = editor.getContribution(SuggestController.ID);
            suggestController.triggerSuggest();
            await timeout(1000);
            assert.deepStrictEqual(history.splice(0), [false, true]);
            context.keyboardType('.');
            await timeout(1000);
            // No flicker here
            assert.deepStrictEqual(history.splice(0), []);
            suggestController.cancelSuggestWidget();
            await timeout(1000);
            assert.deepStrictEqual(history.splice(0), [false]);
            d.dispose();
        });
    });
    test('Ghost Text', async () => {
        await withAsyncTestCodeEditorAndInlineCompletionsModel('', { fakeClock: true, provider, suggest: { preview: true } }, async ({ editor, editorViewModel, context, model }) => {
            context.keyboardType('h');
            const suggestController = editor.getContribution(SuggestController.ID);
            suggestController.triggerSuggest();
            await timeout(1000);
            assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'h[ello]']);
            context.keyboardType('.');
            await timeout(1000);
            assert.deepStrictEqual(context.getAndClearViewStates(), ['h', 'hello.[hello]']);
            suggestController.cancelSuggestWidget();
            await timeout(1000);
            assert.deepStrictEqual(context.getAndClearViewStates(), ['hello.']);
        });
    });
});
const provider = {
    _debugDisplayName: 'test',
    triggerCharacters: ['.'],
    async provideCompletionItems(model, pos) {
        const word = model.getWordAtPosition(pos);
        const range = word
            ? { startLineNumber: 1, startColumn: word.startColumn, endLineNumber: 1, endColumn: word.endColumn }
            : Range.fromPositions(pos);
        return {
            suggestions: [{
                    insertText: 'hello',
                    kind: 18 /* CompletionItemKind.Text */,
                    label: 'hello',
                    range,
                    commitCharacters: ['.'],
                }]
        };
    },
};
async function withAsyncTestCodeEditorAndInlineCompletionsModel(text, options, callback) {
    await runWithFakedTimers({ useFakeTimers: options.fakeClock }, async () => {
        const disposableStore = new DisposableStore();
        try {
            const serviceCollection = new ServiceCollection([ITelemetryService, NullTelemetryService], [ILogService, new NullLogService()], [IStorageService, disposableStore.add(new InMemoryStorageService())], [IKeybindingService, new MockKeybindingService()], [IEditorWorkerService, new class extends mock() {
                    computeWordRanges() {
                        return Promise.resolve({});
                    }
                }], [ISuggestMemoryService, new class extends mock() {
                    memorize() { }
                    select() { return 0; }
                }], [IMenuService, new class extends mock() {
                    createMenu() {
                        return new class extends mock() {
                            constructor() {
                                super(...arguments);
                                this.onDidChange = Event.None;
                            }
                            dispose() { }
                        };
                    }
                }], [ILabelService, new class extends mock() {
                }], [IWorkspaceContextService, new class extends mock() {
                }], 
            // eslint-disable-next-line local/code-no-any-casts
            [IAccessibilitySignalService, {
                    playSignal: async () => { },
                    isSoundEnabled(signal) { return false; },
                }], [IDefaultAccountService, new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.onDidChangeDefaultAccount = Event.None;
                        this.getDefaultAccount = async () => null;
                        this.setDefaultAccountProvider = () => { };
                    }
                }]);
            if (options.provider) {
                const languageFeaturesService = new LanguageFeaturesService();
                serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
                disposableStore.add(languageFeaturesService.completionProvider.register({ pattern: '**' }, options.provider));
            }
            await withAsyncTestCodeEditor(text, { ...options, serviceCollection }, async (editor, editorViewModel, instantiationService) => {
                instantiationService.stubInstance(InlineSuggestionsView, {
                    dispose: () => { }
                });
                editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
                editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
                editor.registerAndInstantiateContribution(InlineCompletionsController.ID, InlineCompletionsController);
                const model = InlineCompletionsController.get(editor)?.model.get();
                const context = new GhostTextContext(model, editor);
                await callback({ editor, editorViewModel, model, context });
                context.dispose();
            });
        }
        finally {
            disposableStore.dispose();
            ModifierKeyEmitter.disposeInstance();
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdFdpZGdldE1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy90ZXN0L2Jyb3dzZXIvc3VnZ2VzdFdpZGdldE1vZGVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVuRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEYsT0FBTyxFQUF1RCx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFJLE9BQU8sRUFBUyxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixP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