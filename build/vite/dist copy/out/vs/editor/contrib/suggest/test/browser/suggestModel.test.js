var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { EditOperation } from '../../../../common/core/editOperation.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { NullState } from '../../../../common/languages/nullTokenize.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { SuggestController } from '../../browser/suggestController.js';
import { ISuggestMemoryService } from '../../browser/suggestMemory.js';
import { LineContext, SuggestModel } from '../../browser/suggestModel.js';
import { createTestCodeEditor, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createModelServices, createTextModel, instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getSnippetSuggestSupport, setSnippetSuggestSupport } from '../../browser/suggest.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../base/common/async.js';
import { InlineCompletionsController } from '../../../inlineCompletions/browser/controller/inlineCompletionsController.js';
import { InlineSuggestionsView } from '../../../inlineCompletions/browser/view/inlineSuggestionsView.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
function createMockEditor(model, languageFeaturesService) {
    const storeService = new InMemoryStorageService();
    const editor = createTestCodeEditor(model, {
        serviceCollection: new ServiceCollection([ILanguageFeaturesService, languageFeaturesService], [ITelemetryService, NullTelemetryService], [IStorageService, storeService], [IKeybindingService, new MockKeybindingService()], [ISuggestMemoryService, new class {
                memorize() {
                }
                select() {
                    return -1;
                }
            }], [ILabelService, new class extends mock() {
            }], [IWorkspaceContextService, new class extends mock() {
            }], [IEnvironmentService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.isBuilt = true;
                    this.isExtensionDevelopment = false;
                }
            }]),
    });
    const ctrl = editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
    editor.hasWidgetFocus = () => true;
    editor.registerDisposable(ctrl);
    editor.registerDisposable(storeService);
    return editor;
}
suite('SuggestModel - Context', function () {
    const OUTER_LANGUAGE_ID = 'outerMode';
    const INNER_LANGUAGE_ID = 'innerMode';
    let OuterMode = class OuterMode extends Disposable {
        constructor(languageService, languageConfigurationService) {
            super();
            this.languageId = OUTER_LANGUAGE_ID;
            this._register(languageService.registerLanguage({ id: this.languageId }));
            this._register(languageConfigurationService.register(this.languageId, {}));
            this._register(TokenizationRegistry.register(this.languageId, {
                getInitialState: () => NullState,
                tokenize: undefined,
                tokenizeEncoded: (line, hasEOL, state) => {
                    const tokensArr = [];
                    let prevLanguageId = undefined;
                    for (let i = 0; i < line.length; i++) {
                        const languageId = (line.charAt(i) === 'x' ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID);
                        const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
                        if (prevLanguageId !== languageId) {
                            tokensArr.push(i);
                            tokensArr.push((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */));
                        }
                        prevLanguageId = languageId;
                    }
                    const tokens = new Uint32Array(tokensArr.length);
                    for (let i = 0; i < tokens.length; i++) {
                        tokens[i] = tokensArr[i];
                    }
                    return new EncodedTokenizationResult(tokens, [], state);
                }
            }));
        }
    };
    OuterMode = __decorate([
        __param(0, ILanguageService),
        __param(1, ILanguageConfigurationService)
    ], OuterMode);
    let InnerMode = class InnerMode extends Disposable {
        constructor(languageService, languageConfigurationService) {
            super();
            this.languageId = INNER_LANGUAGE_ID;
            this._register(languageService.registerLanguage({ id: this.languageId }));
            this._register(languageConfigurationService.register(this.languageId, {}));
        }
    };
    InnerMode = __decorate([
        __param(0, ILanguageService),
        __param(1, ILanguageConfigurationService)
    ], InnerMode);
    const assertAutoTrigger = (model, offset, expected, message) => {
        const pos = model.getPositionAt(offset);
        const editor = createMockEditor(model, new LanguageFeaturesService());
        editor.setPosition(pos);
        assert.strictEqual(LineContext.shouldAutoTrigger(editor), expected, message);
        editor.dispose();
    };
    let disposables;
    setup(() => {
        disposables = new DisposableStore();
    });
    teardown(function () {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Context - shouldAutoTrigger', function () {
        const model = createTextModel('Das Pferd frisst keinen Gurkensalat - Philipp Reis 1861.\nWer hat\'s erfunden?');
        disposables.add(model);
        assertAutoTrigger(model, 3, true, 'end of word, Das|');
        assertAutoTrigger(model, 4, false, 'no word Das |');
        assertAutoTrigger(model, 1, true, 'typing a single character before a word: D|as');
        assertAutoTrigger(model, 55, false, 'number, 1861|');
        model.dispose();
    });
    test('shouldAutoTrigger at embedded language boundaries', () => {
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const outerMode = disposables.add(instantiationService.createInstance(OuterMode));
        disposables.add(instantiationService.createInstance(InnerMode));
        const model = disposables.add(instantiateTextModel(instantiationService, 'a<xx>a<x>', outerMode.languageId));
        assertAutoTrigger(model, 1, true, 'a|<x — should trigger at end of word');
        assertAutoTrigger(model, 2, false, 'a<|x — should NOT trigger at start of word');
        assertAutoTrigger(model, 3, true, 'a<x|x —  should trigger after typing a single character before a word');
        assertAutoTrigger(model, 4, true, 'a<xx|> — should trigger at boundary between languages');
        assertAutoTrigger(model, 5, false, 'a<xx>|a — should NOT trigger at start of word');
        assertAutoTrigger(model, 6, true, 'a<xx>a|< — should trigger at end of word');
        assertAutoTrigger(model, 8, true, 'a<xx>a<x|> — should trigger at end of word at boundary');
        disposables.dispose();
    });
});
suite('SuggestModel - TriggerAndCancelOracle', function () {
    function getDefaultSuggestRange(model, position) {
        const wordUntil = model.getWordUntilPosition(position);
        return new Range(position.lineNumber, wordUntil.startColumn, position.lineNumber, wordUntil.endColumn);
    }
    const alwaysEmptySupport = {
        _debugDisplayName: 'test',
        provideCompletionItems(doc, pos) {
            return {
                incomplete: false,
                suggestions: []
            };
        }
    };
    const alwaysSomethingSupport = {
        _debugDisplayName: 'test',
        provideCompletionItems(doc, pos) {
            return {
                incomplete: false,
                suggestions: [{
                        label: doc.getWordUntilPosition(pos).word,
                        kind: 9 /* CompletionItemKind.Property */,
                        insertText: 'foofoo',
                        range: getDefaultSuggestRange(doc, pos)
                    }]
            };
        }
    };
    let disposables;
    let model;
    const languageFeaturesService = new LanguageFeaturesService();
    const registry = languageFeaturesService.completionProvider;
    setup(function () {
        disposables = new DisposableStore();
        model = createTextModel('abc def', undefined, undefined, URI.parse('test:somefile.ttt'));
        disposables.add(model);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function withOracle(callback) {
        return new Promise((resolve, reject) => {
            const editor = createMockEditor(model, languageFeaturesService);
            const oracle = editor.invokeWithinContext(accessor => accessor.get(IInstantiationService).createInstance(SuggestModel, editor));
            disposables.add(oracle);
            disposables.add(editor);
            try {
                resolve(callback(oracle, editor));
            }
            catch (err) {
                reject(err);
            }
        });
    }
    function assertEvent(event, action, assert) {
        return new Promise((resolve, reject) => {
            const sub = event(e => {
                sub.dispose();
                try {
                    resolve(assert(e));
                }
                catch (err) {
                    reject(err);
                }
            });
            try {
                action();
            }
            catch (err) {
                sub.dispose();
                reject(err);
            }
        });
    }
    test('events - cancel/trigger', function () {
        return withOracle(model => {
            return Promise.all([
                assertEvent(model.onDidTrigger, function () {
                    model.trigger({ auto: true });
                }, function (event) {
                    assert.strictEqual(event.auto, true);
                    return assertEvent(model.onDidCancel, function () {
                        model.cancel();
                    }, function (event) {
                        assert.strictEqual(event.retrigger, false);
                    });
                }),
                assertEvent(model.onDidTrigger, function () {
                    model.trigger({ auto: true });
                }, function (event) {
                    assert.strictEqual(event.auto, true);
                }),
                assertEvent(model.onDidTrigger, function () {
                    model.trigger({ auto: false });
                }, function (event) {
                    assert.strictEqual(event.auto, false);
                })
            ]);
        });
    });
    test('events - suggest/empty', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysEmptySupport));
        return withOracle(model => {
            return Promise.all([
                assertEvent(model.onDidCancel, function () {
                    model.trigger({ auto: true });
                }, function (event) {
                    assert.strictEqual(event.retrigger, false);
                }),
                assertEvent(model.onDidSuggest, function () {
                    model.trigger({ auto: false });
                }, function (event) {
                    assert.strictEqual(event.triggerOptions.auto, false);
                    assert.strictEqual(event.isFrozen, false);
                    assert.strictEqual(event.completionModel.items.length, 0);
                })
            ]);
        });
    });
    test('trigger - on type', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        return withOracle((model, editor) => {
            return assertEvent(model.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 4 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.provider, alwaysSomethingSupport);
            });
        });
    });
    test('#17400: Keep filtering suggestModel.ts after space', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: false,
                    suggestions: [{
                            label: 'My Table',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'My Table',
                            range: getDefaultSuggestRange(doc, pos)
                        }]
                };
            }
        }));
        model.setValue('');
        return withOracle((model, editor) => {
            return assertEvent(model.onDidSuggest, () => {
                // make sure completionModel starts here!
                model.trigger({ auto: true });
            }, event => {
                return assertEvent(model.onDidSuggest, () => {
                    editor.setPosition({ lineNumber: 1, column: 1 });
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'My' });
                }, event => {
                    assert.strictEqual(event.triggerOptions.auto, true);
                    assert.strictEqual(event.completionModel.items.length, 1);
                    const [first] = event.completionModel.items;
                    assert.strictEqual(first.completion.label, 'My Table');
                    return assertEvent(model.onDidSuggest, () => {
                        editor.setPosition({ lineNumber: 1, column: 3 });
                        editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' ' });
                    }, event => {
                        assert.strictEqual(event.triggerOptions.auto, true);
                        assert.strictEqual(event.completionModel.items.length, 1);
                        const [first] = event.completionModel.items;
                        assert.strictEqual(first.completion.label, 'My Table');
                    });
                });
            });
        });
    });
    test('#21484: Trigger character always force a new completion session', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: false,
                    suggestions: [{
                            label: 'foo.bar',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'foo.bar',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }]
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['.'],
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: false,
                    suggestions: [{
                            label: 'boom',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'boom',
                            range: Range.fromPositions(pos.delta(0, doc.getLineContent(pos.lineNumber)[pos.column - 2] === '.' ? 0 : -1), pos)
                        }]
                };
            }
        }));
        model.setValue('');
        return withOracle(async (model, editor) => {
            await assertEvent(model.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 1 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'foo' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.completion.label, 'foo.bar');
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: '.' });
            }, event => {
                // SYNC
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.completion.label, 'foo.bar');
            });
            await assertEvent(model.onDidSuggest, () => {
                // nothing -> triggered by the trigger character typing (see above)
            }, event => {
                // ASYNC
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                const [first, second] = event.completionModel.items;
                assert.strictEqual(first.completion.label, 'foo.bar');
                assert.strictEqual(second.completion.label, 'boom');
            });
        });
    });
    test('Intellisense Completion doesn\'t respect space after equal sign (.html file), #29353 [1/2]', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        return withOracle((model, editor) => {
            editor.getModel().setValue('fo');
            editor.setPosition({ lineNumber: 1, column: 3 });
            return assertEvent(model.onDidSuggest, () => {
                model.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, false);
                assert.strictEqual(event.isFrozen, false);
                assert.strictEqual(event.completionModel.items.length, 1);
                return assertEvent(model.onDidCancel, () => {
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: '+' });
                }, event => {
                    assert.strictEqual(event.retrigger, false);
                });
            });
        });
    });
    test('Intellisense Completion doesn\'t respect space after equal sign (.html file), #29353 [2/2]', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        return withOracle((model, editor) => {
            editor.getModel().setValue('fo');
            editor.setPosition({ lineNumber: 1, column: 3 });
            return assertEvent(model.onDidSuggest, () => {
                model.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, false);
                assert.strictEqual(event.isFrozen, false);
                assert.strictEqual(event.completionModel.items.length, 1);
                return assertEvent(model.onDidCancel, () => {
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' ' });
                }, event => {
                    assert.strictEqual(event.retrigger, false);
                });
            });
        });
    });
    test('Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (1/2)', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: true,
                    suggestions: [{
                            label: 'foo',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'foo',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }]
                };
            }
        }));
        return withOracle((model, editor) => {
            editor.getModel().setValue('foo');
            editor.setPosition({ lineNumber: 1, column: 4 });
            return assertEvent(model.onDidSuggest, () => {
                model.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, false);
                assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
                assert.strictEqual(event.completionModel.items.length, 1);
                return assertEvent(model.onDidCancel, () => {
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: ';' });
                }, event => {
                    assert.strictEqual(event.retrigger, false);
                });
            });
        });
    });
    test('Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (2/2)', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: true,
                    suggestions: [{
                            label: 'foo;',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'foo',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }]
                };
            }
        }));
        return withOracle((model, editor) => {
            editor.getModel().setValue('foo');
            editor.setPosition({ lineNumber: 1, column: 4 });
            return assertEvent(model.onDidSuggest, () => {
                model.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, false);
                assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
                assert.strictEqual(event.completionModel.items.length, 1);
                return assertEvent(model.onDidSuggest, () => {
                    // while we cancel incrementally enriching the set of
                    // completions we still filter against those that we have
                    // until now
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: ';' });
                }, event => {
                    assert.strictEqual(event.triggerOptions.auto, false);
                    assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
                    assert.strictEqual(event.completionModel.items.length, 1);
                });
            });
        });
    });
    test('Trigger character is provided in suggest context', function () {
        let triggerCharacter = '';
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['.'],
            provideCompletionItems(doc, pos, context) {
                assert.strictEqual(context.triggerKind, 1 /* CompletionTriggerKind.TriggerCharacter */);
                triggerCharacter = context.triggerCharacter;
                return {
                    incomplete: false,
                    suggestions: [
                        {
                            label: 'foo.bar',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'foo.bar',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }
                    ]
                };
            }
        }));
        model.setValue('');
        return withOracle((model, editor) => {
            return assertEvent(model.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 1 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'foo.' });
            }, event => {
                assert.strictEqual(triggerCharacter, '.');
            });
        });
    });
    test('Mac press and hold accent character insertion does not update suggestions, #35269', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: true,
                    suggestions: [{
                            label: 'abc',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'abc',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }, {
                            label: 'äbc',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'äbc',
                            range: Range.fromPositions(pos.with(undefined, 1), pos)
                        }]
                };
            }
        }));
        model.setValue('');
        return withOracle((model, editor) => {
            return assertEvent(model.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 1 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'a' });
            }, event => {
                assert.strictEqual(event.completionModel.items.length, 1);
                assert.strictEqual(event.completionModel.items[0].completion.label, 'abc');
                return assertEvent(model.onDidSuggest, () => {
                    editor.executeEdits('test', [EditOperation.replace(new Range(1, 1, 1, 2), 'ä')]);
                }, event => {
                    // suggest model changed to äbc
                    assert.strictEqual(event.completionModel.items.length, 1);
                    assert.strictEqual(event.completionModel.items[0].completion.label, 'äbc');
                });
            });
        });
    });
    test('Backspace should not always cancel code completion, #36491', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        return withOracle(async (model, editor) => {
            await assertEvent(model.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 4 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.provider, alwaysSomethingSupport);
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.runCommand(CoreEditingCommands.DeleteLeft, null);
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.provider, alwaysSomethingSupport);
            });
        });
    });
    test('Text changes for completion CodeAction are affected by the completion #39893', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: true,
                    suggestions: [{
                            label: 'bar',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'bar',
                            range: Range.fromPositions(pos.delta(0, -2), pos),
                            additionalTextEdits: [{
                                    text: ', bar',
                                    range: { startLineNumber: 1, endLineNumber: 1, startColumn: 17, endColumn: 17 }
                                }]
                        }]
                };
            }
        }));
        model.setValue('ba; import { foo } from "./b"');
        return withOracle(async (sugget, editor) => {
            class TestCtrl extends SuggestController {
                _insertSuggestion_publicForTest(item, flags = 0) {
                    super._insertSuggestion(item, flags);
                }
            }
            const ctrl = editor.registerAndInstantiateContribution(TestCtrl.ID, TestCtrl);
            editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
            await assertEvent(sugget.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 3 });
                sugget.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.completion.label, 'bar');
                ctrl._insertSuggestion_publicForTest({ item: first, index: 0, model: event.completionModel });
            });
            assert.strictEqual(model.getValue(), 'bar; import { foo, bar } from "./b"');
        });
    });
    test('Completion unexpectedly triggers on second keypress of an edit group in a snippet #43523', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        return withOracle((model, editor) => {
            return assertEvent(model.onDidSuggest, () => {
                editor.setValue('d');
                editor.setSelection(new Selection(1, 1, 1, 2));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'e' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                const [first] = event.completionModel.items;
                assert.strictEqual(first.provider, alwaysSomethingSupport);
            });
        });
    });
    test('Fails to render completion details #47988', function () {
        let disposeA = 0;
        let disposeB = 0;
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: true,
                    suggestions: [{
                            kind: 23 /* CompletionItemKind.Folder */,
                            label: 'CompleteNot',
                            insertText: 'Incomplete',
                            sortText: 'a',
                            range: getDefaultSuggestRange(doc, pos)
                        }],
                    dispose() { disposeA += 1; }
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    incomplete: false,
                    suggestions: [{
                            kind: 23 /* CompletionItemKind.Folder */,
                            label: 'Complete',
                            insertText: 'Complete',
                            sortText: 'z',
                            range: getDefaultSuggestRange(doc, pos)
                        }],
                    dispose() { disposeB += 1; }
                };
            },
            resolveCompletionItem(item) {
                return item;
            },
        }));
        return withOracle(async (model, editor) => {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('');
                editor.setSelection(new Selection(1, 1, 1, 1));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'c' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(disposeA, 0);
                assert.strictEqual(disposeB, 0);
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'o' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                // clean up
                model.clear();
                assert.strictEqual(disposeA, 2); // provide got called two times!
                assert.strictEqual(disposeB, 1);
            });
        });
    });
    test('Trigger (full) completions when (incomplete) completions are already active #99504', function () {
        let countA = 0;
        let countB = 0;
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                countA += 1;
                return {
                    incomplete: false, // doesn't matter if incomplete or not
                    suggestions: [{
                            kind: 5 /* CompletionItemKind.Class */,
                            label: 'Z aaa',
                            insertText: 'Z aaa',
                            range: new Range(1, 1, pos.lineNumber, pos.column)
                        }],
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                countB += 1;
                if (!doc.getWordUntilPosition(pos).word.startsWith('a')) {
                    return;
                }
                return {
                    incomplete: false,
                    suggestions: [{
                            kind: 23 /* CompletionItemKind.Folder */,
                            label: 'aaa',
                            insertText: 'aaa',
                            range: getDefaultSuggestRange(doc, pos)
                        }],
                };
            },
        }));
        return withOracle(async (model, editor) => {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('');
                editor.setSelection(new Selection(1, 1, 1, 1));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'Z' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'Z aaa');
            });
            await assertEvent(model.onDidSuggest, () => {
                // started another word: Z a|
                // item should be: Z aaa, aaa
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' a' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'Z aaa');
                assert.strictEqual(event.completionModel.items[1].textLabel, 'aaa');
                assert.strictEqual(countA, 1); // should we keep the suggestions from the "active" provider?, Yes! See: #106573
                assert.strictEqual(countB, 2);
            });
        });
    });
    test('registerCompletionItemProvider with letters as trigger characters block other completion items to show up #127815', async function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 5 /* CompletionItemKind.Class */,
                            label: 'AAAA',
                            insertText: 'WordTriggerA',
                            range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
                        }],
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['a', '.'],
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 5 /* CompletionItemKind.Class */,
                            label: 'AAAA',
                            insertText: 'AutoTriggerA',
                            range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
                        }],
                };
            },
        }));
        return withOracle(async (model, editor) => {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('');
                editor.setSelection(new Selection(1, 1, 1, 1));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: '.' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
            });
            editor.getModel().setValue('');
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('');
                editor.setSelection(new Selection(1, 1, 1, 1));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'a' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
            });
        });
    });
    test('Unexpected suggest scoring #167242', async function () {
        disposables.add(registry.register('*', {
            // word-based
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                const word = doc.getWordUntilPosition(pos);
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'pull',
                            insertText: 'pull',
                            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn)
                        }],
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            // JSON-based
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                return {
                    suggestions: [{
                            kind: 5 /* CompletionItemKind.Class */,
                            label: 'git.pull',
                            insertText: 'git.pull',
                            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
                        }],
                };
            },
        }));
        return withOracle(async function (model, editor) {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('gi');
                editor.setSelection(new Selection(1, 3, 1, 3));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 't' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'git.pull');
            });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: '.' });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'p' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 1);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'git.pull');
            });
        });
    });
    test('Completion list closes unexpectedly when typing a digit after a word separator #169390', function () {
        const requestCounts = [0, 0];
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos) {
                requestCounts[0] += 1;
                return {
                    suggestions: [{
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'foo-20',
                            insertText: 'foo-20',
                            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
                        }, {
                            kind: 18 /* CompletionItemKind.Text */,
                            label: 'foo-hello',
                            insertText: 'foo-hello',
                            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
                        }],
                };
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['2'],
            provideCompletionItems(doc, pos, ctx) {
                requestCounts[1] += 1;
                if (ctx.triggerKind !== 1 /* CompletionTriggerKind.TriggerCharacter */) {
                    return;
                }
                return {
                    suggestions: [{
                            kind: 5 /* CompletionItemKind.Class */,
                            label: 'foo-210',
                            insertText: 'foo-210',
                            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
                        }],
                };
            },
        }));
        return withOracle(async function (model, editor) {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('foo');
                editor.setSelection(new Selection(1, 4, 1, 4));
                model.trigger({ auto: false });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, false);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'foo-20');
                assert.strictEqual(event.completionModel.items[1].textLabel, 'foo-hello');
            });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: '-' });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: '2' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'foo-20');
                assert.strictEqual(event.completionModel.items[1].textLabel, 'foo-210');
                assert.deepStrictEqual(requestCounts, [1, 2]);
            });
        });
    });
    test('Set refilter-flag, keep triggerKind', function () {
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['.'],
            provideCompletionItems(doc, pos, ctx) {
                return {
                    suggestions: [{
                            label: doc.getWordUntilPosition(pos).word || 'hello',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'foofoo',
                            range: getDefaultSuggestRange(doc, pos)
                        }]
                };
            },
        }));
        return withOracle(async function (model, editor) {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('foo');
                editor.setSelection(new Selection(1, 4, 1, 4));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'o' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.triggerOptions.triggerCharacter, undefined);
                assert.strictEqual(event.triggerOptions.triggerKind, undefined);
                assert.strictEqual(event.completionModel.items.length, 1);
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: '.' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.triggerOptions.refilter, undefined);
                assert.strictEqual(event.triggerOptions.triggerCharacter, '.');
                assert.strictEqual(event.triggerOptions.triggerKind, 1 /* CompletionTriggerKind.TriggerCharacter */);
                assert.strictEqual(event.completionModel.items.length, 1);
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'h' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.triggerOptions.refilter, true);
                assert.strictEqual(event.triggerOptions.triggerCharacter, '.');
                assert.strictEqual(event.triggerOptions.triggerKind, 1 /* CompletionTriggerKind.TriggerCharacter */);
                assert.strictEqual(event.completionModel.items.length, 1);
            });
        });
    });
    test('Snippets gone from IntelliSense #173244', function () {
        const snippetProvider = {
            _debugDisplayName: 'test',
            provideCompletionItems(doc, pos, ctx) {
                return {
                    suggestions: [{
                            label: 'log',
                            kind: 28 /* CompletionItemKind.Snippet */,
                            insertText: 'log',
                            range: getDefaultSuggestRange(doc, pos)
                        }]
                };
            }
        };
        const old = setSnippetSuggestSupport(snippetProvider);
        disposables.add(toDisposable(() => {
            if (getSnippetSuggestSupport() === snippetProvider) {
                setSnippetSuggestSupport(old);
            }
        }));
        disposables.add(registry.register({ scheme: 'test' }, {
            _debugDisplayName: 'test',
            triggerCharacters: ['.'],
            provideCompletionItems(doc, pos, ctx) {
                return {
                    suggestions: [{
                            label: 'locals',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'locals',
                            range: getDefaultSuggestRange(doc, pos)
                        }],
                    incomplete: true
                };
            },
        }));
        return withOracle(async function (model, editor) {
            await assertEvent(model.onDidSuggest, () => {
                editor.setValue('');
                editor.setSelection(new Selection(1, 1, 1, 1));
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'l' });
            }, event => {
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.triggerOptions.triggerCharacter, undefined);
                assert.strictEqual(event.triggerOptions.triggerKind, undefined);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'locals');
                assert.strictEqual(event.completionModel.items[1].textLabel, 'log');
            });
            await assertEvent(model.onDidSuggest, () => {
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'o' });
            }, event => {
                assert.strictEqual(event.triggerOptions.triggerKind, 2 /* CompletionTriggerKind.TriggerForIncompleteCompletions */);
                assert.strictEqual(event.triggerOptions.auto, true);
                assert.strictEqual(event.completionModel.items.length, 2);
                assert.strictEqual(event.completionModel.items[0].textLabel, 'locals');
                assert.strictEqual(event.completionModel.items[1].textLabel, 'log');
            });
        });
    });
    test('offWhenInlineCompletions - allows quick suggest when inline provider returns empty results', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        // Register a dummy inline completions provider that returns no items
        const inlineProvider = {
            provideInlineCompletions: () => ({ items: [] }),
            disposeInlineCompletions: () => { }
        };
        disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: 'test' }, inlineProvider));
        return withOracle((suggestOracle, editor) => {
            editor.updateOptions({ quickSuggestions: { comments: 'off', strings: 'off', other: 'offWhenInlineCompletions' } });
            // Without an InlineCompletionsController, the fallback triggers immediately
            return assertEvent(suggestOracle.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 4 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            }, suggestEvent => {
                assert.strictEqual(suggestEvent.triggerOptions.auto, true);
            });
        });
    });
    test('offWhenInlineCompletions - allows quick suggest when no inline provider exists', function () {
        disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
        // No inline completions provider registered for 'test' scheme
        return withOracle((suggestOracle, editor) => {
            editor.updateOptions({ quickSuggestions: { comments: 'off', strings: 'off', other: 'offWhenInlineCompletions' } });
            return assertEvent(suggestOracle.onDidSuggest, () => {
                editor.setPosition({ lineNumber: 1, column: 4 });
                editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            }, suggestEvent => {
                assert.strictEqual(suggestEvent.triggerOptions.auto, true);
                assert.strictEqual(suggestEvent.completionModel.items.length, 1);
            });
        });
    });
    test('offWhenInlineCompletions - allows quick suggest when inlineSuggest is disabled', function () {
        return runWithFakedTimers({ useFakeTimers: true }, () => {
            disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
            // Register a dummy inline completions provider
            const inlineProvider = {
                provideInlineCompletions: () => ({ items: [] }),
                disposeInlineCompletions: () => { }
            };
            disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: 'test' }, inlineProvider));
            return withOracle((suggestOracle, editor) => {
                editor.updateOptions({
                    quickSuggestions: { comments: 'off', strings: 'off', other: 'offWhenInlineCompletions' },
                    inlineSuggest: { enabled: false }
                });
                return assertEvent(suggestOracle.onDidSuggest, () => {
                    editor.setPosition({ lineNumber: 1, column: 4 });
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
                }, suggestEvent => {
                    assert.strictEqual(suggestEvent.triggerOptions.auto, true);
                    assert.strictEqual(suggestEvent.completionModel.items.length, 1);
                });
            });
        });
    });
    test('string shorthand - "off" disables quick suggestions for all token types', function () {
        return runWithFakedTimers({ useFakeTimers: true }, () => {
            disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
            return withOracle((suggestOracle, editor) => {
                // Use string shorthand instead of object form
                editor.updateOptions({ quickSuggestions: 'off' });
                return new Promise((resolve, reject) => {
                    const sub = suggestOracle.onDidSuggest(() => {
                        sub.dispose();
                        reject(new Error('Quick suggestions should have been suppressed by string shorthand "off"'));
                    });
                    editor.setPosition({ lineNumber: 1, column: 4 });
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
                    setTimeout(() => {
                        sub.dispose();
                        resolve();
                    }, 200);
                });
            });
        });
    });
    test('string shorthand - "offWhenInlineCompletions" allows quick suggest when inline provider returns empty', function () {
        return runWithFakedTimers({ useFakeTimers: true }, () => {
            disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));
            const inlineProvider = {
                provideInlineCompletions: () => ({ items: [] }),
                disposeInlineCompletions: () => { }
            };
            disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: 'test' }, inlineProvider));
            return withOracle((suggestOracle, editor) => {
                // Use string shorthand - applies to all token types
                editor.updateOptions({ quickSuggestions: 'offWhenInlineCompletions' });
                // Without InlineCompletionsController, the fallback triggers immediately
                return assertEvent(suggestOracle.onDidSuggest, () => {
                    editor.setPosition({ lineNumber: 1, column: 4 });
                    editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
                }, suggestEvent => {
                    assert.strictEqual(suggestEvent.triggerOptions.auto, true);
                });
            });
        });
    });
});
suite('SuggestModel - offWhenInlineCompletions with InlineCompletionsController', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    const completionProvider = {
        _debugDisplayName: 'test',
        provideCompletionItems(doc, pos) {
            const wordUntil = doc.getWordUntilPosition(pos);
            return {
                incomplete: false,
                suggestions: [{
                        label: doc.getWordUntilPosition(pos).word,
                        kind: 9 /* CompletionItemKind.Property */,
                        insertText: 'foofoo',
                        range: new Range(pos.lineNumber, wordUntil.startColumn, pos.lineNumber, wordUntil.endColumn)
                    }]
            };
        }
    };
    async function withSuggestModelAndInlineCompletions(text, inlineProvider, callback) {
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const disposableStore = new DisposableStore();
            try {
                const languageFeaturesService = new LanguageFeaturesService();
                disposableStore.add(languageFeaturesService.completionProvider.register({ pattern: '**' }, completionProvider));
                disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, inlineProvider));
                const serviceCollection = new ServiceCollection([ILanguageFeaturesService, languageFeaturesService], [ITelemetryService, NullTelemetryService], [ILogService, new NullLogService()], [IStorageService, disposableStore.add(new InMemoryStorageService())], [IKeybindingService, new MockKeybindingService()], [IEditorWorkerService, new class extends mock() {
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
                    }], [IAccessibilitySignalService, new class extends mock() {
                        async playSignal() { }
                        isSoundEnabled() { return false; }
                    }], [IDefaultAccountService, new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.onDidChangeDefaultAccount = Event.None;
                            this.getDefaultAccount = async () => null;
                            this.setDefaultAccountProvider = () => { };
                        }
                    }]);
                await withAsyncTestCodeEditor(text, { serviceCollection }, async (editor, _editorViewModel, instantiationService) => {
                    instantiationService.stubInstance(InlineSuggestionsView, {
                        dispose: () => { }
                    });
                    editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
                    editor.registerAndInstantiateContribution(InlineCompletionsController.ID, InlineCompletionsController);
                    editor.hasWidgetFocus = () => true;
                    editor.updateOptions({
                        quickSuggestions: { comments: 'off', strings: 'off', other: 'offWhenInlineCompletions' },
                    });
                    const suggestModel = disposableStore.add(editor.invokeWithinContext(accessor => accessor.get(IInstantiationService).createInstance(SuggestModel, editor)));
                    await callback(suggestModel, editor);
                });
            }
            finally {
                disposableStore.dispose();
                ModifierKeyEmitter.disposeInstance();
            }
        });
    }
    test('suppresses quick suggest when inline completions are showing ghost text', async function () {
        const inlineProvider = {
            provideInlineCompletions: (model, pos) => {
                // Return a completion that extends the current word - must be visible at cursor
                const word = model.getWordAtPosition(pos);
                if (!word) {
                    return { items: [] };
                }
                return {
                    items: [{
                            insertText: word.word + 'Suffix',
                            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn),
                        }]
                };
            },
            disposeInlineCompletions: () => { }
        };
        await withSuggestModelAndInlineCompletions('abc def', inlineProvider, async (suggestModel, editor) => {
            let didSuggest = false;
            const sub = suggestModel.onDidSuggest(() => { didSuggest = true; });
            editor.setPosition({ lineNumber: 1, column: 4 });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            await timeout(200);
            sub.dispose();
            assert.strictEqual(didSuggest, false, 'Quick suggestions should have been suppressed when inline completions are showing');
        });
    });
    test('allows quick suggest when inline completions resolve with no results', async function () {
        const inlineProvider = {
            provideInlineCompletions: () => ({ items: [] }),
            disposeInlineCompletions: () => { }
        };
        await withSuggestModelAndInlineCompletions('abc def', inlineProvider, async (suggestModel, editor) => {
            let didSuggest = false;
            const sub = suggestModel.onDidSuggest(e => {
                didSuggest = true;
                assert.strictEqual(e.triggerOptions.auto, true);
            });
            editor.setPosition({ lineNumber: 1, column: 4 });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            await timeout(200);
            sub.dispose();
            assert.strictEqual(didSuggest, true, 'Quick suggestions should have been triggered after inline completions resolved empty');
        });
    });
    test('allows quick suggest when inlineSuggest is disabled even with provider', async function () {
        const inlineProvider = {
            provideInlineCompletions: (model, pos) => {
                const word = model.getWordAtPosition(pos);
                if (!word) {
                    return { items: [] };
                }
                return {
                    items: [{
                            insertText: word.word + 'Suffix',
                            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn),
                        }]
                };
            },
            disposeInlineCompletions: () => { }
        };
        await withSuggestModelAndInlineCompletions('abc def', inlineProvider, async (suggestModel, editor) => {
            editor.updateOptions({ inlineSuggest: { enabled: false } });
            let didSuggest = false;
            const sub = suggestModel.onDidSuggest(e => {
                didSuggest = true;
                assert.strictEqual(e.triggerOptions.auto, true);
            });
            editor.setPosition({ lineNumber: 1, column: 4 });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'd' });
            await timeout(200);
            sub.dispose();
            assert.strictEqual(didSuggest, true, 'Quick suggestions should have been triggered when inlineSuggest is disabled');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdE1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci9zdWdnZXN0TW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJakUsT0FBTyxFQUFxRix5QkFBeUIsRUFBcUMsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV4TixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFD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