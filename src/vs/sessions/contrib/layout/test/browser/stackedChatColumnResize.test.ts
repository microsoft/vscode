/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Direction, Grid } from '../../../../../base/browser/ui/grid/grid.js';
import { LayoutPriority } from '../../../../../base/browser/ui/splitview/splitview.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestView } from '../../../../../base/test/browser/ui/grid/util.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MainEditorPart } from '../../../../browser/parts/editorPart.js';

suite('Sessions - stacked chat column resizes', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class PriorityView extends TestView {
		constructor(readonly priority: LayoutPriority, minimumWidth: number, minimumHeight: number) {
			super(minimumWidth, Number.POSITIVE_INFINITY, minimumHeight, Number.POSITIVE_INFINITY);
		}
	}

	/** The editor part's priority while the chat stacked below it keeps its height, or not. */
	function editorPriority(takesStackedColumnResizes: boolean): LayoutPriority {
		const editorPart = Object.create(MainEditorPart.prototype) as MainEditorPart;
		editorPart.setTakesStackedColumnResizes(takesStackedColumnResizes);
		return editorPart.priority;
	}

	/**
	 * The center panel alignment, stacked: the sidebar (low priority) beside the column of the editor, the chat showing
	 * only its input (keeping its height: low priority) and the panel. Resizes the window and reports the parts' sizes.
	 */
	function resizeWindow(editor: LayoutPriority) {
		const disposables = store.add(new DisposableStore());
		const sidebarView = disposables.add(new PriorityView(LayoutPriority.Low, 170, 0));
		const editorView = disposables.add(new PriorityView(editor, 300, 100));
		const sessionsView = disposables.add(new PriorityView(LayoutPriority.Low, 0, 164));
		const panelView = disposables.add(new PriorityView(LayoutPriority.Normal, 0, 77));
		const grid = disposables.add(new Grid(editorView, { proportionalLayout: false }));
		grid.layout(1200, 800);
		grid.addView(sidebarView, 280, editorView, Direction.Left);
		grid.addView(sessionsView, 164, editorView, Direction.Down);
		grid.addView(panelView, 200, sessionsView, Direction.Down);
		const sizes = () => ({ sidebarWidth: sidebarView.width, editor: editorView.size, sessionsHeight: sessionsView.height, panelHeight: panelView.height });

		const before = sizes();
		grid.layout(1400, 920);
		const grown = sizes();
		grid.layout(1100, 700);
		const shrunk = sizes();
		disposables.dispose();
		return { before, grown, shrunk };
	}

	test('in the center panel alignment, the editor takes the window resizes while the chat below it keeps its height, not the sidebar or the panel', () => {
		assert.deepStrictEqual({ editorPriority: editorPriority(true), restored: editorPriority(false), resized: resizeWindow(editorPriority(true)) }, {
			editorPriority: LayoutPriority.High,
			restored: LayoutPriority.Normal,
			resized: {
				before: { sidebarWidth: 280, editor: [920, 436], sessionsHeight: 164, panelHeight: 200 },
				grown: { sidebarWidth: 280, editor: [1120, 556], sessionsHeight: 164, panelHeight: 200 },
				shrunk: { sidebarWidth: 280, editor: [820, 336], sessionsHeight: 164, panelHeight: 200 },
			},
		});
	});
});
