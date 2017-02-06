/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Model } from 'vs/editor/common/model/model';
import { ICommonCodeEditor, Handler } from 'vs/editor/common/editorCommon';
import { ISuggestSupport, ISuggestResult, SuggestRegistry } from 'vs/editor/common/modes';
import { SuggestModel, LineContext } from 'vs/editor/contrib/suggest/common/suggestModel';
import { MockCodeEditor, MockScopeLocation } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';

function createMockEditor(model: Model): MockCodeEditor {
	const contextKeyService = new MockKeybindingService();
	const telemetryService = NullTelemetryService;
	const instantiationService = new InstantiationService(new ServiceCollection(
		[IContextKeyService, contextKeyService],
		[ITelemetryService, telemetryService]
	));

	const editor = new MockCodeEditor(new MockScopeLocation(), {}, instantiationService, contextKeyService);
	editor.setModel(model);
	return editor;
}

suite('SuggestModel - Context', function () {

	let model: Model;

	setup(function () {
		model = Model.createFromString('Das Pferd frisst keinen Gurkensalat - Philipp Reis 1861.\nWer hat\'s erfunden?');
	});

	teardown(function () {
		model.dispose();
	});

	test('Context - shouldAutoTrigger', function () {

		function assertAutoTrigger(offset: number, expected: boolean): void {
			const pos = model.getPositionAt(offset);
			const editor = createMockEditor(model);
			editor.setPosition(pos);
			assert.equal(LineContext.shouldAutoTrigger(editor), expected);
			editor.dispose();
		}

		assertAutoTrigger(3, true); // end of word, Das|
		assertAutoTrigger(4, false); // no word Das |
		assertAutoTrigger(1, false); // middle of word D|as
		assertAutoTrigger(55, false); // number, 1861|
	});

});

suite('SuggestModel - TriggerAndCancelOracle', function () {


	const alwaysEmptySupport: ISuggestSupport = {
		triggerCharacters: [],
		provideCompletionItems(doc, pos) {
			return <ISuggestResult>{
				incomplete: false,
				suggestions: []
			};
		}
	};

	const alwaysSomethingSupport: ISuggestSupport = {
		triggerCharacters: [],
		provideCompletionItems(doc, pos) {
			return <ISuggestResult>{
				currentWord: '',
				incomplete: false,
				suggestions: [{
					label: doc.getWordUntilPosition(pos).word,
					type: 'property',
					insertText: 'foofoo'
				}]
			};
		}
	};

	let disposables: IDisposable[] = [];
	let model: Model;

	setup(function () {
		disposables = dispose(disposables);
		model = Model.createFromString('abc def', undefined, undefined, URI.parse('test:somefile.ttt'));
		disposables.push(model);
	});

	function withOracle(callback: (model: SuggestModel, editor: ICommonCodeEditor) => any): TPromise<any> {

		return new TPromise((resolve, reject) => {
			const editor = createMockEditor(model);
			const oracle = new SuggestModel(editor);
			disposables.push(oracle, editor);

			try {
				resolve(callback(oracle, editor));
			} catch (err) {
				reject(err);
			}
		});
	}

	function assertEvent<E>(event: Event<E>, action: () => any, assert: (e: E) => any) {
		return new TPromise((resolve, reject) => {
			event(e => {
				try {
					resolve(assert(e));
				} catch (err) {
					reject(err);
				}
			});
			try {
				action();
			} catch (err) {
				reject(err);
			}
		});
	}

	test('events - cancel/trigger', function () {
		return withOracle(model => {

			return TPromise.join([
				assertEvent(model.onDidCancel, function () {
					model.cancel();
				}, function (event) {
					assert.equal(event.retrigger, false);
				}),

				assertEvent(model.onDidCancel, function () {
					model.cancel(true);
				}, function (event) {
					assert.equal(event.retrigger, true);
				}),

				// cancel on trigger
				assertEvent(model.onDidCancel, function () {
					model.trigger(false);
				}, function (event) {
					assert.equal(event.retrigger, false);
				}),

				assertEvent(model.onDidCancel, function () {
					model.trigger(false, true);
				}, function (event) {
					assert.equal(event.retrigger, true);
				}),

				assertEvent(model.onDidTrigger, function () {
					model.trigger(true);
				}, function (event) {
					assert.equal(event.auto, true);
				}),

				assertEvent(model.onDidTrigger, function () {
					model.trigger(false);
				}, function (event) {
					assert.equal(event.auto, false);
				})
			]);
		});
	});


	test('events - suggest/empty', function () {

		disposables.push(SuggestRegistry.register({ scheme: 'test' }, alwaysEmptySupport));

		return withOracle(model => {
			return TPromise.join([
				assertEvent(model.onDidSuggest, function () {
					model.trigger(true);
				}, function (event) {
					assert.equal(event.auto, true);
					assert.equal(event.isFrozen, false);
					assert.equal(event.completionModel.items.length, 0);
				}),
				assertEvent(model.onDidSuggest, function () {
					model.trigger(false);
				}, function (event) {
					assert.equal(event.auto, false);
					assert.equal(event.isFrozen, false);
					assert.equal(event.completionModel.items.length, 0);
				})
			]);
		});
	});

	test('trigger - on type', function () {

		disposables.push(SuggestRegistry.register({ scheme: 'test' }, alwaysSomethingSupport));

		return withOracle((model, editor) => {
			return assertEvent(model.onDidSuggest, () => {
				editor.setPosition({ lineNumber: 1, column: 4 });
				editor.trigger('keyboard', Handler.Type, { text: 'd' });

			}, event => {
				assert.equal(event.auto, true);
				assert.equal(event.completionModel.items.length, 1);
				const [first] = event.completionModel.items;

				assert.equal(first.support, alwaysSomethingSupport);
			});
		});
	});

	test('#17400: Keep filtering suggestModel.ts after space', function () {

		disposables.push(SuggestRegistry.register({ scheme: 'test' }, {
			triggerCharacters: [],
			provideCompletionItems(doc, pos) {
				return <ISuggestResult>{
					currentWord: '',
					incomplete: false,
					suggestions: [{
						label: 'My Table',
						type: 'property',
						insertText: 'My Table'
					}]
				};
			}
		}));

		model.setValue('');

		return withOracle((model, editor) => {

			return assertEvent(model.onDidSuggest, () => {
				editor.setPosition({ lineNumber: 1, column: 1 });
				editor.trigger('keyboard', Handler.Type, { text: 'My' });

			}, event => {
				assert.equal(event.auto, true);
				assert.equal(event.completionModel.items.length, 1);
				const [first] = event.completionModel.items;
				assert.equal(first.suggestion.label, 'My Table');

				return assertEvent(model.onDidSuggest, () => {
					editor.setPosition({ lineNumber: 1, column: 3 });
					editor.trigger('keyboard', Handler.Type, { text: ' ' });

				}, event => {
					assert.equal(event.auto, true);
					assert.equal(event.completionModel.items.length, 1);
					const [first] = event.completionModel.items;
					assert.equal(first.suggestion.label, 'My Table');
				});
			});
		});
	});
});
