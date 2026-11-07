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
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IToolBarResponsiveBehaviorOptions } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IMenuCreateOptions, IMenuService, MenuId, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
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

suite('Panel Part - Responsive title actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;

	setup(() => {
		root = append(document.body, $('.monaco-workbench'));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
	});

	teardown(() => root.remove());

	test('preserves functional overflow replacements and minimum widths for custom controls', async () => {
		let filterFocused = false;
		let executedCommandId: string | undefined;

		class FunctionalTestPanelPart extends PanelPart {
			protected override getActiveComposite(): IComposite {
				return {
					onDidFocus: Event.None,
					onDidBlur: Event.None,
					hasFocus: () => false,
					getId: () => 'workbench.panel.repl.view',
					getTitle: () => 'Debug Console',
					getControl: () => undefined,
					focus: () => { },
					focusFilter: () => { filterFocused = true; },
				} as any;
			}

			getResponsiveBehavior(): IToolBarResponsiveBehaviorOptions {
				return this.getToolbarResponsiveBehavior();
			}
		}

		const container = append(root, $('.part.panel'));
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IViewDescriptorService, store.add(instantiationService.createInstance(ViewDescriptorService)));
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(TestPanelMenuService)));
		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string) => {
				executedCommandId = id;
			}
		} as any);

		const part = store.add(instantiationService.createInstance(FunctionalTestPanelPart));
		part.create(container);

		const responsiveBehavior = part.getResponsiveBehavior();
		assert.strictEqual(responsiveBehavior.enabled, true);

		// Verify getActionMinWidth preserves control-specific minimums
		const filterAction = store.add(new Action('viewpane.action.filter'));
		const selectReplAction = store.add(new Action('workbench.action.debug.selectRepl'));
		const splitButton = new SubmenuItemAction({ submenu: MenuId.for('test.split'), title: 'Split', isSplitButton: true }, undefined, []);
		const normalAction = store.add(new Action('normal.action'));

		assert.strictEqual(responsiveBehavior.getActionMinWidth?.(filterAction), 150);
		assert.strictEqual(responsiveBehavior.getActionMinWidth?.(selectReplAction), 60);
		assert.strictEqual(responsiveBehavior.getActionMinWidth?.(splitButton), 36);
		assert.strictEqual(responsiveBehavior.getActionMinWidth?.(normalAction), undefined);

		// Verify getOverflowAction provides functional replacements with valid labels and callbacks
		const overflowFilter = responsiveBehavior.getOverflowAction?.(filterAction, () => undefined)!;
		assert.ok(overflowFilter);
		assert.strictEqual(overflowFilter.id, 'viewpane.action.filter');
		assert.strictEqual(overflowFilter.label, 'Filter');
		assert.strictEqual(filterFocused, false);
		await overflowFilter.run();
		assert.strictEqual(filterFocused, true);

		const overflowSelectRepl = responsiveBehavior.getOverflowAction?.(selectReplAction, () => undefined)!;
		assert.ok(overflowSelectRepl);
		assert.strictEqual(overflowSelectRepl.id, 'workbench.action.debug.selectRepl');
		assert.strictEqual(overflowSelectRepl.label, 'Select Debug Console');
		assert.strictEqual(executedCommandId, undefined);
		await overflowSelectRepl.run();
		assert.strictEqual(executedCommandId, 'workbench.action.debug.selectDebugConsole');

		const overflowNormal = responsiveBehavior.getOverflowAction?.(normalAction, () => undefined);
		assert.strictEqual(overflowNormal, normalAction);
	});

	for (const presentation of ['', 'modern-ui modern-ui-tabs', 'modern-ui modern-ui-tabs modern-ui-compact']) {
		test(`production header layout resizes and prevents overlap without injected widths (${presentation || 'standard'})`, () => {
			root.className = `monaco-workbench ${presentation}`;
			const container = append(root, $('.part.panel'));

			class RealLayoutTestPanelPart extends PanelPart {
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

				protected override actionViewItemProvider(action: IAction, options: any): IActionViewItem | undefined {
					if (action.id === 'workbench.action.debug.selectRepl') {
						return new class extends BaseActionViewItem {
							constructor() { super(null, action); }
							override render(c: HTMLElement) {
								c.classList.add('select-container');
								c.style.width = '100px';
								c.style.minWidth = '60px';
								c.style.maxWidth = '170px';
								append(c, $('span', {}, 'Flutter (iPhone 18 Pro)'));
							}
						};
					}
					if (action.id === 'viewpane.action.filter') {
						return new class extends BaseActionViewItem {
							constructor() { super(null, action); }
							override render(c: HTMLElement) {
								c.classList.add('viewpane-filter-container');
								c.style.width = '160px';
								c.style.minWidth = '150px';
								c.style.maxWidth = '200px';
								append(c, $('input', { type: 'text', placeholder: 'Filter' }));
							}
						};
					}
					return super.actionViewItemProvider(action, options);
				}

				setTitleActions(primary: IAction[], secondary: IAction[]): void {
					this.toolBar?.setAriaLabel('Debug Console actions');
					this.toolBar?.setActions(primary, secondary);
				}

				get toolbar() {
					return this.toolBar!;
				}

				populateTabs(tabs: string[]) {
					const tabsContainer = container.querySelector<HTMLElement>('.composite-bar-container');
					if (!tabsContainer) {
						return;
					}
					const compositeBar = append(tabsContainer, $('.composite-bar'));
					const actionBar = append(compositeBar, $('.monaco-action-bar'));
					const actionsContainer = append(actionBar, $('ul.actions-container'));
					for (const tab of tabs) {
						const item = append(actionsContainer, $('li.action-item'));
						item.style.padding = '0 8px';
						const label = append(item, $('a.action-label'));
						label.textContent = tab;
					}
				}
			}

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

			const part = store.add(instantiationService.createInstance(RealLayoutTestPanelPart));
			part.create(container);
			part.populateTabs(['Problems', 'Output', 'Debug Console', 'Terminal', 'Ports']);

			const sessionPicker = store.add(new Action('workbench.action.debug.selectRepl', 'Select Debug Console'));
			const filterAction = store.add(new Action('viewpane.action.filter', ''));
			const searchAction = store.add(new Action('workbench.debug.panel.action.findRepl', 'Find'));
			const clearAction = store.add(new Action('workbench.debug.panel.action.clearReplAction', 'Clear Console'));
			part.setTitleActions([
				sessionPicker,
				filterAction,
				searchAction,
				clearAction,
			], [store.add(new Action('history', 'History'))]);

			const titleElement = container.querySelector<HTMLElement>('.composite.title')!;
			const tabsElement = container.querySelector<HTMLElement>('.composite-bar-container')!;
			const toolbarElement = container.querySelector<HTMLElement>('.title-actions')!;
			const globalActionsElement = container.querySelector<HTMLElement>('.global-actions')!;

			const getVisiblePrimaryActionIds = () => Array.from({ length: part.toolbar.getItemsLength() }, (_, i) => part.toolbar.getItemAction(i)?.id)
				.filter(id => id && id !== ToggleMenuAction.ID && id !== Separator.ID);

			// Exercise production resize pathway: ONLY part.layout(w, h, top, left)
			// 1. Wide width (850px)
			container.style.width = '850px';
			part.layout(850, 200, 0, 0);

			assert.deepStrictEqual(getVisiblePrimaryActionIds(), [
				'workbench.action.debug.selectRepl',
				'viewpane.action.filter',
				'workbench.debug.panel.action.findRepl',
				'workbench.debug.panel.action.clearReplAction',
			], 'All primary actions should fit at wide width (850px)');
			assert.ok(tabsElement.getBoundingClientRect().right <= toolbarElement.getBoundingClientRect().left + 0.5, 'Tabs should not overlap toolbar actions at wide width');
			assert.ok(toolbarElement.getBoundingClientRect().right <= globalActionsElement.getBoundingClientRect().left + 0.5, 'Toolbar actions should not overlap global actions at wide width');

			// 2. Narrow width (320px)
			container.style.width = '320px';
			part.layout(320, 200, 0, 0);

			assert.ok(getVisiblePrimaryActionIds().length < 4, 'Actions should overflow at narrow width (320px)');
			assert.ok(!getVisiblePrimaryActionIds().includes('workbench.debug.panel.action.clearReplAction'), 'Clear Console should overflow at narrow width');
			assert.ok(tabsElement.getBoundingClientRect().right <= toolbarElement.getBoundingClientRect().left + 0.5, 'Tabs should not overlap toolbar actions at narrow width');
			assert.ok(toolbarElement.getBoundingClientRect().right <= globalActionsElement.getBoundingClientRect().left + 0.5, 'Toolbar actions should not overlap global actions at narrow width');
			assert.ok(globalActionsElement.getBoundingClientRect().right <= titleElement.getBoundingClientRect().right + 0.5, 'Global actions should stay within title boundaries');

			// 3. Restored width (850px)
			container.style.width = '850px';
			part.layout(850, 200, 0, 0);

			assert.deepStrictEqual(getVisiblePrimaryActionIds(), [
				'workbench.action.debug.selectRepl',
				'viewpane.action.filter',
				'workbench.debug.panel.action.findRepl',
				'workbench.debug.panel.action.clearReplAction',
			], 'All primary actions should be restored at wide width (850px)');
			assert.ok(tabsElement.getBoundingClientRect().right <= toolbarElement.getBoundingClientRect().left + 0.5, 'Tabs should not overlap toolbar actions when restored');
			assert.ok(toolbarElement.getBoundingClientRect().right <= globalActionsElement.getBoundingClientRect().left + 0.5, 'Toolbar actions should not overlap global actions when restored');
		});
	}
});
