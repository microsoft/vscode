/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NotificationAccessibilityProvider, NotificationsList } from '../../browser/parts/notifications/notificationsList.js';
import { NotificationViewItem, INotificationsFilter, INotificationViewItem, NotificationsModel } from '../../common/notifications.js';
import { Severity, NotificationsFilter } from '../../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DEFAULT_NOTIFICATION_ROW_HEIGHT, onDidChangeNotificationRowHeight, setNotificationRowHeight } from '../../browser/parts/notifications/notificationsViewer.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { NotificationsCenter } from '../../browser/parts/notifications/notificationsCenter.js';

suite('NotificationsList row height', () => {
	suiteSetup(() => {
		const warmupDisposables = new DisposableStore();
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			const instantiationService = workbenchInstantiationService(undefined, warmupDisposables);
			const list = warmupDisposables.add(instantiationService.createInstance(NotificationsList, container, {}));
			const notification = NotificationViewItem.create({ severity: Severity.Info, message: 'Warmup' }, { global: NotificationsFilter.OFF, sources: new Map() })!;
			warmupDisposables.add(toDisposable(() => notification.close()));
			list.show();
			list.layout(300);
			list.updateNotificationsList(0, 0, [notification]);
		} finally {
			warmupDisposables.dispose();
			container.remove();
		}
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT));

	test('deduplicates row height changes', () => {
		const changes: number[] = [];
		store.add(onDidChangeNotificationRowHeight(height => changes.push(height)));

		setNotificationRowHeight(34);
		setNotificationRowHeight(34);
		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);

		assert.deepStrictEqual(changes, [34, DEFAULT_NOTIFICATION_ROW_HEIGHT]);
	});

	test('notification center updates row heights and preserves the focused row viewport position', () => {
		setNotificationRowHeight(34);
		const container = document.createElement('div');
		container.classList.add('monaco-workbench');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const instantiationService = workbenchInstantiationService(undefined, store);
		const model = store.add(new NotificationsModel());
		store.add(toDisposable(() => {
			for (const notification of [...model.notifications]) {
				notification.close();
			}
		}));
		const center = store.add(instantiationService.createInstance(NotificationsCenter, container, model));

		for (let index = 0; index < 10; index++) {
			model.addNotification({ severity: Severity.Info, message: `Message ${index}` });
		}
		center.show();

		const getRowState = () => {
			const row = container.querySelector<HTMLElement>('.monaco-list-row.focused');
			const rows = container.querySelector<HTMLElement>('.monaco-list-rows');
			return {
				height: row?.style.height,
				viewportTop: row && rows ? parseInt(row.style.top) + parseInt(rows.style.top || '0') : undefined
			};
		};

		const rowToFocus = container.querySelector<HTMLElement>('.monaco-list-row[data-index="7"]')!;
		rowToFocus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		rowToFocus.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
		const before = getRowState();
		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		const after = getRowState();
		center.dispose();
		setNotificationRowHeight(36);

		assert.deepStrictEqual({
			beforeHeight: before.height,
			afterHeight: after.height,
			preservedFocusedRowViewportPosition: typeof before.viewportTop === 'number' && typeof after.viewportTop === 'number' && Math.abs(after.viewportTop - before.viewportTop) <= DEFAULT_NOTIFICATION_ROW_HEIGHT - 34,
			rowAfterDispose: container.querySelector('.monaco-list-row')
		}, {
			beforeHeight: '34px',
			afterHeight: `${DEFAULT_NOTIFICATION_ROW_HEIGHT}px`,
			preservedFocusedRowViewportPosition: true,
			rowAfterDispose: null
		});
	});
});

suite('NotificationsList AccessibilityProvider', () => {

	const noFilter: INotificationsFilter = { global: NotificationsFilter.OFF, sources: new Map() };
	let configurationService: IConfigurationService;
	let keybindingService: IKeybindingService;
	let accessibilityProvider: NotificationAccessibilityProvider;
	const createdNotifications: INotificationViewItem[] = [];

	setup(() => {
		configurationService = new TestConfigurationService();
		keybindingService = new MockKeybindingService();
		accessibilityProvider = new NotificationAccessibilityProvider({}, keybindingService, configurationService);
	});

	teardown(() => {
		// Close all created notifications to prevent disposable leaks
		for (const notification of createdNotifications) {
			notification.close();
		}
		createdNotifications.length = 0;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getAriaLabel includes severity prefix for Error notifications', () => {
		const notification = NotificationViewItem.create({ severity: Severity.Error, message: 'Something went wrong' }, noFilter)!;
		createdNotifications.push(notification);
		const ariaLabel = accessibilityProvider.getAriaLabel(notification);

		assert.ok(ariaLabel.startsWith('Error: '), `Expected aria label to start with "Error: ", but got: ${ariaLabel}`);
		assert.ok(ariaLabel.includes('Something went wrong'), 'Expected aria label to include original message');
		assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
	});

	test('getAriaLabel includes severity prefix for Warning notifications', () => {
		const notification = NotificationViewItem.create({ severity: Severity.Warning, message: 'This is a warning' }, noFilter)!;
		createdNotifications.push(notification);
		const ariaLabel = accessibilityProvider.getAriaLabel(notification);

		assert.ok(ariaLabel.startsWith('Warning: '), `Expected aria label to start with "Warning: ", but got: ${ariaLabel}`);
		assert.ok(ariaLabel.includes('This is a warning'), 'Expected aria label to include original message');
		assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
	});

	test('getAriaLabel includes severity prefix for Info notifications', () => {
		const notification = NotificationViewItem.create({ severity: Severity.Info, message: 'Information message' }, noFilter)!;
		createdNotifications.push(notification);
		const ariaLabel = accessibilityProvider.getAriaLabel(notification);

		assert.ok(ariaLabel.startsWith('Info: '), `Expected aria label to start with "Info: ", but got: ${ariaLabel}`);
		assert.ok(ariaLabel.includes('Information message'), 'Expected aria label to include original message');
		assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
	});

	test('getAriaLabel includes source when present', () => {
		const notification = NotificationViewItem.create({
			severity: Severity.Error,
			message: 'Error with source',
			source: 'TestExtension'
		}, noFilter)!;
		createdNotifications.push(notification);
		const ariaLabel = accessibilityProvider.getAriaLabel(notification);

		assert.ok(ariaLabel.startsWith('Error: '), 'Expected aria label to start with severity prefix');
		assert.ok(ariaLabel.includes('Error with source'), 'Expected aria label to include original message');
		assert.ok(ariaLabel.includes('source: TestExtension'), 'Expected aria label to include source information');
		assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
	});

	test('severity prefix consistency', () => {
		// Test that the severity prefixes are consistent with the ARIA alerts
		const errorNotification = NotificationViewItem.create({ severity: Severity.Error, message: 'Error message' }, noFilter)!;
		const warningNotification = NotificationViewItem.create({ severity: Severity.Warning, message: 'Warning message' }, noFilter)!;
		const infoNotification = NotificationViewItem.create({ severity: Severity.Info, message: 'Info message' }, noFilter)!;

		createdNotifications.push(errorNotification, warningNotification, infoNotification);

		const errorLabel = accessibilityProvider.getAriaLabel(errorNotification);
		const warningLabel = accessibilityProvider.getAriaLabel(warningNotification);
		const infoLabel = accessibilityProvider.getAriaLabel(infoNotification);

		// Check that each severity type gets the correct prefix
		assert.ok(errorLabel.includes('Error: Error message'), 'Error notifications should have Error prefix');
		assert.ok(warningLabel.includes('Warning: Warning message'), 'Warning notifications should have Warning prefix');
		assert.ok(infoLabel.includes('Info: Info message'), 'Info notifications should have Info prefix');
	});
});

suite('NotificationsCenter', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates dismissal affordances when progress starts, completes, and restarts', () => {
		const container = document.createElement('div');
		container.classList.add('monaco-workbench');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const instantiationService = workbenchInstantiationService(undefined, store);
		const model = store.add(new NotificationsModel());
		store.add(toDisposable(() => {
			for (const notification of [...model.notifications]) {
				notification.close();
			}
		}));
		const center = store.add(instantiationService.createInstance(NotificationsCenter, container, model));
		const handle = model.addNotification({
			severity: Severity.Info,
			message: 'Working...'
		});

		center.show();

		const clearAllAction = container.querySelector<HTMLElement>('.notifications-center-header-toolbar .codicon-notifications-clear-all');
		assert.ok(clearAllAction);
		const states: { closeActionVisible: boolean; clearAllDisabled: boolean }[] = [];
		const captureState = () => states.push({
			closeActionVisible: !!container.querySelector('.notification-list-item-toolbar-container .codicon-notifications-clear'),
			clearAllDisabled: clearAllAction.getAttribute('aria-disabled') === 'true'
		});

		captureState();
		const progress = handle.progress;
		captureState();
		progress.infinite();
		captureState();
		progress.total(100);
		captureState();
		progress.done();
		captureState();
		progress.infinite();
		captureState();
		progress.done();
		captureState();

		assert.deepStrictEqual(states, [
			{ closeActionVisible: true, clearAllDisabled: false },
			{ closeActionVisible: true, clearAllDisabled: false },
			{ closeActionVisible: false, clearAllDisabled: true },
			{ closeActionVisible: false, clearAllDisabled: true },
			{ closeActionVisible: true, clearAllDisabled: false },
			{ closeActionVisible: false, clearAllDisabled: true },
			{ closeActionVisible: true, clearAllDisabled: false }
		]);

		center.clearAll();
		assert.strictEqual(model.notifications.length, 0);
	});
});
