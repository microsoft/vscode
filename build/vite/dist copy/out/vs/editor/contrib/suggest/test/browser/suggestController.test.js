/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { SuggestController } from '../../browser/suggestController.js';
import { ISuggestMemoryService } from '../../browser/suggestMemory.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { DeleteLinesAction } from '../../../linesOperations/browser/linesOperations.js';
suite('SuggestController', function () {
    const disposables = new DisposableStore();
    let controller;
    let editor;
    let model;
    const languageFeaturesService = new LanguageFeaturesService();
    teardown(function () {
        disposables.clear();
    });
    // ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        const serviceCollection = new ServiceCollection([ILanguageFeaturesService, languageFeaturesService], [ITelemetryService, NullTelemetryService], [ILogService, new NullLogService()], [IStorageService, disposables.add(new InMemoryStorageService())], [IKeybindingService, new MockKeybindingService()], [IEditorWorkerService, new class extends mock() {
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
            }], [IEnvironmentService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.isBuilt = true;
                    this.isExtensionDevelopment = false;
                }
            }]);
        model = disposables.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'test-ctrl', path: '/path.tst' })));
        editor = disposables.add(createTestCodeEditor(model, { serviceCollection }));
        editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
        controller = editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
    });
    test('postfix completion reports incorrect position #86984', async function () {
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
                            label: 'let',
                            insertText: 'let ${1:name} = foo$0',
                            insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
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
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
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
        let resolve = () => { };
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
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
        let resolve = () => { };
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
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
        let resolve = () => { };
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
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
        const resolve = [];
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
                            label: 'let',
                            insertText: 'hello',
                            range: Range.fromPositions(pos)
                        }, {
                            kind: 28 /* CompletionItemKind.Snippet */,
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
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
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
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                const word = doc.getWordUntilPosition(pos);
                const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'filterBankSize',
                            insertText: 'filterBankSize',
                            sortText: 'a',
                            range
                        }, {
                            kind: 18 /* CompletionItemKind.Text */,
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
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                const word = doc.getWordUntilPosition(pos);
                const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'false',
                            insertText: 'false',
                            range
                        }, {
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'float',
                            insertText: 'float',
                            range
                        }, {
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'for',
                            insertText: 'for',
                            range
                        }, {
                            kind: 18 /* CompletionItemKind.Text */,
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
    test.skip('Suggest widget gets orphaned in editor #187779', async function () {
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                const word = doc.getLineContent(pos.lineNumber);
                const range = new Range(pos.lineNumber, 1, pos.lineNumber, pos.column);
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: word,
                            insertText: word,
                            range
                        }]
                };
            }
        }));
        editor.setValue(`console.log(example.)\nconsole.log(EXAMPLE.not)`);
        editor.setSelection(new Selection(1, 21, 1, 21));
        const p1 = Event.toPromise(controller.model.onDidSuggest);
        controller.triggerSuggest();
        await p1;
        const p2 = Event.toPromise(controller.model.onDidCancel);
        new DeleteLinesAction().run(null, editor);
        await p2;
    });
    test('Ranges where additionalTextEdits are applied are not appropriate when characters are typed #177591', async function () {
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 28 /* CompletionItemKind.Snippet */,
                            label: 'aaa',
                            insertText: 'aaa',
                            range: Range.fromPositions(pos),
                            additionalTextEdits: [{
                                    range: Range.fromPositions(pos.delta(0, 10)),
                                    text: 'aaa'
                                }]
                        }]
                };
            }
        }));
        { // PART1 - no typing
            editor.setValue(`123456789123456789`);
            editor.setSelection(new Selection(1, 1, 1, 1));
            const p1 = Event.toPromise(controller.model.onDidSuggest);
            controller.triggerSuggest();
            const e = await p1;
            assert.strictEqual(e.completionModel.items.length, 1);
            assert.strictEqual(e.completionModel.items[0].textLabel, 'aaa');
            controller.acceptSelectedSuggestion(false, false);
            assert.strictEqual(editor.getValue(), 'aaa1234567891aaa23456789');
        }
        { // PART2 - typing
            editor.setValue(`123456789123456789`);
            editor.setSelection(new Selection(1, 1, 1, 1));
            const p1 = Event.toPromise(controller.model.onDidSuggest);
            controller.triggerSuggest();
            const e = await p1;
            assert.strictEqual(e.completionModel.items.length, 1);
            assert.strictEqual(e.completionModel.items[0].textLabel, 'aaa');
            editor.trigger('keyboard', 'type', { text: 'aa' });
            controller.acceptSelectedSuggestion(false, false);
            assert.strictEqual(editor.getValue(), 'aaa1234567891aaa23456789');
        }
    });
    test.skip('[Bug] "No suggestions" persists while typing if the completion helper is set to return an empty list for empty content#3557', async function () {
        let requestCount = 0;
        disposables.add(languageFeaturesService.completionProvider.register({ scheme: 'test-ctrl' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                requestCount += 1;
                if (requestCount === 1) {
                    return undefined;
                }
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'foo',
                            insertText: 'foo',
                            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
                        }],
                };
            }
        }));
        const p1 = Event.toPromise(controller.model.onDidSuggest);
        controller.triggerSuggest();
        const e1 = await p1;
        assert.strictEqual(e1.completionModel.items.length, 0);
        assert.strictEqual(requestCount, 1);
        const p2 = Event.toPromise(controller.model.onDidSuggest);
        editor.trigger('keyboard', 'type', { text: 'f' });
        const e2 = await p2;
        assert.strictEqual(e2.completionModel.items.length, 1);
        assert.strictEqual(requestCount, 2);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdENvbnRyb2xsZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvdGVzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sNENBQTRDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBUyxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFB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