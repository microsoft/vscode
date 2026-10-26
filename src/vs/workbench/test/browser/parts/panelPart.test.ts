/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { ToggleMenuAction } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IToolBarResponsiveBehaviorOptions } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IMenuCreateOptions, IMenuService, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';
import { PanelPart } from '../../../browser/parts/panel/panelPart.js';
import { IComposite } from '../../../common/composite.js';

import '../../../browser/media/part.css';
import '../../../browser/parts/panel/media/panelpart.css';
import '../../../contrib/modernUI/browser/media/padding.css';
import '../../../contrib/modernUI/browser/media/fontRamp.css';
import '../../../contrib/modernUI/browser/media/tabs.css';

const globalActionsMenu = MenuId.for('test.panel.title');

class TestPanelMenuService extends MenuService {
	override createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions) {
		return super.createMenu(id === MenuId.PanelTitle ? globalActionsMenu : id, contextKeyService, options);
	}
}

class TestPanelPart extends PanelPart {

	private toolbarAvailableWidth: number | undefined;

	protected override getActiveComposite(): IComposite {
		return {
			onDidFocus: Event.None,
			onDidBlur: Event.None,
			hasFocus: () => false,
			getId: () => 'workbench.panel.repl.view',
			getTitle: () => 'Debug Console',
			getControl: () => undefined,
			focus: () => { },
		};
	}

	protected override getToolbarResponsiveBehavior(): IToolBarResponsiveBehaviorOptions {
		return {
			...super.getToolbarResponsiveBehavior(),
			getAvailableWidth: () => this.toolbarAvailableWidth ?? this.toolBar?.getElement().getBoundingClientRect().width ?? 0,
		};
	}

	setToolbarAvailableWidth(width: number): void {
		this.toolbarAvailableWidth = width;
	}

	setTitleActions(primary: IAction[], secondary: IAction[]): void {
		this.toolBar?.setAriaLabel('Debug Console actions');
		this.toolBar?.setActions(primary, secondary);
	}

	get toolbar() {
		return this.toolBar!;
	}
}

function createTestPanelPart(container: HTMLElement, store: Pick<DisposableStore, 'add'>): TestPanelPart {
	const instantiationService = workbenchInstantiationService({}, store);
	instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
	instantiationService.stub(IViewDescriptorService, store.add(instantiationService.createInstance(ViewDescriptorService)));
	instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(TestPanelMenuService)));
	for (const [order, [id, title, icon]] of ([
		['test.maximize', 'Maximize Panel', Codicon.screenFull],
		['test.close', 'Hide Panel', Codicon.close],
	] as const).entries()) {
		store.add(MenuRegistry.appendMenuItem(globalActionsMenu, { command: { id, title, icon }, group: 'navigation', order }));
	}
	const part = store.add(instantiationService.createInstance(TestPanelPart));
	part.create(container);
	const sessionPicker = instantiationService.createInstance(MenuItemAction, { id: 'workbench.action.debug.selectRepl', title: 'Select Debug Console', icon: Codicon.debug }, undefined, undefined, undefined, undefined);
	const filterAction = instantiationService.createInstance(MenuItemAction, { id: 'workbench.actions.view.filter', title: 'Filter', icon: Codicon.filter }, undefined, undefined, undefined, undefined);
	const searchAction = instantiationService.createInstance(MenuItemAction, { id: 'workbench.debug.panel.action.findRepl', title: 'Find', icon: Codicon.search }, undefined, undefined, undefined, undefined);
	const clearAction = instantiationService.createInstance(MenuItemAction, { id: 'workbench.debug.panel.action.clearReplAction', title: 'Clear Console', icon: Codicon.clearAll }, undefined, undefined, undefined, undefined);
	part.setTitleActions([
		sessionPicker,
		filterAction,
		searchAction,
		clearAction,
	], [store.add(new Action('history', 'History'))]);
	return part;
}

suite('Panel Part - Responsive title actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;

	setup(() => {
		root = append(document.body, $('.monaco-workbench'));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
	});

	teardown(() => root.remove());

	for (const presentation of ['', 'modern-ui modern-ui-tabs', 'modern-ui modern-ui-tabs modern-ui-compact']) {
		test(`overflows title actions into more menu at narrow widths (${presentation || 'standard'})`, () => {
			root.className = `monaco-workbench ${presentation}`;
			const container = append(root, $('.part.panel'));
			const part = createTestPanelPart(container, store);

			const states = [];
			for (const [containerWidth, toolbarWidth] of [[500, 250], [300, 120], [180, 60], [300, 120], [500, 250]]) {
				container.style.width = `${containerWidth}px`;
				part.setToolbarAvailableWidth(toolbarWidth);
				part.layout(containerWidth, 200, 0, 0);
				part.toolbar.relayout();
				states.push({
					actions: Array.from({ length: part.toolbar.getItemsLength() }, (_, index) => part.toolbar.getItemAction(index)?.id),
					hasOverflowMenu: part.toolbar.hasOverflow(),
				});
			}

			assert.deepStrictEqual(states, [
				{
					actions: ['workbench.action.debug.selectRepl', 'workbench.actions.view.filter', 'workbench.debug.panel.action.findRepl', 'workbench.debug.panel.action.clearReplAction', ToggleMenuAction.ID, Separator.ID],
					hasOverflowMenu: true,
				},
				{
					actions: ['workbench.action.debug.selectRepl', 'workbench.actions.view.filter', 'workbench.debug.panel.action.findRepl', ToggleMenuAction.ID, Separator.ID],
					hasOverflowMenu: true,
				},
				{
					actions: [ToggleMenuAction.ID, Separator.ID],
					hasOverflowMenu: true,
				},
				{
					actions: ['workbench.action.debug.selectRepl', 'workbench.actions.view.filter', 'workbench.debug.panel.action.findRepl', ToggleMenuAction.ID, Separator.ID],
					hasOverflowMenu: true,
				},
				{
					actions: ['workbench.action.debug.selectRepl', 'workbench.actions.view.filter', 'workbench.debug.panel.action.findRepl', 'workbench.debug.panel.action.clearReplAction', ToggleMenuAction.ID, Separator.ID],
					hasOverflowMenu: true,
				},
			]);
		});
	}
});
