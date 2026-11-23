/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../base/browser/dom.js';
import { ToggleMenuAction } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { Separator } from '../../../../base/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestAuxiliaryBarPart, testAuxiliaryBarGlobalActionsMenu } from './auxiliaryBarTestUtils.js';
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { AuxiliaryBarMaximizedContext, AuxiliaryBarMaximizeHiddenContext, ChatPartEnabledContext, ChatPartVisibleContext } from '../../../common/contextkeys.js';
import '../../../browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { AuxiliaryBarPart } from '../../../browser/parts/auxiliarybar/auxiliaryBarPart.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';

import '../../../browser/media/part.css';
import '../../../contrib/modernUI/browser/media/padding.css';
import '../../../contrib/modernUI/browser/media/fontRamp.css';
import '../../../contrib/modernUI/browser/media/tabs.css';

suite('Auxiliary Bar - Responsive title actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;

	setup(() => {
		root = append(document.body, $('.monaco-workbench'));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
	});

	teardown(() => root.remove());

	for (const presentation of ['', 'modern-ui modern-ui-tabs', 'modern-ui modern-ui-tabs modern-ui-compact']) {
		test(`overflows New Chat before Settings and restores them in reverse order (${presentation || 'standard'})`, () => {
			root.className = `monaco-workbench ${presentation}`;
			const container = append(root, $('.part.auxiliarybar'));
			const part = createTestAuxiliaryBarPart(container, store);

			const states = [];
			for (const [containerWidth, toolbarWidth] of [[300, 120], [185, 80], [140, 50], [185, 80], [300, 120]]) {
				container.style.width = `${containerWidth}px`;
				part.setToolbarAvailableWidth(toolbarWidth);
				part.layout(containerWidth, 200, 0, 0);
				part.toolbar.relayout();
				const title = container.querySelector('h2')!;
				const firstAction = part.toolbar.getItemElement(0)!;
				const lastAction = part.toolbar.getItemElement(part.toolbar.getItemsLength() - 1)!;
				const globalActions = container.querySelector('.global-actions')!;
				states.push({
					actions: Array.from({ length: part.toolbar.getItemsLength() }, (_, index) => part.toolbar.getItemAction(index)?.id),
					separatorWidth: part.toolbar.getItemWidth(part.toolbar.getItemsLength() - 1),
					titleVisible: title.textContent === 'Chat' && title.clientWidth >= title.scrollWidth,
					overlap: title.getBoundingClientRect().right > firstAction.getBoundingClientRect().left + 0.5 || lastAction.getBoundingClientRect().right > globalActions.getBoundingClientRect().left + 0.5,
					globalActionsVisible: ['.codicon-screen-full', '.codicon-close'].every(selector => {
						const action = container.querySelector<HTMLElement>(`.global-actions ${selector}`);
						return action !== null && action.getBoundingClientRect().width > 0;
					}),
				});
			}
			const separatorWidth = states[0].separatorWidth;
			assert.deepStrictEqual(states, [
				{ actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: [ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
			]);
		});
	}

	test('shows the separator after its view\'s title actions only while actions of its own follow them, as they come and go, and lays the actions out without it while hidden', () => runWithFakedTimers({}, async () => {
		const container = append(root, $('.part.auxiliarybar'));
		const part = createTestAuxiliaryBarPart(container, store, { globalActions: false });
		const state = () => {
			const separator = part.toolbar.getItemElement(part.toolbar.getItemsLength() - 1)!;
			return {
				separatorShown: getWindow(separator).getComputedStyle(separator).display !== 'none',
				actions: Array.from({ length: part.toolbar.getItemsLength() }, (_, index) => part.toolbar.getItemAction(index)?.id),
				minWidth: part.toolbar.getElement().style.minWidth,
			};
		};
		const layout = (toolbarWidth: number) => {
			container.style.width = '300px';
			part.setToolbarAvailableWidth(toolbarWidth);
			part.layout(300, 200, 0, 0);
			part.toolbar.relayout();
		};
		layout(300);
		// The toolbar reserves the width of its separator only while it shows
		const withoutOwnActions = state();

		// Menus report their changes debounced
		const close = store.add(MenuRegistry.appendMenuItem(testAuxiliaryBarGlobalActionsMenu, { command: { id: 'test.close', title: 'Hide Secondary Side Bar', icon: Codicon.close }, group: 'navigation' }));
		await timeout(1000);
		const withOwnActions = state();
		close.dispose();
		await timeout(1000);
		const afterTheyGo = state();

		assert.deepStrictEqual({ withoutOwnActions, withOwnActions, afterTheyGo }, {
			withoutOwnActions: { separatorShown: false, actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], minWidth: '24px' },
			withOwnActions: { separatorShown: true, actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], minWidth: '37px' },
			afterTheyGo: { separatorShown: false, actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], minWidth: '24px' },
		});
	}));
});

suite('Auxiliary Bar - Maximize action', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IState { readonly claim: boolean; readonly maximized: boolean; readonly chatPartEnabled: boolean; readonly chatPartVisible: boolean }

	const normal: IState = { claim: false, maximized: false, chatPartEnabled: false, chatPartVisible: false };

	/** Whether the title menu offers the toggle, and whether the maximize and toggle commands are enabled. */
	function availability(state: IState) {
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		AuxiliaryBarMaximizeHiddenContext.bindTo(contextKeyService).set(state.claim);
		AuxiliaryBarMaximizedContext.bindTo(contextKeyService).set(state.maximized);
		ChatPartEnabledContext.bindTo(contextKeyService).set(state.chatPartEnabled);
		ChatPartVisibleContext.bindTo(contextKeyService).set(state.chatPartVisible);
		const item = MenuRegistry.getMenuItems(MenuId.AuxiliaryBarTitle).filter(isIMenuItem).find(i => i.command.id === 'workbench.action.toggleMaximizedAuxiliaryBar');
		const enabled = (id: string) => contextKeyService.contextMatchesRules(MenuRegistry.getCommand(id)?.precondition);
		return {
			menu: !!item && contextKeyService.contextMatchesRules(item.when),
			maximize: enabled('workbench.action.maximizeAuxiliaryBar'),
			toggle: enabled('workbench.action.toggleMaximizedAuxiliaryBar'),
		};
	}

	test('is offered normally, and when the chat part is only registered but not shown', () => {
		assert.deepStrictEqual({
			normal: availability(normal),
			registeredButHidden: availability({ ...normal, chatPartEnabled: true }),
		}, {
			normal: { menu: true, maximize: true, toggle: true },
			registeredButHidden: { menu: true, maximize: true, toggle: true },
		});
	});

	test('is not offered while the chat part is shown or the view container does not offer to maximize, except to restore while maximized', () => {
		assert.deepStrictEqual({
			chatPartVisible: availability({ ...normal, chatPartEnabled: true, chatPartVisible: true }),
			claim: availability({ ...normal, claim: true }),
			restoreWhileMaximized: availability({ ...normal, claim: true, chatPartEnabled: true, chatPartVisible: true, maximized: true }),
		}, {
			chatPartVisible: { menu: false, maximize: false, toggle: false },
			claim: { menu: false, maximize: false, toggle: false },
			restoreWhileMaximized: { menu: true, maximize: false, toggle: true },
		});
	});
});

suite('Auxiliary Bar - Auto-hide view container bar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
	const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

	class AutoHideAuxiliaryBarPart extends AuxiliaryBarPart {
		get compositeBarShown(): boolean {
			return this.shouldShowCompositeBar();
		}
	}

	function registerContainerWithView() {
		const id = `test.autoHide.${generateUuid()}`;
		// eslint-disable-next-line local/code-no-any-casts
		const container = viewContainersRegistry.registerViewContainer({ id, title: localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.AuxiliaryBar);
		// eslint-disable-next-line local/code-no-any-casts
		const views: IViewDescriptor[] = [{ id: `${id}.view`, name: localize2('view', 'view'), ctorDescriptor: new SyncDescriptor(<any>{}) }];
		viewsRegistry.registerViews(views, container);
		store.add(toDisposable(() => {
			viewsRegistry.deregisterViews(views, container);
			viewContainersRegistry.deregisterViewContainer(container);
		}));
	}

	function createPartFactory(parts: DisposableStore) {
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IViewDescriptorService, store.add(instantiationService.createInstance(ViewDescriptorService)));
		return (location: string, autoHide: boolean) => {
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { activityBar: { location, autoHide } } }));
			return parts.add(instantiationService.createInstance(AutoHideAuxiliaryBarPart));
		};
	}

	test('hides the bar with a single view container irrespective of the activity bar location, shows it with more', () => {
		const parts = store.add(new DisposableStore());
		const createPart = createPartFactory(parts);
		registerContainerWithView();
		const single = ['default', 'top', 'bottom', 'hidden'].map(location => createPart(location, true).compositeBarShown);
		const withoutAutoHide = createPart('default', false).compositeBarShown;

		parts.clear();
		registerContainerWithView();
		const several = ['default', 'top', 'bottom', 'hidden'].map(location => createPart(location, true).compositeBarShown);

		assert.deepStrictEqual({ single, withoutAutoHide, several }, {
			single: [false, false, false, false],
			withoutAutoHide: true,
			several: [true, true, true, false],
		});
	});
});
