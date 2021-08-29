/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SuggestWidgetPreviewModel } from 'vs/editor/contrib/inlineCompletions/suggestWidgetPreviewModel';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { mock } from 'vs/base/test/common/mock';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/suggestMemory';
import { IMenuService, IMenu } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { timeout } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { CompletionItemKind, CompletionItemProvider, CompletionProviderRegistry } from 'vs/editor/common/modes';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { TestCodeEditorCreationOptions, ITestCodeEditor, withAsyncTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { Event } from 'vs/base/common/event';
import assert = require('assert');
import { GhostTextContext } from 'vs/editor/contrib/inlineCompletions/test/utils';
import { Range } from 'vs/editor/common/core/range';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { SharedInlineCompletionCache } from 'vs/editor/contrib/inlineCompletions/ghostTextModel';

suite('Suggest Widget Model', () => {
	test('Active', async () => {
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, },
			async ({ editor, editorViewModel, context, model }) => {
				let last: boolean | undefined = undefined;
				const history = new Array<boolean>();
				model.onDidChange(() => {
					if (last !== model.isActive) {
						last = model.isActive;
						history.push(last);
					}
				});

				context.keyboardType('h');
				const suggestController = (editor.getContribution(SuggestController.ID) as SuggestController);
				suggestController.triggerSuggest();
				await timeout(1000);
				assert.deepStrictEqual(history.splice(0), [true]);

				context.keyboardType('.');
				await timeout(1000);

				// No flicker here
				assert.deepStrictEqual(history.splice(0), []);
				suggestController.cancelSuggestWidget();
				await timeout(1000);

				assert.deepStrictEqual(history.splice(0), [false]);
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
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'h', 'h[ello]']);

				context.keyboardType('.');
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['hello', 'hello.', 'hello.[hello]']);

				suggestController.cancelSuggestWidget();

				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['hello.']);
			}
		);
	});
});

const provider: CompletionItemProvider = {
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
	options: TestCodeEditorCreationOptions & { provider?: CompletionItemProvider, fakeClock?: boolean, serviceCollection?: never },
	callback: (args: { editor: ITestCodeEditor, editorViewModel: ViewModel, model: SuggestWidgetPreviewModel, context: GhostTextContext }) => Promise<void>
): Promise<void> {
	await runWithFakedTimers({ useFakeTimers: options.fakeClock }, async () => {
		const disposableStore = new DisposableStore();

		try {
			const serviceCollection = new ServiceCollection(
				[ITelemetryService, NullTelemetryService],
				[ILogService, new NullLogService()],
				[IStorageService, new InMemoryStorageService()],
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
				}]
			);

			if (options.provider) {
				const d = CompletionProviderRegistry.register({ pattern: '**' }, options.provider);
				disposableStore.add(d);
			}

			await withAsyncTestCodeEditor(text, { ...options, serviceCollection }, async (editor, editorViewModel, instantiationService) => {
				editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
				editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
				const cache = disposableStore.add(new SharedInlineCompletionCache());
				const model = instantiationService.createInstance(SuggestWidgetPreviewModel, editor, cache);
				const context = new GhostTextContext(model, editor);
				await callback({ editor, editorViewModel, model, context });
				model.dispose();
			});
		} finally {
			disposableStore.dispose();
		}
	});
}
