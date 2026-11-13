/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { Grid, Direction, Orientation } from '../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Layout } from '../../browser/layout.js';
import { Part, updateSashEndpoints } from '../../browser/part.js';
import { PanelAlignment, Parts, Position } from '../../services/layout/browser/layoutService.js';

suite('Workbench layout sash endpoints', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLayout() {
		const parts = new Map<Parts, Part>();
		const view = (id: Parts) => {
			const part = new class extends mock<Part>() {
				override readonly element = $(`.part.${id.split('.').pop()}`);
				override readonly minimumWidth = 0;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = 0;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override get onDidChange() { return Event.None; }
				override layout() { }
				override getContainer() { return this.element; }
				override updateStyles() { }
				override toJSON() { return { type: id }; }
			}();
			parts.set(id, part);
			return part;
		};
		const titleBarPartView = view(Parts.TITLEBAR_PART);
		const bannerPartView = view(Parts.BANNER_PART);
		const activityBarPartView = view(Parts.ACTIVITYBAR_PART);
		const sideBarPartView = view(Parts.SIDEBAR_PART);
		const editorPartView = view(Parts.EDITOR_PART);
		const panelPartView = view(Parts.PANEL_PART);
		const auxiliaryBarPartView = view(Parts.AUXILIARYBAR_PART);
		const statusBarPartView = view(Parts.STATUSBAR_PART);
		const layout = store.add(new class extends Layout {
			compact = false;
			override isFloatingPanelsEnabled() { return true; }
			override isModernUICompact() { return this.compact; }
			override isPanelMaximized() { return false; }
			override setAuxiliaryBarMaximized() { return false; }
			override isVisible() { return true; }
			override hasFocus() { return false; }
			protected override getPart(id: Parts) { return parts.get(id)!; }
		}(mainWindow.document.body));
		const root = append(mainWindow.document.body, layout.mainContainer);
		store.add(toDisposable(() => root.remove()));
		root.className = 'monaco-workbench floating-panels panel-position-bottom panel-alignment-center';
		root.style.cssText = 'position: relative; width: 800px; height: 600px; --vscode-panels-spacing: 16px; --vscode-sash-size: 4px; --vscode-sash-hover-size: 4px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px;';
		const grid = store.add(new Grid(titleBarPartView));
		grid.orientation = Orientation.VERTICAL;
		append(root, grid.element);
		grid.layout(800, 600);
		grid.addView(bannerPartView, 24, titleBarPartView, Direction.Down);
		grid.addView(editorPartView, 500, bannerPartView, Direction.Down);
		grid.addView(statusBarPartView, 24, editorPartView, Direction.Down);
		grid.addView(activityBarPartView, 40, editorPartView, Direction.Left);
		grid.addView(sideBarPartView, 160, editorPartView, Direction.Left);
		grid.addView(auxiliaryBarPartView, 160, editorPartView, Direction.Right);
		grid.addView(panelPartView, 200, editorPartView, Direction.Down);
		const values = new Map<string, number | string>();
		Object.assign(layout, {
			workbenchGrid: grid, titleBarPartView, bannerPartView, activityBarPartView, sideBarPartView,
			editorPartView, panelPartView, auxiliaryBarPartView, statusBarPartView,
			stateModel: {
				getRuntimeValue: (key: { name: string; defaultValue: number | string }) => values.get(key.name) ?? key.defaultValue,
				setRuntimeValue: (key: { name: string }, value: number | string) => values.set(key.name, value),
			},
		});
		const endpoints = () => Array.from(grid.element.querySelectorAll<HTMLElement>('.monaco-sash')).map(sash => {
			const bounds = sash.getBoundingClientRect();
			return {
				start: sash.classList.contains('workbench-sash-start-at-gap'),
				end: sash.classList.contains('workbench-sash-end-at-gap'),
				startOffset: sash.style.getPropertyValue('--workbench-sash-start'),
				endOffset: sash.style.getPropertyValue('--workbench-sash-end'),
				bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom],
			};
		});
		updateSashEndpoints(grid.element, true);
		assert.ok(endpoints().some(sash => sash.start || sash.end));
		return { layout, root, grid, endpoints };
	}

	for (const compact of [false, true]) {
		test(`refreshes sash endpoints immediately after panel alignment changes, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			for (const alignment of ['justify', 'right', 'center'] satisfies PanelAlignment[]) {
				layout.setPanelAlignment(alignment);
				const actual = endpoints();
				updateSashEndpoints(grid.element, !compact);
				assert.deepStrictEqual(actual, endpoints(), alignment);
			}
		});

		test(`refreshes sash endpoints immediately after panel position changes, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			for (const position of [Position.RIGHT, Position.TOP, Position.BOTTOM]) {
				layout.setPanelPosition(position);
				const actual = endpoints();
				updateSashEndpoints(grid.element, !compact);
				assert.deepStrictEqual(actual, endpoints(), `${position}`);
			}
		});
	}
});
