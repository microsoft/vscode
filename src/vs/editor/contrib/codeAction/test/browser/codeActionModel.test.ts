/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promiseWithResolvers } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import * as languages from 'vs/editor/common/languages';
import { TextModel } from 'vs/editor/common/model/textModel';
import { CodeActionModel, CodeActionsState } from 'vs/editor/contrib/codeAction/browser/codeActionModel';
import { createTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { MarkerService } from 'vs/platform/markers/common/markerService';

const testProvider = {
	provideCodeActions(): languages.CodeActionList {
		return {
			actions: [
				{ title: 'test', command: { id: 'test-command', title: 'test', arguments: [] } }
			],
			dispose() { /* noop*/ }
		};
	}
};

suite('CodeActionModel', () => {

	const languageId = 'foo-lang';
	const uri = URI.parse('untitled:path');
	let model: TextModel;
	let markerService: MarkerService;
	let editor: ICodeEditor;
	let registry: LanguageFeatureRegistry<languages.CodeActionProvider>;
	const disposables = new DisposableStore();

	setup(() => {
		disposables.clear();
		markerService = new MarkerService();
		model = createTextModel('foobar  foo bar\nfarboo far boo', languageId, undefined, uri);
		editor = createTestCodeEditor(model);
		editor.setPosition({ lineNumber: 1, column: 1 });
		registry = new LanguageFeatureRegistry();
	});

	teardown(() => {
		disposables.clear();
		editor.dispose();
		model.dispose();
		markerService.dispose();
	});

	test('Oracle -> marker added', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		await runWithFakedTimers({ useFakeTimers: true }, () => {
			const reg = registry.register(languageId, testProvider);
			disposables.add(reg);

			const contextKeys = new MockContextKeyService();
			const model = disposables.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
			disposables.add(model.onDidChangeState((e: CodeActionsState.State) => {
				assertType(e.type === CodeActionsState.Type.Triggered);

				assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
				assert.ok(e.actions);

				e.actions.then(fixes => {
					model.dispose();
					assert.strictEqual(fixes.validActions.length, 1);
					done();
				}, done);
			}));

			// start here
			markerService.changeOne('fake', uri, [{
				startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
				message: 'error',
				severity: 1,
				code: '',
				source: ''
			}]);
			return donePromise;
		});
	});

	test('Oracle -> position changed', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, () => {
			const reg = registry.register(languageId, testProvider);
			disposables.add(reg);

			markerService.changeOne('fake', uri, [{
				startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
				message: 'error',
				severity: 1,
				code: '',
				source: ''
			}]);

			editor.setPosition({ lineNumber: 2, column: 1 });

			return new Promise((resolve, reject) => {
				const contextKeys = new MockContextKeyService();
				const model = disposables.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
				disposables.add(model.onDidChangeState((e: CodeActionsState.State) => {
					assertType(e.type === CodeActionsState.Type.Triggered);

					assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
					assert.ok(e.actions);
					e.actions.then(fixes => {
						model.dispose();
						assert.strictEqual(fixes.validActions.length, 1);
						resolve(undefined);
					}, reject);
				}));
				// start here
				editor.setPosition({ lineNumber: 1, column: 1 });
			});
		});
	});

	test('Oracle -> should only auto trigger once for cursor and marker update right after each other', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();
		await runWithFakedTimers({ useFakeTimers: true }, () => {
			const reg = registry.register(languageId, testProvider);
			disposables.add(reg);

			let triggerCount = 0;
			const contextKeys = new MockContextKeyService();
			const model = disposables.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
			disposables.add(model.onDidChangeState((e: CodeActionsState.State) => {
				assertType(e.type === CodeActionsState.Type.Triggered);

				assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
				++triggerCount;

				// give time for second trigger before completing test
				setTimeout(() => {
					model.dispose();
					assert.strictEqual(triggerCount, 1);
					done();
				}, 0);
			}, 5 /*delay*/));

			markerService.changeOne('fake', uri, [{
				startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
				message: 'error',
				severity: 1,
				code: '',
				source: ''
			}]);

			editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 });

			return donePromise;
		});
	});
});
