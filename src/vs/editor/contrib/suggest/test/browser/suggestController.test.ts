/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TextModel } from 'vs/editor/common/model/textModel';
import { CompletionItemInsertTextRule, CompletionItemKind } from 'vs/editor/common/languages';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/browser/suggestMemory';
import { createTestCodeEditor, ITestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

suite('SuggestController', function () {

	const disposables = new DisposableStore();

	let controller: SuggestController;
	let editor: ITestCodeEditor;
	let model: TextModel;
	const languageFeaturesService = new LanguageFeaturesService();


	teardown(function () {
		disposables.clear();
	});

	setup(function () {

		const serviceCollection = new ServiceCollection(
			[ILanguageFeaturesService, languageFeaturesService],
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
			}],
			[ILabelService, new class extends mock<ILabelService>() { }],
			[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { }],
			[IEnvironmentService, new class extends mock<IEnvironmentService>() {
				override isBuilt: boolean = true;
				override isExtensionDevelopment: boolean = false;
			}],
		);

		model = disposables.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'test-ctrl', path: '/path.tst' })));
		editor = disposables.add(createTestCodeEditor(model, { serviceCollection }));

		editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
		controller = editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
	});

	test('postfix completion reports incorrect position #86984', async function () {
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
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
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		assert.strictEqual(editor.getValue(), '    let name = foo');
	});

	test('use additionalTextEdits sync when possible', async function () {

		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos),
						additionalTextEdits: [{
							text: 'I came sync',
							range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
						}]
					}]
				};
			},
			async resolveCompletionItem(item) {
				return item;
			}
		}));

		editor.setValue('hello\nhallo');
		editor.setSelection(new Selection(2, 6, 2, 6));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'I came synchello\nhallohello');
	});

	test('resolve additionalTextEdits async when needed', async function () {

		let resolveCallCount = 0;

		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos)
					}]
				};
			},
			async resolveCompletionItem(item) {
				resolveCallCount += 1;
				await timeout(10);
				item.additionalTextEdits = [{
					text: 'I came late',
					range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
				}];
				return item;
			}
		}));

		editor.setValue('hello\nhallo');
		editor.setSelection(new Selection(2, 6, 2, 6));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'hello\nhallohello');
		assert.strictEqual(resolveCallCount, 1);

		// additional edits happened after a litte wait
		await timeout(20);
		assert.strictEqual(editor.getValue(), 'I came latehello\nhallohello');

		// single undo stop
		editor.getModel()?.undo();
		assert.strictEqual(editor.getValue(), 'hello\nhallo');
	});

	test('resolve additionalTextEdits async when needed (typing)', async function () {

		let resolveCallCount = 0;
		let resolve: Function = () => { };
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos)
					}]
				};
			},
			async resolveCompletionItem(item) {
				resolveCallCount += 1;
				await new Promise(_resolve => resolve = _resolve);
				item.additionalTextEdits = [{
					text: 'I came late',
					range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
				}];
				return item;
			}
		}));

		editor.setValue('hello\nhallo');
		editor.setSelection(new Selection(2, 6, 2, 6));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'hello\nhallohello');
		assert.strictEqual(resolveCallCount, 1);

		// additional edits happened after a litte wait
		assert.ok(editor.getSelection()?.equalsSelection(new Selection(2, 11, 2, 11)));
		editor.trigger('test', 'type', { text: 'TYPING' });

		assert.strictEqual(editor.getValue(), 'hello\nhallohelloTYPING');

		resolve();
		await timeout(10);
		assert.strictEqual(editor.getValue(), 'I came latehello\nhallohelloTYPING');
		assert.ok(editor.getSelection()?.equalsSelection(new Selection(2, 17, 2, 17)));
	});

	// additional edit come late and are AFTER the selection -> cancel
	test('resolve additionalTextEdits async when needed (simple conflict)', async function () {

		let resolveCallCount = 0;
		let resolve: Function = () => { };
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos)
					}]
				};
			},
			async resolveCompletionItem(item) {
				resolveCallCount += 1;
				await new Promise(_resolve => resolve = _resolve);
				item.additionalTextEdits = [{
					text: 'I came late',
					range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 }
				}];
				return item;
			}
		}));

		editor.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'hello');
		assert.strictEqual(resolveCallCount, 1);

		resolve();
		await timeout(10);
		assert.strictEqual(editor.getValue(), 'hello');
	});

	// additional edit come late and are AFTER the position at which the user typed -> cancelled
	test('resolve additionalTextEdits async when needed (conflict)', async function () {

		let resolveCallCount = 0;
		let resolve: Function = () => { };
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos)
					}]
				};
			},
			async resolveCompletionItem(item) {
				resolveCallCount += 1;
				await new Promise(_resolve => resolve = _resolve);
				item.additionalTextEdits = [{
					text: 'I came late',
					range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }
				}];
				return item;
			}
		}));

		editor.setValue('hello\nhallo');
		editor.setSelection(new Selection(2, 6, 2, 6));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(false, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'hello\nhallohello');
		assert.strictEqual(resolveCallCount, 1);

		// additional edits happened after a litte wait
		editor.setSelection(new Selection(1, 1, 1, 1));
		editor.trigger('test', 'type', { text: 'TYPING' });

		assert.strictEqual(editor.getValue(), 'TYPINGhello\nhallohello');

		resolve();
		await timeout(10);
		assert.strictEqual(editor.getValue(), 'TYPINGhello\nhallohello');
		assert.ok(editor.getSelection()?.equalsSelection(new Selection(1, 7, 1, 7)));
	});

	test('resolve additionalTextEdits async when needed (cancel)', async function () {

		const resolve: Function[] = [];
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hello',
						range: Range.fromPositions(pos)
					}, {
						kind: CompletionItemKind.Snippet,
						label: 'let',
						insertText: 'hallo',
						range: Range.fromPositions(pos)
					}]
				};
			},
			async resolveCompletionItem(item) {
				await new Promise(_resolve => resolve.push(_resolve));
				item.additionalTextEdits = [{
					text: 'additionalTextEdits',
					range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }
				}];
				return item;
			}
		}));

		editor.setValue('abc');
		editor.setSelection(new Selection(1, 1, 1, 1));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(true, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'helloabc');

		// next
		controller.acceptNextSuggestion();

		// resolve additional edits (MUST be cancelled)
		resolve.forEach(fn => fn);
		resolve.length = 0;
		await timeout(10);

		// next suggestion used
		assert.strictEqual(editor.getValue(), 'halloabc');
	});

	test('Completion edits are applied inconsistently when additionalTextEdits and textEdit start at the same offset #143888', async function () {


		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {
				return {
					suggestions: [{
						kind: CompletionItemKind.Text,
						label: 'MyClassName',
						insertText: 'MyClassName',
						range: Range.fromPositions(pos),
						additionalTextEdits: [{
							range: Range.fromPositions(pos),
							text: 'import "my_class.txt";\n'
						}]
					}]
				};
			}
		}));

		editor.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		// trigger
		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();
		await p1;

		//
		const p2 = Event.toPromise(controller.model.onDidCancel);
		controller.acceptSelectedSuggestion(true, false);
		await p2;

		// insertText happens sync!
		assert.strictEqual(editor.getValue(), 'import "my_class.txt";\nMyClassName');

	});

	test('Pressing enter on autocomplete should always apply the selected dropdown completion, not a different, hidden one #161883', async function () {
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {

				const word = doc.getWordUntilPosition(pos);
				const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);

				return {
					suggestions: [{
						kind: CompletionItemKind.Text,
						label: 'filterBankSize',
						insertText: 'filterBankSize',
						sortText: 'a',
						range
					}, {
						kind: CompletionItemKind.Text,
						label: 'filter',
						insertText: 'filter',
						sortText: 'b',
						range
					}]
				};
			}
		}));

		editor.setValue('filte');
		editor.setSelection(new Selection(1, 6, 1, 6));

		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();

		const { completionModel } = await p1;
		assert.strictEqual(completionModel.items.length, 2);

		const [first, second] = completionModel.items;
		assert.strictEqual(first.textLabel, 'filterBankSize');
		assert.strictEqual(second.textLabel, 'filter');

		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 6, 1, 6));
		editor.trigger('keyboard', 'type', { text: 'r' }); // now filter "overtakes" filterBankSize because it is fully matched
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 7, 1, 7));

		controller.acceptSelectedSuggestion(false, false);
		assert.strictEqual(editor.getValue(), 'filter');
	});

	test('Fast autocomple typing selects the previous autocomplete suggestion, #71795', async function () {
		disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
			provideCompletionItems(doc, pos) {

				const word = doc.getWordUntilPosition(pos);
				const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);

				return {
					suggestions: [{
						kind: CompletionItemKind.Text,
						label: 'false',
						insertText: 'false',
						range
					}, {
						kind: CompletionItemKind.Text,
						label: 'float',
						insertText: 'float',
						range
					}, {
						kind: CompletionItemKind.Text,
						label: 'for',
						insertText: 'for',
						range
					}, {
						kind: CompletionItemKind.Text,
						label: 'foreach',
						insertText: 'foreach',
						range
					}]
				};
			}
		}));

		editor.setValue('f');
		editor.setSelection(new Selection(1, 2, 1, 2));

		const p1 = Event.toPromise(controller.model.onDidSuggest);
		controller.triggerSuggest();

		const { completionModel } = await p1;
		assert.strictEqual(completionModel.items.length, 4);

		const [first, second, third, fourth] = completionModel.items;
		assert.strictEqual(first.textLabel, 'false');
		assert.strictEqual(second.textLabel, 'float');
		assert.strictEqual(third.textLabel, 'for');
		assert.strictEqual(fourth.textLabel, 'foreach');

		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 2, 1, 2));
		editor.trigger('keyboard', 'type', { text: 'o' }); // filters`false` and `float`
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 3, 1, 3));

		controller.acceptSelectedSuggestion(false, false);
		assert.strictEqual(editor.getValue(), 'for');
	});
});
