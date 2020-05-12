/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { createTestCodeEditor, TestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IStorageService, InMemoryStorageService } from 'vs/platform/storage/common/storage';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/suggestMemory';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { mock } from 'vs/editor/contrib/suggest/test/suggestModel.test';
import { Selection } from 'vs/editor/common/core/selection';
import { CompletionProviderRegistry, CompletionItemKind, CompletionItemInsertTextRule } from 'vs/editor/common/modes';
import { Event } from 'vs/base/common/event';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { IMenuService, IMenu } from 'vs/platform/actions/common/actions';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';

suite('SuggestController', function () {

	const disposables = new DisposableStore();

	let controller: SuggestController;
	let editor: TestCodeEditor;
	let model: TextModel;

	setup(function () {
		disposables.clear();

		const serviceCollection = new ServiceCollection(
			[ITelemetryService, NullTelemetryService],
			[IStorageService, new InMemoryStorageService()],
			[IKeybindingService, new MockKeybindingService()],
			[IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
				computeWordRanges() {
					return Promise.resolve({});
				}
			}],
			[ISuggestMemoryService, new class extends mock<ISuggestMemoryService>() {
				memorize(): void { }
				select(): number { return 0; }
			}],
			[IMenuService, new class extends mock<IMenuService>() {
				createMenu() {
					return new class extends mock<IMenu>() {
						onDidChange = Event.None;
					};
				}
			}]
		);

		model = createTextModel('', undefined, undefined, URI.from({ scheme: 'test-ctrl', path: '/path.tst' }));
		editor = createTestCodeEditor({
			model,
			serviceCollection,
		});

		editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
		controller = editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
	});

	test('postfix completion reports incorrect position #86984', async function () {
		disposables.add(CompletionProviderRegistry.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'let ${1:name} = foo$0',
						insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
						range: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 11 },
						additionalTextEdits: [{
							text: '',
							range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 9 }
						}]
					}]
				};
			}
		}));

		editor.setValue('    foo.le');
		editor.setSelection(new Selection(1, 11, 1, 11));

		// trigger
		let p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		let p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		assert.equal(editor.getValue(), '    let name = foo');
	});
});
