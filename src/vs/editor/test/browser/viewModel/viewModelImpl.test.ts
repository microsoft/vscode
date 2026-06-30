/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EndOfLineSequence, PositionAffinity } from '../../../common/model.js';
import { ViewEventHandler } from '../../../common/viewEventHandler.js';
import { ViewEvent } from '../../../common/viewEvents.js';
import { testViewModel } from './testViewModel.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { createTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../testCodeEditor.js';

suite('ViewModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #21073: SplitLinesCollection: attempt to access a \'newer\' model', () => {
		const text = [''];
		const opts = {
			lineNumbersMinChars: 1
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineCount(), 1);

			viewModel.setViewport(1, 1, 1);

			model.applyEdits([{
				range: new Range(1, 1, 1, 1),
				text: [
					'line01',
					'line02',
					'line03',
					'line04',
					'line05',
					'line06',
					'line07',
					'line08',
					'line09',
					'line10',
				].join('\n')
			}]);

			assert.strictEqual(viewModel.getLineCount(), 10);
		});
	});

	test('issue #44805: SplitLinesCollection: attempt to access a \'newer\' model', () => {
		const text = [''];
		testViewModel(text, {}, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineCount(), 1);

			model.pushEditOperations([], [{
				range: new Range(1, 1, 1, 1),
				text: '\ninsert1'
			}], () => ([]));

			model.pushEditOperations([], [{
				range: new Range(1, 1, 1, 1),
				text: '\ninsert2'
			}], () => ([]));

			model.pushEditOperations([], [{
				range: new Range(1, 1, 1, 1),
				text: '\ninsert3'
			}], () => ([]));

			const viewLineCount: number[] = [];

			viewLineCount.push(viewModel.getLineCount());
			const eventHandler = new class extends ViewEventHandler {
				override handleEvents(events: ViewEvent[]): void {
					// Access the view model
					viewLineCount.push(viewModel.getLineCount());
				}
			};
			viewModel.addViewEventHandler(eventHandler);
			model.undo();
			viewLineCount.push(viewModel.getLineCount());

			assert.deepStrictEqual(viewLineCount, [4, 1, 1, 1, 1]);

			viewModel.removeViewEventHandler(eventHandler);
			eventHandler.dispose();
		});
	});

	test('view models react first to model changes', () => {
		const initialText = [
			'Hello',
			'world'
		];
		const disposables = new DisposableStore();

		const model = disposables.add(createTextModel(initialText.join('\n')));
		const instantiationService = createCodeEditorServices(disposables);
		const ed1 = disposables.add(instantiateTestCodeEditor(instantiationService, model));
		disposables.add(instantiateTestCodeEditor(instantiationService, model));

		// Add a nasty listener which modifies the model during the model change event
		let isFirst = true;
		disposables.add(ed1.onDidChangeModelContent((e) => {
			if (isFirst) {
				isFirst = false;
				// delete the \n
				model.applyEdits([{ range: new Range(1, 6, 2, 1), text: '' }]);
			}
		}));

		model.applyEdits([{ range: new Range(2, 6, 2, 6), text: '!' }]);

		disposables.dispose();
	});

	test('issue #44805: No visible lines via API call', () => {
		const text = [
			'line1',
			'line2',
			'line3'
		];
		testViewModel(text, {}, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineCount(), 3);
			viewModel.setHiddenAreas([new Range(1, 1, 3, 1)]);
			assert.ok(viewModel.getVisibleRanges() !== null);
		});
	});

	test('issue #44805: No visible lines via undoing', () => {
		const text = [
			''
		];
		testViewModel(text, {}, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineCount(), 1);

			model.pushEditOperations([], [{
				range: new Range(1, 1, 1, 1),
				text: 'line1\nline2\nline3'
			}], () => ([]));

			viewModel.setHiddenAreas([new Range(1, 1, 1, 1)]);
			assert.strictEqual(viewModel.getLineCount(), 2);

			model.undo();
			assert.ok(viewModel.getVisibleRanges() !== null);
		});
	});

	function assertGetPlainTextToCopy(text: string[], ranges: Range[], emptySelectionClipboard: boolean, expected: string | string[]): void {
		testViewModel(text, {}, (viewModel, model) => {
			const actual = viewModel.getPlainTextToCopy(ranges, emptySelectionClipboard, false);
			assert.deepStrictEqual(actual.sourceText, expected);
		});
	}

	const USUAL_TEXT = [
		'',
		'line2',
		'line3',
		'line4',
		''
	];

	test('getPlainTextToCopy 0/1', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 2)
			],
			false,
			''
		);
	});

	test('getPlainTextToCopy 0/1 - emptySelectionClipboard', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 2)
			],
			true,
			'line2\n'
		);
	});

	test('getPlainTextToCopy 1/1', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 6)
			],
			false,
			'ine2'
		);
	});

	test('getPlainTextToCopy 1/1 - emptySelectionClipboard', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 6)
			],
			true,
			'ine2'
		);
	});

	test('getPlainTextToCopy 0/2', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 2),
				new Range(3, 2, 3, 2),
			],
			false,
			''
		);
	});

	test('getPlainTextToCopy 0/2 - emptySelectionClipboard', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 2),
				new Range(3, 2, 3, 2),
			],
			true,
			[
				'line2\n',
				'line3\n'
			]
		);
	});

	test('issue #256039: getPlainTextToCopy with multiple cursors and empty selections should return array', () => {
		// Bug: When copying with multiple cursors (empty selections) with emptySelectionClipboard enabled,
		// the result should be an array so that pasting with "editor.multiCursorPaste": "full"
		// correctly distributes each line to the corresponding cursor.
		// Without the fix, this returns 'line2\nline3\n' (a single string).
		// With the fix, this returns ['line2\n', 'line3\n'] (an array).
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 1, 2, 1),
				new Range(3, 1, 3, 1),
			],
			true,
			['line2\n', 'line3\n']
		);
	});

	test('getPlainTextToCopy 1/2', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 6),
				new Range(3, 2, 3, 2),
			],
			false,
			'ine2'
		);
	});

	test('getPlainTextToCopy 1/2 - emptySelectionClipboard', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 6),
				new Range(3, 2, 3, 2),
			],
			true,
			['ine2', 'line3\n']
		);
	});

	test('getPlainTextToCopy 2/2', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 6),
				new Range(3, 2, 3, 6),
			],
			false,
			['ine2', 'ine3']
		);
	});

	test('getPlainTextToCopy 2/2 reversed', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(3, 2, 3, 6),
				new Range(2, 2, 2, 6),
			],
			false,
			['ine2', 'ine3']
		);
	});

	test('getPlainTextToCopy 0/3 - emptySelectionClipboard', () => {
		assertGetPlainTextToCopy(
			USUAL_TEXT,
			[
				new Range(2, 2, 2, 2),
				new Range(2, 3, 2, 3),
				new Range(3, 2, 3, 2),
			],
			true,
			[
				'line2\n',
				'line3\n'
			]
		);
	});

	test('issue #22688 - always use CRLF for clipboard on Windows', () => {
		testViewModel(USUAL_TEXT, {}, (viewModel, model) => {
			model.setEOL(EndOfLineSequence.LF);
			const actual = viewModel.getPlainTextToCopy([new Range(2, 1, 5, 1)], true, true);
			assert.deepStrictEqual(actual.sourceText, 'line2\r\nline3\r\nline4\r\n');
		});
	});

	test('issue #40926: Incorrect spacing when inserting new line after multiple folded blocks of code', () => {
		testViewModel(
			[
				'foo = {',
				'    foobar: function() {',
				'        this.foobar();',
				'    },',
				'    foobar: function() {',
				'        this.foobar();',
				'    },',
				'    foobar: function() {',
				'        this.foobar();',
				'    },',
				'}',
			], {}, (viewModel, model) => {
				viewModel.setHiddenAreas([
					new Range(3, 1, 3, 1),
					new Range(6, 1, 6, 1),
					new Range(9, 1, 9, 1),
				]);

				model.applyEdits([
					{ range: new Range(4, 7, 4, 7), text: '\n    ' },
					{ range: new Range(7, 7, 7, 7), text: '\n    ' },
					{ range: new Range(10, 7, 10, 7), text: '\n    ' }
				]);

				assert.strictEqual(viewModel.getLineCount(), 11);
			}
		);
	});

	test('normalizePosition with multiple touching injected text', () => {
		testViewModel(
			[
				'just some text'
			],
			{},
			(viewModel, model) => {
				model.deltaDecorations([], [
					{
						range: new Range(1, 8, 1, 8),
						options: {
							description: 'test',
							before: {
								content: 'bar'
							},
							showIfCollapsed: true
						}
					},
					{
						range: new Range(1, 8, 1, 8),
						options: {
							description: 'test',
							before: {
								content: 'bz'
							},
							showIfCollapsed: true
						}
					},
				]);

				// just sobarbzme text

				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.None), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.None), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.None), new Position(1, 11));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.None), new Position(1, 11));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.None), new Position(1, 13));

				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Left), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Left), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Left), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Left), new Position(1, 8));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Left), new Position(1, 8));

				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Right), new Position(1, 13));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Right), new Position(1, 13));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Right), new Position(1, 13));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Right), new Position(1, 13));
				assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Right), new Position(1, 13));
			}
		);
	});

	test('issue #193262: Incorrect implementation of modifyPosition', () => {
		testViewModel(
			[
				'just some text'
			],
			{
				wordWrap: 'wordWrapColumn',
				wordWrapColumn: 5
			},
			(viewModel, model) => {
				assert.deepStrictEqual(
					new Position(3, 1),
					viewModel.modifyPosition(new Position(3, 2), -1)
				);
			}
		);
	});

	suite('hidden areas must always leave at least one visible line', () => {

		test('replacing the only visible line content does not make it hidden', () => {
			const text = [
				'line1',
				'line2',
				'line3',
			];
			testViewModel(text, {}, (viewModel, model) => {
				// Hide lines 1 and 3, leaving only line 2 visible
				viewModel.setHiddenAreas([
					new Range(1, 1, 1, 1),
					new Range(3, 1, 3, 1),
				]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Replace line 2 content entirely
				model.applyEdits([{
					range: new Range(2, 1, 2, 6),
					text: 'new content'
				}]);

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('deleting the only visible line when it is the last line', () => {
			const text = [
				'line1',
				'line2',
				'line3',
			];
			testViewModel(text, {}, (viewModel, model) => {
				// Hide lines 1-2, leaving only line 3 visible
				viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Delete line 3 by merging it into line 2
				model.applyEdits([{
					range: new Range(2, 6, 3, 6),
					text: null
				}]);

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('deleting the only visible line when it is in the middle', () => {
			const text = [
				'line1',
				'line2',
				'line3',
				'line4',
				'line5',
			];
			testViewModel(text, {}, (viewModel, model) => {
				// Hide lines 1-2 and 4-5, leaving only line 3 visible
				viewModel.setHiddenAreas([
					new Range(1, 1, 2, 1),
					new Range(4, 1, 5, 1),
				]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Delete line 3 by merging adjacent lines
				model.applyEdits([{
					range: new Range(2, 6, 4, 1),
					text: null
				}]);

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('undo that removes the only visible line', () => {
			const text = [
				'line1',
			];
			testViewModel(text, {}, (viewModel, model) => {
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Insert lines to create content
				model.pushEditOperations([], [{
					range: new Range(1, 6, 1, 6),
					text: '\nline2\nline3\nline4\nline5'
				}], () => ([]));

				assert.strictEqual(viewModel.getLineCount(), 5);

				// Hide lines 1-2 and 4-5, leaving only line 3 visible
				viewModel.setHiddenAreas([
					new Range(1, 1, 2, 1),
					new Range(4, 1, 5, 1),
				]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Undo collapses back to 1 line, but hidden area decorations may grow
				model.undo();

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('deleting the only visible line between two hidden areas leaves all lines hidden', () => {
			const text = [
				'line1',
				'line2',
				'line3',
				'line4',
				'line5',
				'line6',
				'line7',
				'line8',
			];
			testViewModel(text, {}, (viewModel, model) => {
				assert.strictEqual(viewModel.getLineCount(), 8);

				// Hide lines 1-5 and 7-8, leaving only line 6 visible
				viewModel.setHiddenAreas([
					new Range(1, 1, 5, 1),
					new Range(7, 1, 8, 1),
				]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Delete lines 6, 7, 8 — the only visible line plus some hidden ones
				model.applyEdits([{
					range: new Range(6, 1, 8, 5),
					text: null
				}]);

				// The view model must still have at least one visible line
				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('multiple visible lines deleted leaving only hidden lines', () => {
			const text = [
				'hidden1',
				'hidden2',
				'visible1',
				'visible2',
				'hidden3',
				'hidden4',
			];
			testViewModel(text, {}, (viewModel, model) => {
				viewModel.setHiddenAreas([
					new Range(1, 1, 2, 1),
					new Range(5, 1, 6, 1),
				]);
				assert.strictEqual(viewModel.getLineCount(), 2);

				// Delete visible lines 3 and 4
				model.applyEdits([{
					range: new Range(2, 8, 5, 1),
					text: null
				}]);

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});

		test('hidden areas from multiple sources that overlap produce valid merged result', () => {
			const text: string[] = [];
			for (let i = 1; i <= 10; i++) {
				text.push(`line${i}`);
			}
			testViewModel(text, {}, (viewModel, model) => {
				// Source A hides a large range [1-8].
				// Source B hides small ranges [2-3] and [5-6] that are subsumed by A.
				// mergeLineRangeArray has a bug where it advances both pointers after
				// merging [1-8]+[2-3]=[1-8], leaving [5-6] and [8,9] as separate entries
				// that overlap with or are subsumed by [1-8].
				// normalizeLineRanges in setHiddenAreas cleans this up, so the result
				// should still be correct: lines 1-8 hidden, lines 9-10 visible.
				viewModel.setHiddenAreas([new Range(1, 1, 8, 1)], 'sourceA');
				viewModel.setHiddenAreas([new Range(2, 1, 3, 1), new Range(5, 1, 6, 1), new Range(8, 1, 9, 1)], 'sourceB');

				// Lines 1-9 should be hidden (merged from [1-8] and [8-9]), line 10 visible
				assert.strictEqual(viewModel.getLineCount(), 1, 'only line 10 should be visible');

				// The hidden areas returned should be non-overlapping and sorted
				const hiddenAreas = viewModel.getHiddenAreas();
				for (let i = 1; i < hiddenAreas.length; i++) {
					assert.ok(
						hiddenAreas[i].startLineNumber > hiddenAreas[i - 1].endLineNumber,
						`hidden areas should not overlap: [${hiddenAreas[i - 1].startLineNumber}-${hiddenAreas[i - 1].endLineNumber}] and [${hiddenAreas[i].startLineNumber}-${hiddenAreas[i].endLineNumber}]`
					);
				}
			});
		});

		test('tab size change with drifted hidden area decorations must not leave 0 visible lines', () => {
			const text = [
				'line1',
				'line2',
				'line3',
			];
			testViewModel(text, {}, (viewModel, model) => {
				// Hide lines 1-2, leaving only line 3 visible.
				viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
				assert.strictEqual(viewModel.getLineCount(), 1);

				// Insert at (2,1) — the end edge of the hidden area decoration.
				// AlwaysGrowsWhenTypingAtEdges causes the decoration to grow from
				// [1,1 → 2,1] to [1,1 → 3,1], covering what was the visible line 3.
				// After this insert, the file has 4 lines, decoration covers [1-3], line 4 visible.
				model.applyEdits([{ range: new Range(2, 1, 2, 1), text: 'x\n' }]);
				// Insert again to push decoration further
				model.applyEdits([{ range: new Range(3, 1, 3, 1), text: 'y\n' }]);
				// Now file has 5 lines, decoration covers [1-4], line 5 visible.

				// Delete lines 4-5 to collapse back, making decoration cover everything
				model.applyEdits([{ range: new Range(4, 1, 5, 6), text: '' }]);
				// Now file has 4 lines. acceptVersionId ensures viewLines >= 1.

				// Tab size change: triggers _constructLines(resetHiddenAreas=false)
				// which re-reads the decoration ranges (which may cover all lines).
				model.updateOptions({ tabSize: 8 });

				assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
			});
		});
	});
});
