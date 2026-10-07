/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension, getWindow } from '../../../base/browser/dom.js';
import { toAction } from '../../../base/common/actions.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IListService, WorkbenchList } from '../../../platform/list/browser/listService.js';
import { INotificationService, IPromptChoiceWithMenu, NotificationPriority, NotificationsFilter, Severity } from '../../../platform/notification/common/notification.js';
import { NotificationActionTelemetryId, NotificationTelemetryId, withNotificationActionTelemetry } from '../../../platform/notification/common/notificationTelemetry.js';
import { NotificationText } from '../../../platform/notification/common/notificationMessage.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { ClearNotificationAction } from '../../browser/parts/notifications/notificationsActions.js';
import { NotificationsCenter } from '../../browser/parts/notifications/notificationsCenter.js';
import { ACCEPT_PRIMARY_ACTION_NOTIFICATION, CLEAR_ALL_NOTIFICATIONS, CLEAR_NOTIFICATION, COLLAPSE_NOTIFICATION, EXPAND_NOTIFICATION, NotificationActionRunner, registerNotificationCommands } from '../../browser/parts/notifications/notificationsCommands.js';
import { NotificationsToasts } from '../../browser/parts/notifications/notificationsToasts.js';
import { NotificationService } from '../../services/notification/common/notificationService.js';
import { TestNotificationTelemetryService } from '../common/testNotificationTelemetry.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { logNotificationShown } from '../../common/notificationTelemetry.js';
import { ChoiceAction } from '../../common/notifications.js';

suite('Notification telemetry UI', () => {
	suiteSetup(async () => {
		const warmup = new DisposableStore();
		try {
			const ui = await createUI(warmup);
			ui.notifications.notify({ severity: Severity.Error, message: 'Warmup' });
			await ui.render();
		} finally {
			warmup.dispose();
		}
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createUI(resources = store) {
		const container = document.createElement('div');
		container.classList.add('monaco-workbench');
		container.style.cssText = 'position: fixed; inset: 0;';
		document.body.appendChild(container);
		resources.add(toDisposable(() => container.remove()));
		const targetWindow = getWindow(container);
		const instantiation = workbenchInstantiationService(undefined, resources);
		const storage = resources.add(new InMemoryStorageService());
		const notifications = resources.add(new NotificationService(storage));
		resources.add(toDisposable(() => {
			for (const item of [...notifications.model.notifications]) {
				item.close();
			}
		}));
		const telemetry = new TestNotificationTelemetryService();
		const menus: Parameters<IContextMenuService['showContextMenu']>[0][] = [];
		const lists: NonNullable<IListService['lastFocusedList']>[] = [];
		instantiation.stub(INotificationService, notifications);
		instantiation.stub(ITelemetryService, telemetry);
		const listService = {
			get lastFocusedList() { return lists.at(-1); },
			register: (list: NonNullable<IListService['lastFocusedList']>) => {
				lists.push(list);
				return toDisposable(() => lists.splice(lists.indexOf(list), 1));
			}
		};
		instantiation.stub(IListService, listService);
		instantiation.stub(IContextMenuService, {
			onDidShowContextMenu: Event.None,
			onDidHideContextMenu: Event.None,
			showContextMenu: delegate => menus.push(delegate)
		});
		const center = resources.add(instantiation.createInstance(NotificationsCenter, container, notifications.model));
		const toasts = resources.add(instantiation.createInstance(NotificationsToasts, container, notifications.model));
		resources.add(center.onDidChangeVisibility(() => toasts.update(center.isVisible)));
		resources.add(registerNotificationCommands(center, toasts, notifications.model));
		const execute = (id: string, ...args: unknown[]) => {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command, id);
			return instantiation.invokeFunction(accessor => command.handler(accessor, ...args));
		};
		instantiation.stub(ICommandService, {
			executeCommand: async (id: string, ...args: unknown[]) => {
				await execute(id, ...args);
				return undefined;
			}
		});
		const dimensions = new Dimension(targetWindow.innerWidth, targetWindow.innerHeight);
		toasts.layout(dimensions);
		center.layout(dimensions);
		await Promise.resolve();

		return {
			container, instantiation, notifications, storage, telemetry, center, toasts, execute, dimensions, menus,
			render: async () => {
				await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
				await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
			}
		};
	}

	test('a notification removed before the rendering frame has no exposure', async () => {
		const ui = await createUI();
		const handle = ui.notifications.notify({ severity: Severity.Info, message: 'Short-lived', telemetry: NotificationTelemetryId.ExtensionInstall });
		assert.deepStrictEqual(ui.telemetry.events, []);
		handle.close();
		await ui.render();
		assert.deepStrictEqual(ui.telemetry.events, []);
	});

	test('a notification added to an initially empty center receives one exposure', async () => {
		const ui = await createUI();
		ui.center.show();
		await ui.render();
		const emptyExposures = [...ui.telemetry.shown];
		ui.notifications.notify({ severity: Severity.Info, message: 'Arrived while open', telemetry: NotificationTelemetryId.ExtensionsDisabled });
		await ui.render();
		ui.center.layout(ui.dimensions);
		await ui.render();
		await ui.execute(CLEAR_NOTIFICATION, ui.notifications.model.notifications[0]);
		assert.deepStrictEqual({
			emptyExposures,
			surfaces: ui.telemetry.shown.map(event => event.surface),
			interactions: ui.telemetry.interactions.map(event => [event.interaction, event.surface, Number(event.timeSinceShownMs) >= 0])
		}, { emptyExposures: [], surfaces: ['center'], interactions: [['dismiss', 'center', true]] });
	});

	test('DND, silent and never-show-again notifications have no toast exposure; center exposure is separate', async () => {
		const ui = await createUI();
		ui.storage.store('neverAgain', true, StorageScope.APPLICATION, StorageTarget.USER);
		ui.notifications.notify({ severity: Severity.Info, message: 'Never shown', neverShowAgain: { id: 'neverAgain' } });
		ui.notifications.setFilter(NotificationsFilter.ERROR);
		ui.notifications.notify({ severity: Severity.Info, message: 'DND', telemetry: NotificationTelemetryId.ExtensionsDisabled });
		ui.notifications.notify({ severity: Severity.Error, message: 'Silent', priority: NotificationPriority.SILENT });
		await ui.render();
		const beforeCenter = [...ui.telemetry.events];
		ui.center.show();
		await ui.render();
		assert.deepStrictEqual({ beforeCenter, surfaces: ui.telemetry.shown.map(event => event.surface), interactions: ui.telemetry.interactions }, {
			beforeCenter: [], surfaces: ['center', 'center'], interactions: []
		});
	});

	test('toast measurement, repeated layout, updates, dedup and center re-show do not duplicate exposures', async () => {
		const ui = await createUI();
		ui.toasts.layout(new Dimension(ui.dimensions.width, 1));
		for (let index = 0; index < 3; index++) {
			ui.notifications.notify({ severity: Severity.Error, message: `Notice ${index}`, id: `dedup${index}`, telemetry: NotificationTelemetryId.ExtensionInstall, sticky: true });
		}
		await ui.render();
		const measured = [...ui.telemetry.shown];
		ui.toasts.layout(ui.dimensions);
		await ui.render();
		const firstInstances = ui.telemetry.shown.map(event => event.instanceId);
		ui.notifications.model.notifications[0].updateMessage('Updated content');
		ui.toasts.layout(ui.dimensions);
		await ui.render();
		ui.notifications.notify({ severity: Severity.Error, message: 'Notice 2', id: 'dedup2', telemetry: NotificationTelemetryId.ExtensionInstall, sticky: true });
		await ui.render();
		ui.center.show();
		await ui.render();
		ui.center.hide();
		ui.center.show();
		await ui.render();
		assert.deepStrictEqual({
			measured,
			surfaces: ui.telemetry.shown.map(event => event.surface),
			instances: new Set(ui.telemetry.shown.map(event => event.instanceId)).size,
			initialCount: firstInstances.length,
			interactions: ui.telemetry.interactions
		}, {
			measured: [],
			surfaces: ['toast', 'toast', 'toast', 'center', 'center', 'center'],
			instances: 3,
			initialCount: 3,
			interactions: []
		});
	});

	test('center exposures count intersecting rows, not all model entries or overscan, and follow scrolling', async () => {
		const ui = await createUI();
		for (let index = 0; index < 25; index++) {
			ui.notifications.notify({ severity: Severity.Info, message: `Notice ${index}`, priority: NotificationPriority.SILENT });
		}
		ui.center.show();
		await ui.render();
		const list = ui.instantiation.invokeFunction(accessor => accessor.get(IListService).lastFocusedList);
		assert.ok(list instanceof WorkbenchList);
		const bounds = list.getHTMLElement().getBoundingClientRect();
		const visibleRows = [...ui.container.querySelectorAll('.monaco-list-row')].filter(row => {
			const rowBounds = row.getBoundingClientRect();
			return rowBounds.bottom > Math.max(bounds.top, 0) && rowBounds.top < Math.min(bounds.bottom, getWindow(ui.container).innerHeight);
		}).length;
		const initialCount = ui.telemetry.shown.length;
		for (let top = 0; top < list.scrollHeight; top += list.renderHeight - 10) {
			list.scrollTop = top;
			await ui.render();
		}
		assert.deepStrictEqual({
			initialMatchesViewport: initialCount === visibleRows,
			initialIsPartial: initialCount > 0 && initialCount < 25,
			finalCount: ui.telemetry.shown.length,
			uniqueCount: new Set(ui.telemetry.shown.map(event => event.instanceId)).size
		}, { initialMatchesViewport: true, initialIsPartial: true, finalCount: 25, uniqueCount: 25 });
	});

	test('mouse and keyboard primary buttons each produce one invocation alongside unchanged legacy telemetry', async () => {
		const ui = await createUI();
		let invoked = 0;
		ui.notifications.prompt(Severity.Info, 'Prompt', [{
			label: 'Continue', telemetryId: NotificationActionTelemetryId.Continue, keepOpen: true, run: () => invoked++
		}], { telemetry: NotificationTelemetryId.AuthenticationContinue, priority: NotificationPriority.SILENT });
		ui.center.show();
		await ui.render();
		const button = ui.container.querySelector<HTMLElement>('.notification-list-item-buttons-container .monaco-button');
		assert.ok(button);
		logNotificationShown(ui.telemetry, ui.notifications.model.notifications[0], 'accessibleView');
		button.click();
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await Promise.resolve();
		assert.deepStrictEqual({
			invoked,
			actions: ui.telemetry.interactions.map(event => [event.interaction, event.actionId, event.surface]),
			legacy: ui.telemetry.events.filter(event => event.eventName === 'workbenchActionExecuted').map(event => event.data)
		}, {
			invoked: 2,
			actions: [['primaryAction', 'continue', 'center'], ['primaryAction', 'continue', 'center']],
			legacy: [{ id: 'workbench.dialog.choice.0', from: 'message' }, { id: 'workbench.dialog.choice.0', from: 'message' }]
		});
	});

	test('secondary menu actions retain the notification context without logging the label or arbitrary action ID', async () => {
		const ui = await createUI();
		let invoked = 0;
		const secondary = withNotificationActionTelemetry(toAction({ id: 'private command', label: 'Private label', run: () => invoked++ }), NotificationActionTelemetryId.Reload);
		ui.notifications.notify({ severity: Severity.Info, message: 'Notice', actions: { secondary: [secondary] }, priority: NotificationPriority.SILENT });
		const item = ui.notifications.model.notifications[0];
		ui.center.show();
		await ui.render();
		const gear = ui.container.querySelector<HTMLElement>('.codicon-notifications-configure');
		assert.ok(gear);
		gear.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		const menu = ui.menus.at(-1);
		assert.ok(menu);
		assert.ok(menu.getActions?.().includes(secondary));
		assert.strictEqual(menu.getActionsContext?.(), item);
		await menu.actionRunner!.run(secondary, menu.getActionsContext?.());
		assert.deepStrictEqual({
			invoked,
			events: ui.telemetry.interactions.map(event => [event.interaction, event.actionRole, event.actionId]),
			containsPrivate: JSON.stringify(ui.telemetry.interactions).includes('private')
		}, { invoked: 1, events: [['secondaryAction', 'secondary', 'reload']], containsPrivate: false });
	});

	test('primary dropdown choices and the wrapped primary action each produce only one contextual invocation', async () => {
		const ui = await createUI();
		const invoked: string[] = [];
		const choices: IPromptChoiceWithMenu[] = [{
			label: 'Continue', isSecondary: false, telemetryId: NotificationActionTelemetryId.Continue, run: () => invoked.push('primary'),
			menu: [{ label: 'Decline', telemetryId: NotificationActionTelemetryId.Decline, keepOpen: true, run: () => invoked.push('menu') }]
		}];
		ui.notifications.prompt(Severity.Info, 'Prompt', choices, { priority: NotificationPriority.SILENT });
		const action = ui.notifications.model.notifications[0].actions!.primary![0];
		assert.ok(action instanceof ChoiceAction);
		for (const choice of action.menu!) {
			store.add(choice);
		}
		ui.center.show();
		await ui.render();
		ui.container.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		const menu = ui.menus.at(-1)!;
		const actions = menu.getActions!();
		await menu.actionRunner!.run(actions[1]);
		await menu.actionRunner!.run(actions[0]);
		assert.deepStrictEqual({
			invoked,
			interactions: ui.telemetry.interactions.map(event => [event.interaction, event.actionId, event.surface])
		}, { invoked: ['menu', 'primary'], interactions: [['primaryAction', 'decline', 'center'], ['primaryAction', 'continue', 'center']] });
	});

	test('keyboard links and context-menu copy record bounded interactions, not content or URLs', async () => {
		const ui = await createUI();
		let opened = 0;
		ui.instantiation.stub(IOpenerService, { open: async () => { opened++; return true; } });
		ui.notifications.notify({ severity: Severity.Info, message: NotificationText.link('private link', 'https://private.example/path'), priority: NotificationPriority.SILENT });
		ui.center.show();
		await ui.render();
		logNotificationShown(ui.telemetry, ui.notifications.model.notifications[0], 'accessibleView');
		ui.container.querySelector<HTMLElement>('.notification-list-item-message a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		ui.container.querySelector<HTMLElement>('.notification-list-item')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
		const menu = ui.menus.at(-1)!;
		await menu.actionRunner!.run(menu.getActions!()[0], menu.getActionsContext?.());
		assert.deepStrictEqual({
			opened,
			interactions: ui.telemetry.interactions.map(event => [event.interaction, event.actionId, event.surface]),
			privatePayload: JSON.stringify([...ui.telemetry.shown, ...ui.telemetry.interactions]).includes('private')
		}, { opened: 1, interactions: [['link', 'unknown', 'center'], ['copy', 'copy', 'center']], privatePayload: false });
	});

	test('keyboard, double-click and toolbar command paths distinguish user expansion and dismissal', async () => {
		const ui = await createUI();
		ui.notifications.notify({ severity: Severity.Info, message: 'Notice', source: 'Source', priority: NotificationPriority.SILENT });
		const item = ui.notifications.model.notifications[0];
		ui.center.show();
		await ui.render();
		await ui.execute(EXPAND_NOTIFICATION, item);
		await ui.execute(EXPAND_NOTIFICATION, item);
		await ui.execute(COLLAPSE_NOTIFICATION, item);
		ui.container.querySelector<HTMLElement>('.notification-list-item')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		logNotificationShown(ui.telemetry, item, 'accessibleView');
		await ui.execute('notification.toggle');
		const runner = store.add(ui.instantiation.createInstance(NotificationActionRunner, 'center'));
		const clear = store.add(ui.instantiation.createInstance(ClearNotificationAction, ClearNotificationAction.ID, ClearNotificationAction.LABEL));
		await runner.run(clear, item);
		assert.deepStrictEqual({
			interactions: ui.telemetry.interactions.map(event => [event.interaction, event.surface]),
			remaining: ui.notifications.model.notifications.length
		}, { interactions: [['expand', 'center'], ['collapse', 'center'], ['expand', 'center'], ['collapse', 'center'], ['dismiss', 'center']], remaining: 0 });
	});

	test('keyboard acceptance and middle-click clear are attributed, but automatic removal and clear of active progress are not', async () => {
		const ui = await createUI();
		let invoked = 0;
		ui.notifications.prompt(Severity.Info, 'Prompt', [{ label: 'Continue', run: () => invoked++ }], { priority: NotificationPriority.SILENT });
		ui.center.show();
		await ui.render();
		await ui.execute(ACCEPT_PRIMARY_ACTION_NOTIFICATION);
		const automatic = ui.notifications.notify({ severity: Severity.Info, message: 'Automatic', priority: NotificationPriority.SILENT });
		automatic.close();
		ui.notifications.notify({ severity: Severity.Info, message: 'Middle click', priority: NotificationPriority.SILENT });
		ui.center.show();
		await ui.render();
		ui.container.querySelector<HTMLElement>('.notification-list-item')!.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
		ui.notifications.notify({ severity: Severity.Info, message: 'Running', progress: { infinite: true }, priority: NotificationPriority.SILENT });
		await ui.execute(CLEAR_NOTIFICATION, ui.notifications.model.notifications[0]);
		assert.deepStrictEqual({
			invoked,
			interactions: ui.telemetry.interactions.map(event => event.interaction),
			remaining: ui.notifications.model.notifications.length
		}, { invoked: 1, interactions: ['primaryAction', 'dismiss'], remaining: 1 });
	});

	test('clear-all records one clear per removable item, including unseen items, and never cancels progress', async () => {
		const ui = await createUI();
		ui.notifications.notify({ severity: Severity.Info, message: 'Visible', priority: NotificationPriority.SILENT });
		ui.center.show();
		await ui.render();
		ui.center.hide();
		ui.notifications.notify({ severity: Severity.Info, message: 'Unseen', priority: NotificationPriority.SILENT });
		const completed = ui.notifications.notify({ severity: Severity.Info, message: 'Completed', progress: { infinite: true }, priority: NotificationPriority.SILENT });
		completed.progress.done();
		ui.notifications.notify({ severity: Severity.Info, message: 'Active', progress: { infinite: true }, priority: NotificationPriority.SILENT });
		await ui.execute(CLEAR_ALL_NOTIFICATIONS);
		assert.deepStrictEqual({
			interactions: ui.telemetry.interactions.map(event => [event.interaction, event.surface]),
			unseenCount: ui.telemetry.interactions.filter(event => event.timeSinceShownMs === -1).length,
			remaining: ui.notifications.model.notifications.length
		}, {
			interactions: [['clearAll', 'unknown'], ['clearAll', 'unknown'], ['clearAll', 'center']],
			unseenCount: 2,
			remaining: 1
		});
	});

	test('actions report invocation even when they throw and do not collect the error', async () => {
		const ui = await createUI();
		const action = toAction({ id: 'private command', label: 'Private button', run: () => { throw new Error('private failure'); } });
		ui.notifications.notify({ severity: Severity.Info, message: 'Notice', actions: { primary: [action] }, priority: NotificationPriority.SILENT });
		const item = ui.notifications.model.notifications[0];
		const runner = store.add(ui.instantiation.createInstance(NotificationActionRunner, undefined));
		await runner.run(action, item);
		assert.deepStrictEqual({
			count: ui.telemetry.interactions.length,
			actionId: ui.telemetry.interactions[0].actionId,
			hasErrorNotification: ui.notifications.model.notifications[0].severity === Severity.Error,
			containsPrivate: JSON.stringify(ui.telemetry.interactions).includes('private')
		}, { count: 1, actionId: 'unknown', hasErrorNotification: true, containsPrivate: false });
	});
});
