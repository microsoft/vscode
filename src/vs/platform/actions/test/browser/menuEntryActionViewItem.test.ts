/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { $, append, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { Menu, unthemedMenuStyles } from '../../../../base/browser/ui/menu/menu.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { toAction } from '../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ContextMenuService } from '../../../contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewDelegate, IContextViewService } from '../../../contextview/browser/contextView.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../notification/common/notification.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { DropdownWithDefaultActionViewItem, getFlatContextMenuActions } from '../../browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../common/actions.js';

suite('Context menu alternative actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const modifier of ['Alt', 'Shift'] as const) {
		test(`HTML context menus retain ${modifier} at opening and update without hover`, () => {
			const modifiers = ModifierKeyEmitter.getInstance();
			modifiers.resetKeyStatus();
			disposables.add(toDisposable(() => modifiers.resetKeyStatus()));
			const host = append(mainWindow.document.body, $('div'));
			disposables.add(toDisposable(() => host.remove()));
			let hide: (() => void) | undefined;
			const contextViewService = new class extends mock<IContextViewService>() {
				override showContextView(delegate: IContextViewDelegate) {
					const rendered = disposables.add(delegate.render(host));
					hide = () => {
						rendered.dispose();
						delegate.onHide?.(true);
					};
					return { close: () => this.hideContextView() };
				}
				override hideContextView() {
					const onHide = hide;
					hide = undefined;
					onHide?.();
				}
			};
			const service = disposables.add(new ContextMenuService(NullTelemetryService, new TestNotificationService(), contextViewService, new MockKeybindingService(), new class extends mock<IMenuService>() { }, new MockContextKeyService()));
			service.configure({ blockMouse: false });
			const action = toAction({ id: 'primary', label: 'Primary', run: () => { }, alt: toAction({ id: 'alternative', label: 'Alternative', run: () => { } }) });
			const press = () => mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16, altKey: modifier === 'Alt', shiftKey: modifier === 'Shift' }));
			press();
			service.showContextMenu({ getAnchor: () => host, getActions: () => [action] });
			const labels = [host.querySelector('.action-label')?.textContent];
			mainWindow.dispatchEvent(new KeyboardEvent('keyup', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16 }));
			labels.push(host.querySelector('.action-label')?.textContent);
			press();
			labels.push(host.querySelector('.action-label')?.textContent);
			contextViewService.hideContextView();
			const alternative = modifier === 'Alt' || isWindows || isLinux ? 'Alternative' : 'Primary';
			assert.deepStrictEqual({ labels, altKey: modifiers.keyStatus.altKey, shiftKey: modifiers.keyStatus.shiftKey }, {
				labels: [alternative, 'Primary', alternative], altKey: false, shiftKey: false
			});
		});
	}

	for (const altAtOpen of [false, true]) {
		for (const altAtActivation of [false, true]) {
			test(`Alt at open: ${altAtOpen}, Alt at activation: ${altAtActivation}`, async () => {
				const modifiers = ModifierKeyEmitter.getInstance();
				const commands: unknown[][] = [];
				const action = new MenuItemAction(
					{ id: 'primary', title: 'Primary' },
					{ id: 'alternative', title: 'Alternative' },
					{ args: ['source'] }, undefined, undefined, new MockContextKeyService(),
					new class extends mock<ICommandService>() {
						override async executeCommand<T>(...args: unknown[]): Promise<T | undefined> {
							commands.push(args);
							return undefined;
						}
					}
				);
				mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', keyCode: 18, altKey: altAtOpen }));
				try {
					const actions = getFlatContextMenuActions([['navigation', [action]]]);
					const host = append(mainWindow.document.body, $('div'));
					disposables.add(toDisposable(() => host.remove()));
					const menu = disposables.add(new Menu(host, actions, {}, unthemedMenuStyles));
					menu.focus(true);
					const labelAtOpen = host.querySelector('.action-label')?.textContent;
					mainWindow.dispatchEvent(new KeyboardEvent(altAtActivation ? 'keydown' : 'keyup', { key: 'Alt', keyCode: 18, altKey: altAtActivation }));
					const labelAtActivation = host.querySelector('.action-label')?.textContent;
					host.querySelector<HTMLElement>('.action-item')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, altKey: altAtActivation, bubbles: true }));
					await Promise.resolve();
					assert.deepStrictEqual({ labelAtOpen, labelAtActivation, commands }, {
						labelAtOpen: altAtOpen ? 'Alternative' : 'Primary',
						labelAtActivation: altAtActivation ? 'Alternative' : 'Primary',
						commands: [[altAtActivation ? 'alternative' : 'primary', 'source']]
					});
				} finally {
					modifiers.resetKeyStatus();
				}
			});
		}
	}
});

suite('DropdownWithDefaultActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IFixture {
		readonly storageService: InMemoryStorageService;
		readonly executed: string[];
		completePending(): void;
		createItem(togglePrimaryAction?: boolean): DropdownWithDefaultActionViewItem;
		runFromDropdown(item: DropdownWithDefaultActionViewItem, actionId: string): Promise<void>;
		clickPrimary(item: DropdownWithDefaultActionViewItem): Promise<void>;
	}

	function createFixture(slowCommandIds: readonly string[] = []): IFixture {
		const storageService = disposables.add(new InMemoryStorageService());
		const executed: string[] = [];
		const pending: DeferredPromise<void>[] = [];
		const commandService = new class extends mock<ICommandService>() {
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<T>(id: string): Promise<T | undefined> {
				executed.push(id);
				if (slowCommandIds.includes(id)) {
					const deferred = new DeferredPromise<void>();
					pending.push(deferred);
					await deferred.p;
				}
				return undefined;
			}
		};
		let menuDelegate: IContextMenuDelegate | undefined;
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(delegate: IContextMenuDelegate): void {
				menuDelegate = delegate;
			}
		};
		const contextKeyService = new MockContextKeyService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IContextMenuService, contextMenuService);
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() { });
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());

		const actions = ['first', 'second'].map(id => new MenuItemAction({ id, title: id }, undefined, undefined, undefined, undefined, contextKeyService, commandService));
		const submenu = new MenuId(`test.dropdownWithDefault.${generateUuid()}`);

		const completePending = () => {
			for (const deferred of pending.splice(0)) {
				deferred.complete();
			}
		};

		return {
			storageService,
			executed,
			completePending,
			createItem: (togglePrimaryAction = true) => {
				const submenuAction = new SubmenuItemAction({ title: 'Run', submenu, isSplitButton: { togglePrimaryAction: true } }, undefined, actions);
				const item = instantiationService.createInstance(DropdownWithDefaultActionViewItem, submenuAction, { togglePrimaryAction });
				const container = append(mainWindow.document.body, $('div'));
				disposables.add(toDisposable(() => container.remove()));
				item.render(container);
				return item;
			},
			runFromDropdown: async (item, actionId) => {
				menuDelegate = undefined;
				item.focus(true);
				const label = item.element!.querySelector<HTMLElement>('.dropdown-action-container .action-label')!;
				label.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
				const delegate = menuDelegate as IContextMenuDelegate | undefined;
				assert.ok(delegate?.actionRunner, 'dropdown did not open a context menu with an action runner');
				delegate.onHide?.(false);
				await delegate.actionRunner.run(actions.find(action => action.id === actionId)!);
			},
			clickPrimary: async item => {
				const label = item.element!.querySelector<HTMLElement>('.action-container .action-label')!;
				label.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
				completePending();
				await timeout(0);
			}
		};
	}

	test('keeps the selected action when the toolbar recreates the item while the action is still running', async () => {
		const fixture = createFixture(['second']);
		const item = fixture.createItem();

		const run = fixture.runFromDropdown(item, 'second');
		// A slow command changes context, the editor title toolbar rebuilds and disposes this item.
		item.dispose();
		fixture.completePending();
		await run;

		const recreated = disposables.add(fixture.createItem());
		await fixture.clickPrimary(recreated);

		assert.deepStrictEqual({
			stored: fixture.storageService.get(`${recreated.action.id.replace('submenuitem.', '')}_lastActionId`, StorageScope.WORKSPACE),
			executed: fixture.executed
		}, {
			stored: 'second',
			executed: ['second', 'second']
		});
	});

	test('makes the selected action primary while it is still running', async () => {
		const fixture = createFixture(['second']);
		const item = disposables.add(fixture.createItem());

		const run = fixture.runFromDropdown(item, 'second');
		// Clicking completes every pending command, so the primary was already swapped while the dropdown run was in flight.
		await fixture.clickPrimary(item);
		await run;

		assert.deepStrictEqual(fixture.executed, ['second', 'second']);
	});

	test('uses the first action by default and only restores known persisted actions when toggling', async () => {
		const fixture = createFixture();
		const submenuKey = (item: DropdownWithDefaultActionViewItem) => `${item.action.id.replace('submenuitem.', '')}_lastActionId`;

		const fresh = disposables.add(fixture.createItem());
		await fixture.clickPrimary(fresh);

		fixture.storageService.store(submenuKey(fresh), 'removed', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const unknown = disposables.add(fixture.createItem());
		await fixture.clickPrimary(unknown);

		fixture.storageService.store(submenuKey(fresh), 'second', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const notToggling = disposables.add(fixture.createItem(false));
		await fixture.clickPrimary(notToggling);
		const toggling = disposables.add(fixture.createItem());
		await fixture.clickPrimary(toggling);

		assert.deepStrictEqual(fixture.executed, ['first', 'first', 'first', 'second']);
	});
});
