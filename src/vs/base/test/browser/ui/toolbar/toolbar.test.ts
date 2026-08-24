/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuProvider } from '../../../../browser/contextmenu.js';
import { ActionBar } from '../../../../browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../../browser/ui/actionbar/actionViewItems.js';
import { ToggleMenuAction, ToolBar } from '../../../../browser/ui/toolbar/toolbar.js';
import { Action, IAction } from '../../../../common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class FixedWidthActionViewItem extends BaseActionViewItem {

	constructor(action: IAction, private readonly width: number) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.style.width = `${this.width}px`;
		container.style.boxSizing = 'border-box';
		container.style.overflow = 'hidden';
		container.style.whiteSpace = 'nowrap';
		container.textContent = this.action.label;
	}
}

class TestToolBar extends ToolBar {
	get actionBarForTest(): Pick<ActionBar, 'getWidth' | 'getAction'> {
		return this.actionBar;
	}
}

const contextMenuProvider: IContextMenuProvider = {
	showContextMenu: () => { }
};

suite('ToolBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		container.style.width = '273px';
		document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	test('keeps the last primary action shrinkable when overflow is inserted', () => {
		const widths = new Map<string, number>([
			['workbench.action.chat.attachContext', 22],
			['workbench.action.chat.openModePicker', 75],
			['workbench.action.chat.openModelPicker', 271],
			['workbench.action.chat.configureTools', 22],
			[ToggleMenuAction.ID, 22],
		]);

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 22,
			},
			actionViewItemProvider: action => {
				const width = widths.get(action.id);
				return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
			}
		}));
		const actionBar = toolbar.actionBarForTest;
		const originalGetWidth = actionBar.getWidth.bind(actionBar);
		actionBar.getWidth = (index: number) => {
			const action = actionBar.getAction(index);
			return action ? (widths.get(action.id) ?? originalGetWidth(index)) : originalGetWidth(index);
		};

		const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
		(toolbar.getElement() as HTMLElement & { getBoundingClientRect(): DOMRect }).getBoundingClientRect = () => ({
			...originalGetBoundingClientRect(),
			width: 273,
			right: 273,
			left: 0,
			x: 0,
			y: 0,
			top: 0,
			bottom: 0,
			height: 0,
			toJSON() {
				return {};
			}
		});

		const actions = [
			store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
			store.add(new Action('workbench.action.chat.openModePicker', 'Open Agent Picker')),
			store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
			store.add(new Action('workbench.action.chat.configureTools', 'Configure Tools...')),
		];

		toolbar.setActions(actions);

		assert.strictEqual(toolbar.getItemsLength(), 4);
		assert.strictEqual(toolbar.getItemAction(0)?.id, 'workbench.action.chat.attachContext');
		assert.strictEqual(toolbar.getItemAction(1)?.id, 'workbench.action.chat.openModePicker');
		assert.strictEqual(toolbar.getItemAction(2)?.id, 'workbench.action.chat.openModelPicker');
		assert.strictEqual(toolbar.getItemAction(3)?.id, ToggleMenuAction.ID);
		assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), true);
	});

	test('applies per-action responsive min widths', () => {
		const toolbar = store.add(new ToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 22,
				getActionMinWidth: action => action.id === 'workbench.action.chat.openModelPicker' ? 28 : undefined,
			},
			actionViewItemProvider: action => new FixedWidthActionViewItem(action, 22)
		}));

		const actions = [
			store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
			store.add(new Action('workbench.action.chat.openModePicker', 'Open Agent Picker')),
			store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
		];

		toolbar.setActions(actions);

		assert.strictEqual(toolbar.getElement().style.getPropertyValue('--vscode-toolbar-action-min-width'), '28px');
	});

	test('relayout re-evaluates responsive overflow after action width changes', () => {
		const widths = new Map<string, number>([
			['workbench.action.chat.attachContext', 22],
			['workbench.action.chat.openModePicker', 22],
			['workbench.action.chat.openModelPicker', 50],
			[ToggleMenuAction.ID, 22],
		]);

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 22,
			},
			actionViewItemProvider: action => {
				const width = widths.get(action.id);
				return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
			}
		}));
		const actionBar = toolbar.actionBarForTest;
		const originalGetWidth = actionBar.getWidth.bind(actionBar);
		actionBar.getWidth = (index: number) => {
			const action = actionBar.getAction(index);
			return action ? (widths.get(action.id) ?? originalGetWidth(index)) : originalGetWidth(index);
		};

		const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
		(toolbar.getElement() as HTMLElement & { getBoundingClientRect(): DOMRect }).getBoundingClientRect = () => ({
			...originalGetBoundingClientRect(),
			width: 110,
			right: 110,
			left: 0,
			x: 0,
			y: 0,
			top: 0,
			bottom: 0,
			height: 0,
			toJSON() {
				return {};
			}
		});

		const actions = [
			store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
			store.add(new Action('workbench.action.chat.openModePicker', 'Open Mode Picker')),
			store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
		];

		toolbar.setActions(actions);

		assert.strictEqual(toolbar.getItemsLength(), 3);
		assert.strictEqual(toolbar.getItemAction(2)?.id, 'workbench.action.chat.openModelPicker');
		assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), false);

		widths.set('workbench.action.chat.openModePicker', 80);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 3);
		assert.strictEqual(toolbar.getItemAction(0)?.id, 'workbench.action.chat.attachContext');
		assert.strictEqual(toolbar.getItemAction(1)?.id, 'workbench.action.chat.openModePicker');
		assert.strictEqual(toolbar.getItemAction(2)?.id, ToggleMenuAction.ID);
		assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), true);
	});

	test('does not repeatedly restore an action below its required width', () => {
		const widths = new Map<string, number>([
			['primary.a', 56],
			['primary.b', 48],
		]);
		const renderCounts = new Map<string, number>();
		let availableWidth = 128;

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 48,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => {
				renderCounts.set(action.id, (renderCounts.get(action.id) ?? 0) + 1);
				const width = widths.get(action.id);
				return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
			}
		}));
		const primaryActions = [
			store.add(new Action('primary.a', 'Primary A')),
			store.add(new Action('primary.b', 'Primary B')),
		];
		const secondaryActions = [store.add(new Action('secondary', 'Secondary'))];
		const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);

		toolbar.setActions(primaryActions, secondaryActions);
		const afterInitialLayout = getActionIds();
		toolbar.relayout();
		const afterRepeatedLayout = getActionIds();

		availableWidth = 136;
		toolbar.relayout();
		const afterGrowing = getActionIds();

		availableWidth = 128;
		toolbar.relayout();
		toolbar.relayout();
		const afterShrinkingAgain = getActionIds();

		assert.deepStrictEqual({
			afterInitialLayout,
			afterRepeatedLayout,
			afterGrowing,
			afterShrinkingAgain,
			primaryBRenderCount: renderCounts.get('primary.b'),
		}, {
			afterInitialLayout: ['primary.a', ToggleMenuAction.ID],
			afterRepeatedLayout: ['primary.a', ToggleMenuAction.ID],
			afterGrowing: ['primary.a', 'primary.b', ToggleMenuAction.ID],
			afterShrinkingAgain: ['primary.a', ToggleMenuAction.ID],
			primaryBRenderCount: 2,
		});
	});

	test('ignores the responsive minimum when measuring an action that will stop shrinking', () => {
		const widths = new Map<string, number>([
			['primary.a', 22],
			['primary.b', 48],
		]);
		let availableWidth = 90;

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 48,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => {
				const width = widths.get(action.id);
				return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
			}
		}));
		const primaryActions = [
			store.add(new Action('primary.a', 'Primary A')),
			store.add(new Action('primary.b', 'Primary B')),
		];
		const secondaryActions = [store.add(new Action('secondary', 'Secondary'))];
		const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);

		toolbar.setActions(primaryActions, secondaryActions);
		const beforeGrowing = getActionIds();

		availableWidth = 110;
		toolbar.relayout();
		const afterGrowing = getActionIds();

		assert.deepStrictEqual({
			beforeGrowing,
			afterGrowing,
		}, {
			beforeGrowing: ['primary.a', ToggleMenuAction.ID],
			afterGrowing: ['primary.a', 'primary.b', ToggleMenuAction.ID],
		});
	});

	test('restores a hidden action after a visible action shrinks', () => {
		const availableWidth = 128;

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 48,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => {
				switch (action.id) {
					case 'primary.a': return new FixedWidthActionViewItem(action, 100);
					case 'primary.b': return new FixedWidthActionViewItem(action, 48);
					default: return undefined;
				}
			}
		}));
		const primaryActions = [
			store.add(new Action('primary.a', 'Primary A')),
			store.add(new Action('primary.b', 'Primary B')),
		];
		const secondaryActions = [store.add(new Action('secondary', 'Secondary'))];
		const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);

		toolbar.setActions(primaryActions, secondaryActions);
		const beforeShrinking = getActionIds();

		const primaryAItem = toolbar.getElement().querySelector<HTMLElement>('.action-item');
		assert.ok(primaryAItem);
		primaryAItem.style.width = '48px';
		toolbar.relayout();
		const afterShrinking = getActionIds();

		assert.deepStrictEqual({
			beforeShrinking,
			afterShrinking,
		}, {
			beforeShrinking: ['primary.a', ToggleMenuAction.ID],
			afterShrinking: ['primary.a', 'primary.b', ToggleMenuAction.ID],
		});
	});

	test('uses getAvailableWidth override instead of the element width', () => {
		const widths = new Map<string, number>([
			['a', 50],
			['b', 50],
			['c', 50],
			[ToggleMenuAction.ID, 22],
		]);

		let availableWidth = 200;

		const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 22,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => {
				const width = widths.get(action.id);
				return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
			}
		}));
		const actionBar = toolbar.actionBarForTest;
		const originalGetWidth = actionBar.getWidth.bind(actionBar);
		actionBar.getWidth = (index: number) => {
			const action = actionBar.getAction(index);
			return action ? (widths.get(action.id) ?? originalGetWidth(index)) : originalGetWidth(index);
		};

		// Force the element's bounding rect to a value that would otherwise hide everything
		// to prove the toolbar uses the override callback instead.
		const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
		(toolbar.getElement() as HTMLElement & { getBoundingClientRect(): DOMRect }).getBoundingClientRect = () => ({
			...originalGetBoundingClientRect(),
			width: 0,
			right: 0,
			left: 0,
			x: 0,
			y: 0,
			top: 0,
			bottom: 0,
			height: 0,
			toJSON() {
				return {};
			}
		});

		const actions = [
			store.add(new Action('a', 'A')),
			store.add(new Action('b', 'B')),
			store.add(new Action('c', 'C')),
		];

		toolbar.setActions(actions);

		// availableWidth = 200 is plenty for all 3 actions; the element's 0 width is ignored
		assert.strictEqual(toolbar.getItemsLength(), 3);
		assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), false);

		availableWidth = 60;
		toolbar.relayout();

		// availableWidth shrank — actions overflow into the toggle menu
		assert.strictEqual(toolbar.getItemAction(toolbar.getItemsLength() - 1)?.id, ToggleMenuAction.ID);
		assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), true);
	});
});
