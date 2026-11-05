/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CoreNavigationCommands } from '../../../browser/coreCommands.js';
import { Range } from '../../../common/core/range.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { withTestCodeEditor } from '../testCodeEditor.js';

suite('Editor Controller - EditorScroll', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// A 100 line document: 'line 1', 'line 2', ... 'line 100'.
	const TEXT = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');

	function scrollDownByLine(viewModel: ViewModel, value: number): void {
		CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, { to: 'down', by: 'line', value });
	}

	function scrollUpByLine(viewModel: ViewModel, value: number): void {
		CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, { to: 'up', by: 'line', value });
	}

	test('scrolling down by line moves past a folded region (#171865)', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: collapse lines 2..50 so the first visible line (1) is immediately
			// followed by a large fold, and put line 1 at the top of the viewport.
			viewModel.setHiddenAreas([new Range(2, 1, 50, 1)]);
			editor.setScrollTop(0, ScrollType.Immediate);
			assert.strictEqual(editor.getScrollTop(), 0);

			// Act: scroll down 3 model lines. The target line (4) is inside the fold.
			scrollDownByLine(viewModel, 3);

			// Assert: the viewport advanced instead of stalling at the fold.
			assert.ok(editor.getScrollTop() > 0, `expected scroll to advance past the fold, got ${editor.getScrollTop()}`);
		});
	});

	test('repeated downward scrolling keeps progressing across a fold (#171865)', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange.
			viewModel.setHiddenAreas([new Range(2, 1, 50, 1)]);
			editor.setScrollTop(0, ScrollType.Immediate);

			// Act + Assert: simulate holding the scroll-down shortcut. Each press must make
			// forward progress instead of stalling at the fold (the bug kept scrollTop at 0).
			let previousScrollTop = editor.getScrollTop();
			for (let i = 0; i < 8; i++) {
				scrollDownByLine(viewModel, 3);
				const scrollTop = editor.getScrollTop();
				assert.ok(scrollTop > previousScrollTop, `expected scroll ${i + 1} to advance past the fold, got ${scrollTop} (was ${previousScrollTop})`);
				previousScrollTop = scrollTop;
			}
		});
	});

	test('scrolling down by line without folds advances by the requested amount', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: no folds.
			editor.setScrollTop(0, ScrollType.Immediate);

			// Act.
			scrollDownByLine(viewModel, 3);

			// Assert: exactly 3 lines down.
			assert.strictEqual(editor.getScrollTop(), 3 * viewModel.cursorConfig.lineHeight);
		});
	});

	test('scrolling down into a fold that reaches the end of the file settles at the bottom (#171865)', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: collapse lines 11..100 so the fold extends to the end of the file
			// and only lines 1..10 remain visible.
			viewModel.setHiddenAreas([new Range(11, 1, 100, 1)]);

			// Find how far the viewport can scroll by asking it to scroll past the end.
			editor.setScrollTop(editor.getScrollHeight(), ScrollType.Immediate);
			const maxScrollTop = editor.getScrollTop();
			assert.ok(maxScrollTop > 0);

			// Act: from the top, scroll down by a large amount so the target model line
			// lands inside the end-of-file fold (past the last visible line). This hits the
			// guard that keeps the default mapping when no visible line exists after the target.
			editor.setScrollTop(0, ScrollType.Immediate);
			scrollDownByLine(viewModel, 20);

			// Assert: it settled at the bottom instead of throwing or overshooting.
			assert.strictEqual(editor.getScrollTop(), maxScrollTop);
		});
	});

	test('scrolling up by line still moves up when a fold is present', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: collapse lines 2..50, then scroll down past the fold.
			viewModel.setHiddenAreas([new Range(2, 1, 50, 1)]);
			editor.setScrollTop(0, ScrollType.Immediate);
			scrollDownByLine(viewModel, 3);
			const scrollTopAfterDown = editor.getScrollTop();
			assert.ok(scrollTopAfterDown > 0);

			// Act.
			scrollUpByLine(viewModel, 3);

			// Assert: scrolling up moved the viewport back up.
			assert.ok(editor.getScrollTop() < scrollTopAfterDown, `expected upward scroll to move up, got ${editor.getScrollTop()}`);
		});
	});

	test('scrolling up by line moves past a fold above the viewport', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: collapse lines 2..50 and put line 51 (the line right after the
			// fold) at the top of the viewport, so the fold sits directly above.
			viewModel.setHiddenAreas([new Range(2, 1, 50, 1)]);
			editor.setScrollTop(viewModel.cursorConfig.lineHeight, ScrollType.Immediate);
			const before = editor.getScrollTop();
			assert.ok(before > 0);

			// Act: scroll up 3 model lines. The target (line 48) is inside the fold above.
			scrollUpByLine(viewModel, 3);

			// Assert: the viewport moved up past the fold instead of stalling.
			assert.ok(editor.getScrollTop() < before, `expected upward scroll to move past the fold, got ${editor.getScrollTop()}`);
		});
	});

	test('repeated upward scrolling reaches the top across a fold', () => {
		withTestCodeEditor(TEXT, { envConfig: { outerHeight: 100 } }, (editor, viewModel) => {
			// Arrange: collapse lines 2..50 and start scrolled to the bottom.
			viewModel.setHiddenAreas([new Range(2, 1, 50, 1)]);
			editor.setScrollTop(editor.getScrollHeight(), ScrollType.Immediate);
			assert.ok(editor.getScrollTop() > 0);

			// Act: simulate holding the scroll-up shortcut.
			for (let i = 0; i < 30; i++) {
				scrollUpByLine(viewModel, 3);
			}

			// Assert: it reached the very top.
			assert.strictEqual(editor.getScrollTop(), 0);
		});
	});
});
