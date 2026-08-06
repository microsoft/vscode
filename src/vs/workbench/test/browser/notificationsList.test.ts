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

	test('notification center updates rendered row heights and preserves focus', () => {
		const container = document.createElement('div');
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

		model.addNotification({ severity: Severity.Info, message: 'Hello' });
		center.show();

		const getRowState = () => {
			const row = container.querySelector<HTMLElement>('.monaco-list-row');
			return { height: row?.style.height, focused: row?.classList.contains('focused') };
		};

		const before = getRowState();
		setNotificationRowHeight(34);
		const after = getRowState();
		center.dispose();
		setNotificationRowHeight(36);

		assert.deepStrictEqual({ before, after, rowAfterDispose: container.querySelector('.monaco-list-row') }, {
			before: { height: `${DEFAULT_NOTIFICATION_ROW_HEIGHT}px`, focused: true },
			after: { height: '34px', focused: true },
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
