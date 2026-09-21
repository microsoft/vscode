/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ContextMenuHandler } from '../../../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { createServices } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { Menus } from '../../../../../browser/menus.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { AgentHostFilterContribution } from '../../browser/hostFilter.contribution.js';

suite('AgentHostFilterContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createPicker(menuId: MenuId) {
		const container = document.body.appendChild(document.createElement('div'));
		container.classList.add('monaco-workbench');
		disposables.add({ dispose: () => container.remove() });
		const changed = disposables.add(new Emitter<void>());
		const discovering = disposables.add(new Emitter<void>());
		let hosts: readonly IAgentHostFilterEntry[] = ['First', 'Second'].map(label => ({
			id: label, label, providerIds: [label], grouped: false, address: label,
			icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected, connectable: true,
		}));
		let selectedHostId = 'First';
		let isDiscovering = false;
		const filterService = upcastPartial<IAgentHostFilterService>({
			onDidChange: changed.event,
			onDidChangeDiscovering: discovering.event,
			get hosts() { return hosts; },
			get selectedHostId() { return selectedHostId; },
			get selectedHost() { return hosts.find(host => host.id === selectedHostId); },
			get isDiscovering() { return isDiscovering; },
			setSelectedHostId: id => { selectedHostId = id; changed.fire(); },
		});
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IActionViewItemService)?.[1];
		assert.ok(descriptor);
		const action = upcastPartial<MenuItemAction>({
			id: 'sessions.agentHostFilter.pick', label: 'Select Agent Host', enabled: true, run: async () => { },
		});
		const instantiationService = createServices(disposables.add(new DisposableStore()), [
			[IActionViewItemService, descriptor.ctor],
			[IAgentHostFilterService, filterService],
			[IContextViewService, ContextViewService],
			[IContextKeyService, MockContextKeyService],
			[IKeybindingService, MockKeybindingService],
			[IHoverService, NullHoverService],
			[ITelemetryService, NullTelemetryService],
			[ICommandService, upcastPartial<ICommandService>({})],
			[ILayoutService, upcastPartial<ILayoutService>({
				mainContainer: container, activeContainer: container,
				getContainer: () => container, onDidLayoutContainer: Event.None,
			})],
			[IMenuService, upcastPartial<IMenuService>({
				createMenu: () => ({
					onDidChange: Event.None, getActions: () => [['navigation', [action]]], dispose: () => { },
				}),
			})],
		]);
		const contextView = instantiationService.get(IContextViewService);
		const handler = new ContextMenuHandler(contextView, NullTelemetryService, new TestNotificationService(), instantiationService.get(IKeybindingService));
		instantiationService.stub(IContextMenuService, {
			onDidShowContextMenu: Event.None,
			onDidHideContextMenu: Event.None,
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				handler.showContextMenu({ ...delegate, getActions: delegate.getActions });
			},
		});
		disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, container, menuId, undefined));
		assert.strictEqual(container.querySelector('.agent-host-filter-combo'), null);
		disposables.add(instantiationService.createInstance(AgentHostFilterContribution));
		await Promise.resolve();
		assert.ok(container.querySelector('.agent-host-filter-combo'), 'cold-start registration replaces the default action view item');
		disposables.add({ dispose: () => contextView.hideContextView() });
		return {
			container, contextView, filterService,
			updateStatus: () => {
				hosts = hosts.map(host => ({ ...host, status: AgentHostFilterConnectionStatus.Connecting }));
				changed.fire();
			},
			setDiscovering: (value: boolean) => { isDiscovering = value; discovering.fire(); },
			removeHost: (id: string) => {
				hosts = hosts.filter(host => host.id !== id);
				changed.fire();
			},
		};
	}

	test('sidebar menu survives host and discovery updates and still selects a host', async () => {
		const { container, contextView, filterService, updateStatus, setDiscovering } = await createPicker(Menus.SidebarAgentHost);
		const button = container.querySelector<HTMLElement>('.agent-host-filter-button');
		assert.ok(button);
		button.click();
		const menu = contextView.getContextViewElement().querySelector<HTMLElement>('[role="menu"]');
		assert.ok(menu?.isConnected);

		updateStatus();
		setDiscovering(true);
		assert.deepStrictEqual({
			sameButton: container.querySelector('.agent-host-filter-button') === button,
			menuConnected: menu.isConnected,
			discovering: button.classList.contains('discovering'),
			connecting: !!container.querySelector('.agent-host-filter-connect.connecting'),
		}, { sameButton: true, menuConnected: true, discovering: true, connecting: true });
		setDiscovering(false);
		assert.ok(menu.isConnected);
		assert.ok(!button.classList.contains('discovering'));

		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		menu.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
		await Promise.resolve();
		assert.strictEqual(filterService.selectedHostId, 'Second');
	});

	test('mobile sheet survives host and discovery updates with live status', async () => {
		const { container, updateStatus, setDiscovering } = await createPicker(Menus.MobileTitleBarCenter);
		const button = container.querySelector<HTMLElement>('.agent-host-filter-dropdown');
		assert.ok(button);
		button.click();
		const sheet = container.querySelector<HTMLElement>('.host-picker-sheet');
		assert.ok(sheet);
		assert.strictEqual(document.activeElement, sheet.querySelector('[aria-checked="true"]'));

		updateStatus();
		setDiscovering(true);
		assert.deepStrictEqual({
			sameButton: container.querySelector('.agent-host-filter-dropdown') === button,
			sameSheet: container.querySelector('.host-picker-sheet') === sheet,
			connected: sheet.isConnected,
			discovering: button.classList.contains('discovering'),
			hasConnectingStatus: sheet.textContent?.includes('Connecting'),
			selectedHostFocused: document.activeElement === sheet.querySelector('[aria-checked="true"]'),
		}, { sameButton: true, sameSheet: true, connected: true, discovering: true, hasConnectingStatus: true, selectedHostFocused: true });
		setDiscovering(false);
		assert.ok(sheet.isConnected);
		assert.strictEqual(document.activeElement, sheet.querySelector('[aria-checked="true"]'));
	});

	test('mobile updates preserve the focused unselected host without stealing focus from other controls', async () => {
		const { container, updateStatus, setDiscovering } = await createPicker(Menus.MobileTitleBarCenter);
		const button = container.querySelector<HTMLElement>('.agent-host-filter-dropdown');
		assert.ok(button);
		button.click();
		const sheet = container.querySelector<HTMLElement>('.host-picker-sheet');
		assert.ok(sheet);
		const secondHost = () => {
			const row = sheet.querySelector<HTMLElement>('[aria-checked="false"]');
			assert.ok(row);
			return row;
		};
		secondHost().focus();
		updateStatus();
		assert.strictEqual(document.activeElement, secondHost());
		setDiscovering(true);
		assert.strictEqual(document.activeElement, secondHost());
		setDiscovering(false);
		assert.strictEqual(document.activeElement, secondHost());

		for (const selector of ['.host-picker-sheet-action', '.host-picker-sheet-information', '.host-picker-sheet-close:not(.host-picker-sheet-information)']) {
			const control: HTMLElement | null = sheet.querySelector<HTMLElement>(selector);
			assert.ok(control);
			control.focus();
			updateStatus();
			setDiscovering(true);
			setDiscovering(false);
			assert.strictEqual(document.activeElement, control);
		}

		const outside = container.appendChild(document.createElement('button'));
		outside.focus();
		updateStatus();
		assert.strictEqual(document.activeElement, outside);
	});

	test('mobile focus falls back inside the sheet when the focused host disappears', async () => {
		const { container, removeHost } = await createPicker(Menus.MobileTitleBarCenter);
		const button = container.querySelector<HTMLElement>('.agent-host-filter-dropdown');
		assert.ok(button);
		button.click();
		const sheet = container.querySelector<HTMLElement>('.host-picker-sheet');
		assert.ok(sheet);
		const secondHost = sheet.querySelector<HTMLElement>('[aria-checked="false"]');
		assert.ok(secondHost);
		secondHost.focus();
		removeHost('Second');
		assert.strictEqual(document.activeElement, sheet.querySelector('[aria-checked="true"]'));
		removeHost('First');
		assert.strictEqual(document.activeElement, sheet.querySelector('.host-picker-sheet-action'));
	});
});
