/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { ModesRegistry } from 'vs/editor/common/languages/modesRegistry';
import { LanguageConfigurationRegistry } from 'vs/editor/common/languages/languageConfigurationRegistry';

suite('CodeEditorWidget', () => {

	test('onDidChangeModelDecorations', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelDecorations((e) => {
				invoked = true;
			}));

			viewModel.model.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: 'test' } }]);

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelLanguage', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();
			disposables.add(ModesRegistry.registerLanguage({ id: 'testMode' }));

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguage((e) => {
				invoked = true;
			}));

			viewModel.model.setMode('testMode');

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelLanguageConfiguration', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			disposables.add(ModesRegistry.registerLanguage({ id: 'testMode' }));
			viewModel.model.setMode('testMode');

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguageConfiguration((e) => {
				invoked = true;
			}));

			disposables.add(LanguageConfigurationRegistry.register('testMode', {
				brackets: [['(', ')']]
			}));

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelContent', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelContent((e) => {
				invoked = true;
			}));

			viewModel.type('hello', 'test');

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelOptions', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelOptions((e) => {
				invoked = true;
			}));

			viewModel.model.updateOptions({
				tabSize: 3
			});

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('issue #145872 - Model change events are emitted before the selection updates', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let observedSelection: Selection | null = null;
			disposables.add(editor.onDidChangeModelContent((e) => {
				observedSelection = editor.getSelection();
			}));

			viewModel.type('hello', 'test');

			assert.deepStrictEqual(observedSelection, new Selection(1, 6, 1, 6));

			disposables.dispose();
		});
	});

	test('monaco-editor issue #2774 - Wrong order of events onDidChangeModelContent and onDidChangeCursorSelection on redo', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');
			viewModel.model.undo();
			viewModel.model.redo();

			assert.deepStrictEqual(calls, [
				'contentchange(a, 0, 0)',
				'cursorchange(1, 2)',
				'contentchange(, 0, 1)',
				'cursorchange(1, 1)',
				'contentchange(a, 0, 0)',
				'cursorchange(1, 2)'
			]);

			disposables.dispose();
		});
	});

});
