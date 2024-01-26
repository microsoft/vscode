/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { CompletionItemKind, CompletionItemProvider, CompletionList, CompletionTriggerKind, EncodedTokenizationResult, IState, TokenizationRegistry } from 'vs/editor/common/languages';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/browser/suggestMemory';
import { LineContext, SuggestModel } from 'vs/editor/contrib/suggest/browser/suggestModel';
import { ISelectedSuggestion } from 'vs/editor/contrib/suggest/browser/suggestWidget';
import { createTestCodeEditor, ITestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createModelServices, createTextModel, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILabelService } from 'vs/platform/label/common/label';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getSnippetSuggestSupport, setSnippetSuggestSupport } from 'vs/editor/contrib/suggest/browser/suggest';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


function createMockEditor(model: TextModel, languageFeaturesService: ILanguageFeaturesService): ITestCodeEditor {

	const storeService = new InMemoryStorageService();
	const editor = createTestCodeEditor(model, {
		serviceCollection: new ServiceCollection(
			[ILanguageFeaturesService, languageFeaturesService],
			[ITelemetryService, NullTelemetryService],
			[IStorageService, storeService],
			[IKeybindingService, new MockKeybindingService()],
			[ISuggestMemoryService, new class implements ISuggestMemoryService {
				declare readonly _serviceBrand: undefined;
				memorize(): void {
				}
				select(): number {
					return -1;
				}
			}],
			[ILabelService, new class extends mock<ILabelService>() { }],
			[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { }],
			[IEnvironmentService, new class extends mock<IEnvironmentService>() {
				override isBuilt: boolean = true;
				override isExtensionDevelopment: boolean = false;
			}],
		),
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

	class OuterMode extends Disposable {
		public readonly languageId = OUTER_LANGUAGE_ID;
		constructor(
			@ILanguageService languageService: ILanguageService,
			@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		) {
			super();
			this._register(languageService.registerLanguage({ id: this.languageId }));
			this._register(languageConfigurationService.register(this.languageId, {}));

			this._register(TokenizationRegistry.register(this.languageId, {
				getInitialState: (): IState => NullState,
				tokenize: undefined!,
				tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
					const tokensArr: number[] = [];
					let prevLanguageId: string | undefined = undefined;
					for (let i = 0; i < line.length; i++) {
						const languageId = (line.charAt(i) === 'x' ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID);
						const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
						if (prevLanguageId !== languageId) {
							tokensArr.push(i);
							tokensArr.push((encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET));
						}
						prevLanguageId = languageId;
					}

					const tokens = new Uint32Array(tokensArr.length);
					for (let i = 0; i < tokens.length; i++) {
						tokens[i] = tokensArr[i];
					}
					return new EncodedTokenizationResult(tokens, state);
				}
			}));
		}
	}

	class InnerMode extends Disposable {
		public readonly languageId = INNER_LANGUAGE_ID;
		constructor(
			@ILanguageService languageService: ILanguageService,
			@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService
		) {
			super();
			this._register(languageService.registerLanguage({ id: this.languageId }));
			this._register(languageConfigurationService.register(this.languageId, {}));
		}
	}

	const assertAutoTrigger = (model: TextModel, offset: number, expected: boolean, message?: string): void => {
		const pos = model.getPositionAt(offset);
		const editor = createMockEditor(model, new LanguageFeaturesService());
		editor.setPosition(pos);
		assert.strictEqual(LineContext.shouldAutoTrigger(editor), expected, message);
		editor.dispose();
	};

	let disposables: DisposableStore;

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


	function getDefaultSuggestRange(model: ITextModel, position: Position) {
		const wordUntil = model.getWordUntilPosition(position);
		return new Range(position.lineNumber, wordUntil.startColumn, position.lineNumber, wordUntil.endColumn);
	}

	const alwaysEmptySupport: CompletionItemProvider = {
		_debugDisplayName: 'test',
		provideCompletionItems(doc, pos): CompletionList {
			return {
				incomplete: false,
				suggestions: []
			};
		}
	};

	const alwaysSomethingSupport: CompletionItemProvider = {
		_debugDisplayName: 'test',
		provideCompletionItems(doc, pos): CompletionList {
			return {
				incomplete: false,
				suggestions: [{
					label: doc.getWordUntilPosition(pos).word,
					kind: CompletionItemKind.Property,
					insertText: 'foofoo',
					range: getDefaultSuggestRange(doc, pos)
				}]
			};
		}
	};

	let disposables: DisposableStore;
	let model: TextModel;
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

	function withOracle(callback: (model: SuggestModel, editor: ITestCodeEditor) => any): Promise<any> {

		return new Promise((resolve, reject) => {
			const editor = createMockEditor(model, languageFeaturesService);
			const oracle = editor.invokeWithinContext(accessor => accessor.get(IInstantiationService).createInstance(SuggestModel, editor));
			disposables.add(oracle);
			disposables.add(editor);

			try {
				resolve(callback(oracle, editor));
			} catch (err) {
				reject(err);
			}
		});
	}

	function assertEvent<E>(event: Event<E>, action: () => any, assert: (e: E) => any) {
		return new Promise((resolve, reject) => {
			const sub = event(e => {
				sub.dispose();
				try {
					resolve(assert(e));
				} catch (err) {
					reject(err);
				}
			});
			try {
				action();
			} catch (err) {
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
				editor.trigger('keyboard', Handler.Type, { text: 'd' });

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
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: false,
					suggestions: [{
						label: 'My Table',
						kind: CompletionItemKind.Property,
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
					editor.trigger('keyboard', Handler.Type, { text: 'My' });

				}, event => {
					assert.strictEqual(event.triggerOptions.auto, true);
					assert.strictEqual(event.completionModel.items.length, 1);
					const [first] = event.completionModel.items;
					assert.strictEqual(first.completion.label, 'My Table');

					return assertEvent(model.onDidSuggest, () => {
						editor.setPosition({ lineNumber: 1, column: 3 });
						editor.trigger('keyboard', Handler.Type, { text: ' ' });

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
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: false,
					suggestions: [{
						label: 'foo.bar',
						kind: CompletionItemKind.Property,
						insertText: 'foo.bar',
						range: Range.fromPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		disposables.add(registry.register({ scheme: 'test' }, {
			_debugDisplayName: 'test',
			triggerCharacters: ['.'],
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: false,
					suggestions: [{
						label: 'boom',
						kind: CompletionItemKind.Property,
						insertText: 'boom',
						range: Range.fromPositions(
							pos.delta(0, doc.getLineContent(pos.lineNumber)[pos.column - 2] === '.' ? 0 : -1),
							pos
						)
					}]
				};
			}
		}));

		model.setValue('');

		return withOracle(async (model, editor) => {

			await assertEvent(model.onDidSuggest, () => {
				editor.setPosition({ lineNumber: 1, column: 1 });
				editor.trigger('keyboard', Handler.Type, { text: 'foo' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 1);
				const [first] = event.completionModel.items;
				assert.strictEqual(first.completion.label, 'foo.bar');

			});

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: '.' });

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

			editor.getModel()!.setValue('fo');
			editor.setPosition({ lineNumber: 1, column: 3 });

			return assertEvent(model.onDidSuggest, () => {
				model.trigger({ auto: false });
			}, event => {
				assert.strictEqual(event.triggerOptions.auto, false);
				assert.strictEqual(event.isFrozen, false);
				assert.strictEqual(event.completionModel.items.length, 1);

				return assertEvent(model.onDidCancel, () => {
					editor.trigger('keyboard', Handler.Type, { text: '+' });
				}, event => {
					assert.strictEqual(event.retrigger, false);
				});
			});
		});
	});

	test('Intellisense Completion doesn\'t respect space after equal sign (.html file), #29353 [2/2]', function () {

		disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));

		return withOracle((model, editor) => {

			editor.getModel()!.setValue('fo');
			editor.setPosition({ lineNumber: 1, column: 3 });

			return assertEvent(model.onDidSuggest, () => {
				model.trigger({ auto: false });
			}, event => {
				assert.strictEqual(event.triggerOptions.auto, false);
				assert.strictEqual(event.isFrozen, false);
				assert.strictEqual(event.completionModel.items.length, 1);

				return assertEvent(model.onDidCancel, () => {
					editor.trigger('keyboard', Handler.Type, { text: ' ' });
				}, event => {
					assert.strictEqual(event.retrigger, false);
				});
			});
		});
	});

	test('Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (1/2)', function () {

		disposables.add(registry.register({ scheme: 'test' }, {
			_debugDisplayName: 'test',
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: true,
					suggestions: [{
						label: 'foo',
						kind: CompletionItemKind.Property,
						insertText: 'foo',
						range: Range.fromPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		return withOracle((model, editor) => {

			editor.getModel()!.setValue('foo');
			editor.setPosition({ lineNumber: 1, column: 4 });

			return assertEvent(model.onDidSuggest, () => {
				model.trigger({ auto: false });
			}, event => {
				assert.strictEqual(event.triggerOptions.auto, false);
				assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
				assert.strictEqual(event.completionModel.items.length, 1);

				return assertEvent(model.onDidCancel, () => {
					editor.trigger('keyboard', Handler.Type, { text: ';' });
				}, event => {
					assert.strictEqual(event.retrigger, false);
				});
			});
		});
	});

	test('Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (2/2)', function () {

		disposables.add(registry.register({ scheme: 'test' }, {
			_debugDisplayName: 'test',
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: true,
					suggestions: [{
						label: 'foo;',
						kind: CompletionItemKind.Property,
						insertText: 'foo',
						range: Range.fromPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		return withOracle((model, editor) => {

			editor.getModel()!.setValue('foo');
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
					editor.trigger('keyboard', Handler.Type, { text: ';' });
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
			provideCompletionItems(doc, pos, context): CompletionList {
				assert.strictEqual(context.triggerKind, CompletionTriggerKind.TriggerCharacter);
				triggerCharacter = context.triggerCharacter!;
				return {
					incomplete: false,
					suggestions: [
						{
							label: 'foo.bar',
							kind: CompletionItemKind.Property,
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
				editor.trigger('keyboard', Handler.Type, { text: 'foo.' });
			}, event => {
				assert.strictEqual(triggerCharacter, '.');
			});
		});
	});

	test('Mac press and hold accent character insertion does not update suggestions, #35269', function () {
		disposables.add(registry.register({ scheme: 'test' }, {
			_debugDisplayName: 'test',
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: true,
					suggestions: [{
						label: 'abc',
						kind: CompletionItemKind.Property,
						insertText: 'abc',
						range: Range.fromPositions(pos.with(undefined, 1), pos)
					}, {
						label: 'äbc',
						kind: CompletionItemKind.Property,
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
				editor.trigger('keyboard', Handler.Type, { text: 'a' });
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
				editor.trigger('keyboard', Handler.Type, { text: 'd' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 1);
				const [first] = event.completionModel.items;

				assert.strictEqual(first.provider, alwaysSomethingSupport);
			});

			await assertEvent(model.onDidSuggest, () => {
				CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);

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
			provideCompletionItems(doc, pos): CompletionList {
				return {
					incomplete: true,
					suggestions: [{
						label: 'bar',
						kind: CompletionItemKind.Property,
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
				_insertSuggestion_publicForTest(item: ISelectedSuggestion, flags: number = 0) {
					super._insertSuggestion(item, flags);
				}
			}
			const ctrl = <TestCtrl>editor.registerAndInstantiateContribution(TestCtrl.ID, TestCtrl);
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

			assert.strictEqual(
				model.getValue(),
				'bar; import { foo, bar } from "./b"'
			);
		});
	});

	test('Completion unexpectedly triggers on second keypress of an edit group in a snippet #43523', function () {

		disposables.add(registry.register({ scheme: 'test' }, alwaysSomethingSupport));

		return withOracle((model, editor) => {
			return assertEvent(model.onDidSuggest, () => {
				editor.setValue('d');
				editor.setSelection(new Selection(1, 1, 1, 2));
				editor.trigger('keyboard', Handler.Type, { text: 'e' });

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
						kind: CompletionItemKind.Folder,
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
						kind: CompletionItemKind.Folder,
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
				editor.trigger('keyboard', Handler.Type, { text: 'c' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 2);
				assert.strictEqual(disposeA, 0);
				assert.strictEqual(disposeB, 0);
			});

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: 'o' });
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
						kind: CompletionItemKind.Class,
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
						kind: CompletionItemKind.Folder,
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
				editor.trigger('keyboard', Handler.Type, { text: 'Z' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 1);
				assert.strictEqual(event.completionModel.items[0].textLabel, 'Z aaa');
			});

			await assertEvent(model.onDidSuggest, () => {
				// started another word: Z a|
				// item should be: Z aaa, aaa
				editor.trigger('keyboard', Handler.Type, { text: ' a' });
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
						kind: CompletionItemKind.Class,
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
						kind: CompletionItemKind.Class,
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
				editor.trigger('keyboard', Handler.Type, { text: '.' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 1);
			});


			editor.getModel().setValue('');

			await assertEvent(model.onDidSuggest, () => {
				editor.setValue('');
				editor.setSelection(new Selection(1, 1, 1, 1));
				editor.trigger('keyboard', Handler.Type, { text: 'a' });

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
						kind: CompletionItemKind.Text,
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
						kind: CompletionItemKind.Class,
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
				editor.trigger('keyboard', Handler.Type, { text: 't' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 1);
				assert.strictEqual(event.completionModel.items[0].textLabel, 'git.pull');
			});

			editor.trigger('keyboard', Handler.Type, { text: '.' });

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: 'p' });

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
						kind: CompletionItemKind.Text,
						label: 'foo-20',
						insertText: 'foo-20',
						range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
					}, {
						kind: CompletionItemKind.Text,
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
				if (ctx.triggerKind !== CompletionTriggerKind.TriggerCharacter) {
					return;
				}
				return {
					suggestions: [{
						kind: CompletionItemKind.Class,
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

			editor.trigger('keyboard', Handler.Type, { text: '-' });


			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: '2' });

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
						kind: CompletionItemKind.Property,
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
				editor.trigger('keyboard', Handler.Type, { text: 'o' });


			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.triggerOptions.triggerCharacter, undefined);
				assert.strictEqual(event.triggerOptions.triggerKind, undefined);
				assert.strictEqual(event.completionModel.items.length, 1);
			});

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: '.' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.triggerOptions.refilter, undefined);
				assert.strictEqual(event.triggerOptions.triggerCharacter, '.');
				assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerCharacter);
				assert.strictEqual(event.completionModel.items.length, 1);
			});

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: 'h' });

			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.triggerOptions.refilter, true);
				assert.strictEqual(event.triggerOptions.triggerCharacter, '.');
				assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerCharacter);
				assert.strictEqual(event.completionModel.items.length, 1);
			});
		});
	});

	test('Snippets gone from IntelliSense #173244', function () {

		const snippetProvider: CompletionItemProvider = {
			_debugDisplayName: 'test',
			provideCompletionItems(doc, pos, ctx) {
				return {
					suggestions: [{
						label: 'log',
						kind: CompletionItemKind.Snippet,
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
						kind: CompletionItemKind.Property,
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
				editor.trigger('keyboard', Handler.Type, { text: 'l' });


			}, event => {
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.triggerOptions.triggerCharacter, undefined);
				assert.strictEqual(event.triggerOptions.triggerKind, undefined);
				assert.strictEqual(event.completionModel.items.length, 2);
				assert.strictEqual(event.completionModel.items[0].textLabel, 'locals');
				assert.strictEqual(event.completionModel.items[1].textLabel, 'log');
			});

			await assertEvent(model.onDidSuggest, () => {
				editor.trigger('keyboard', Handler.Type, { text: 'o' });

			}, event => {
				assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerForIncompleteCompletions);
				assert.strictEqual(event.triggerOptions.auto, true);
				assert.strictEqual(event.completionModel.items.length, 2);
				assert.strictEqual(event.completionModel.items[0].textLabel, 'locals');
				assert.strictEqual(event.completionModel.items[1].textLabel, 'log');
			});

		});
	});
});
