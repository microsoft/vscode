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
import { SessionLayoutMode, SessionSplitLayout } from '../../../../common/sessionLayoutMode.js';
import { restoreCenterSizes } from '../../browser/desktop/desktopLayoutModeCoordinator.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';

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

	/**
	 * The center panel alignment, the panel sharing the chat's column: hides the chat as the layout mode coordinator
	 * does, giving its room to the editor, narrows the window, then shows the chat again, restoring the sizes from
	 * before. Reports the parts' sizes.
	 */
	function hideChatResizeAndShow(arrangement: SessionSplitLayout) {
		const disposables = store.add(new DisposableStore());
		const sidebarView = disposables.add(new PriorityView(LayoutPriority.Low, 170, 0));
		const editorView = disposables.add(new PriorityView(LayoutPriority.Normal, 300, 100));
		const sessionsView = disposables.add(new PriorityView(LayoutPriority.Low, 200, 164));
		const panelView = disposables.add(new PriorityView(LayoutPriority.Normal, 200, 77));
		const grid = disposables.add(new Grid(editorView, { proportionalLayout: false }));
		grid.layout(1400, 800);
		grid.addView(sidebarView, 280, editorView, Direction.Left);
		if (arrangement === SessionLayoutMode.Stacked) {
			// [sidebar, column(editor, chat, panel)]
			grid.addView(sessionsView, 300, editorView, Direction.Down);
			grid.addView(panelView, 100, sessionsView, Direction.Down);
		} else {
			// [sidebar, column(chat, panel), editor]
			grid.addView(sessionsView, 500, editorView, Direction.Left);
			grid.addView(panelView, 300, sessionsView, Direction.Down);
		}
		const size = (view: PriorityView) => ({ width: view.width, height: view.height });
		const sizes = () => ({ sidebarWidth: sidebarView.width, editor: size(editorView), panel: size(panelView) });

		const before = sizes();
		const saved = { editor: size(editorView), panel: size(panelView) };
		const chat = size(sessionsView);
		grid.setViewVisible(sessionsView, false);
		if (arrangement === SessionLayoutMode.Stacked) {
			grid.resizeView(panelView, saved.panel);
			grid.resizeView(editorView, { width: saved.editor.width, height: saved.editor.height + chat.height });
		} else {
			grid.resizeView(panelView, { width: 320, height: size(panelView).height });
			grid.resizeView(editorView, { width: saved.editor.width + saved.panel.width - 320, height: saved.editor.height });
		}
		const hidden = sizes();
		grid.layout(1200, 800);
		const narrowed = sizes();
		grid.setViewVisible(sessionsView, true);
		// The workbench's setSize resizes the part's view in the grid.
		const views = new Map<Parts, PriorityView>([[Parts.EDITOR_PART, editorView], [Parts.PANEL_PART, panelView], [Parts.SESSIONS_PART, sessionsView]]);
		restoreCenterSizes({
			getSize: part => size(views.get(part)!),
			setSize: (part, partSize) => grid.resizeView(views.get(part)!, partSize),
			isVisible: () => true,
		}, arrangement, saved);
		const shown = sizes();
		disposables.dispose();
		return { before, hidden, narrowed, shown };
	}

	test('in the center panel alignment, showing the chat restores only the sizes hiding it changed, leaving the sidebar as the window left it', () => {
		assert.deepStrictEqual({ stacked: hideChatResizeAndShow(SessionLayoutMode.Stacked), sideBySide: hideChatResizeAndShow(SessionLayoutMode.SideBySide) }, {
			stacked: {
				before: { sidebarWidth: 280, editor: { width: 1120, height: 500 }, panel: { width: 1120, height: 100 } },
				hidden: { sidebarWidth: 280, editor: { width: 1120, height: 700 }, panel: { width: 1120, height: 100 } },
				// The window narrows the sidebar and the column as it would with the chat shown.
				narrowed: { sidebarWidth: 170, editor: { width: 1030, height: 700 }, panel: { width: 1030, height: 100 } },
				// The heights from before; the widths and the sidebar stay as the window left them.
				shown: { sidebarWidth: 170, editor: { width: 1030, height: 500 }, panel: { width: 1030, height: 100 } },
			},
			sideBySide: {
				before: { sidebarWidth: 280, editor: { width: 620, height: 800 }, panel: { width: 500, height: 300 } },
				hidden: { sidebarWidth: 280, editor: { width: 800, height: 800 }, panel: { width: 320, height: 800 } },
				narrowed: { sidebarWidth: 280, editor: { width: 600, height: 800 }, panel: { width: 320, height: 800 } },
				// The column's width from before, which the editor gives; the sidebar stays.
				shown: { sidebarWidth: 280, editor: { width: 420, height: 800 }, panel: { width: 500, height: 300 } },
			},
		});
	});

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
