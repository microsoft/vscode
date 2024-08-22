/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async';
import { Event } from '../../../../../base/common/event';
import { DisposableStore } from '../../../../../base/common/lifecycle';
import { mock } from '../../../../../base/test/common/mock';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler';
import { Range } from '../../../../common/core/range';
import { CompletionItemKind, CompletionItemProvider } from '../../../../common/languages';
import { IEditorWorkerService } from '../../../../common/services/editorWorker';
import { ViewModel } from '../../../../common/viewModel/viewModelImpl';
import { GhostTextContext } from './utils';
import { SnippetController2 } from '../../../snippet/browser/snippetController2';
import { SuggestController } from '../../../suggest/browser/suggestController';
import { ISuggestMemoryService } from '../../../suggest/browser/suggestMemory';
import { ITestCodeEditor, TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils';
import assert from 'assert';
import { ILabelService } from '../../../../../platform/label/common/label';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures';
import { InlineCompletionsModel } from '../../browser/inlineCompletionsModel';
import { InlineCompletionsController } from '../../browser/inlineCompletionsController';
import { autorun } from '../../../../../base/common/observable';
import { setUnexpectedErrorHandler } from '../../../../../base/common/errors';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';

suite('Suggest Widget Model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		setUnexpectedErrorHandler(function (err) {
			throw err;
		});
	});

	// This test is skipped because the fix for this causes https://github.com/microsoft/vscode/issues/166023
	test.skip('Active', async () => {
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, },
			async ({ editor, editorViewModel, context, model }) => {
				let last: boolean | undefined = undefined;
				const history = new Array<boolean>();
				const d = autorun(reader => {
					/** @description debug */
					const selectedSuggestItem = !!model.selectedSuggestItem.read(reader);
					if (last !== selectedSuggestItem) {
						last = selectedSuggestItem;
						history.push(last);
					}
				});

				context.keyboardType('h');
				const suggestController = (editor.getContribution(SuggestController.ID) as SuggestController);
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
			}
		);
	});

	test('Ghost Text', async () => {
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, suggest: { preview: true } },
			async ({ editor, editorViewModel, context, model }) => {
				context.keyboardType('h');
				const suggestController = (editor.getContribution(SuggestController.ID) as SuggestController);
				suggestController.triggerSuggest();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'h[ello]']);

				context.keyboardType('.');
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['h', 'hello.[hello]']);

				suggestController.cancelSuggestWidget();

				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['hello.']);
			}
		);
	});
});

const provider: CompletionItemProvider = {
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
				kind: CompletionItemKind.Text,
				label: 'hello',
				range,
				commitCharacters: ['.'],
			}]
		};
	},
};

async function withAsyncTestCodeEditorAndInlineCompletionsModel(
	text: string,
	options: TestCodeEditorInstantiationOptions & { provider?: CompletionItemProvider; fakeClock?: boolean; serviceCollection?: never },
	callback: (args: { editor: ITestCodeEditor; editorViewModel: ViewModel; model: InlineCompletionsModel; context: GhostTextContext }) => Promise<void>
): Promise<void> {
	await runWithFakedTimers({ useFakeTimers: options.fakeClock }, async () => {
		const disposableStore = new DisposableStore();

		try {
			const serviceCollection = new ServiceCollection(
				[ITelemetryService, NullTelemetryService],
				[ILogService, new NullLogService()],
				[IStorageService, disposableStore.add(new InMemoryStorageService())],
				[IKeybindingService, new MockKeybindingService()],
				[IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
					override computeWordRanges() {
						return Promise.resolve({});
					}
				}],
				[ISuggestMemoryService, new class extends mock<ISuggestMemoryService>() {
					override memorize(): void { }
					override select(): number { return 0; }
				}],
				[IMenuService, new class extends mock<IMenuService>() {
					override createMenu() {
						return new class extends mock<IMenu>() {
							override onDidChange = Event.None;
							override dispose() { }
						};
					}
				}],
				[ILabelService, new class extends mock<ILabelService>() { }],
				[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { }],
				[IAccessibilitySignalService, {
					playSignal: async () => { },
					isSoundEnabled(signal: unknown) { return false; },
				} as any]
			);

			if (options.provider) {
				const languageFeaturesService = new LanguageFeaturesService();
				serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
				disposableStore.add(languageFeaturesService.completionProvider.register({ pattern: '**' }, options.provider));
			}

			await withAsyncTestCodeEditor(text, { ...options, serviceCollection }, async (editor, editorViewModel, instantiationService) => {
				editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
				editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
				editor.registerAndInstantiateContribution(InlineCompletionsController.ID, InlineCompletionsController);
				const model = InlineCompletionsController.get(editor)?.model.get()!;

				const context = new GhostTextContext(model, editor);
				await callback({ editor, editorViewModel, model, context });
				context.dispose();
			});
		} finally {
			disposableStore.dispose();
		}
	});
}
