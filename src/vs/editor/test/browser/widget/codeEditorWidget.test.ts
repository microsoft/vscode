/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { withTestCodeEditor } from '../testCodeEditor.js';

suite('CodeEditorWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageService);
			const disposables = new DisposableStore();
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguage((e) => {
				invoked = true;
			}));

			viewModel.model.setLanguage('testMode');

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelLanguageConfiguration', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const languageService = instantiationService.get(ILanguageService);
			const disposables = new DisposableStore();
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));
			viewModel.model.setLanguage('testMode');

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguageConfiguration((e) => {
				invoked = true;
			}));

			disposables.add(languageConfigurationService.register('testMode', {
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

	test('issue #146174: Events delivered out of order when adding decorations in content change listener (1 of 2)', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener1 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener2 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');

			assert.deepStrictEqual(calls, ([
				'listener1 - contentchange(a, 0, 0)',
				'listener2 - contentchange(a, 0, 0)',
				'listener1 - cursorchange(1, 2)',
				'listener2 - cursorchange(1, 2)',
			]));

			disposables.dispose();
		});
	});

	test('issue #146174: Events delivered out of order when adding decorations in content change listener (2 of 2)', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener1 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
				editor.changeDecorations((changeAccessor) => {
					changeAccessor.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: 'test' } }]);
				});
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener2 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');

			assert.deepStrictEqual(calls, ([
				'listener1 - contentchange(a, 0, 0)',
				'listener2 - contentchange(a, 0, 0)',
				'listener1 - cursorchange(1, 2)',
				'listener2 - cursorchange(1, 2)',
			]));

			disposables.dispose();
		});
	});

	test('getBottomForLineNumber should handle invalid line numbers gracefully', () => {
		withTestCodeEditor('line1\nline2\nline3', {}, (editor, viewModel) => {
			// Test with lineNumber greater than line count
			const result1 = editor.getBottomForLineNumber(100);
			assert.ok(result1 >= 0, 'Should return a valid position for out-of-bounds line number');

			// Test with lineNumber less than 1
			const result2 = editor.getBottomForLineNumber(0);
			assert.ok(result2 >= 0, 'Should return a valid position for line number 0');

			// Test with negative lineNumber
			const result3 = editor.getBottomForLineNumber(-5);
			assert.ok(result3 >= 0, 'Should return a valid position for negative line number');

			// Test with valid lineNumber should still work
			const result4 = editor.getBottomForLineNumber(2);
			assert.ok(result4 > 0, 'Should return a valid position for valid line number');
		});
	});

});
