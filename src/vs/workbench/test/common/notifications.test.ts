/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NotificationsModel, NotificationViewItem, INotificationChangeEvent, NotificationChangeType, NotificationViewItemContentChangeKind, IStatusMessageChangeEvent, StatusMessageChangeType, INotificationsFilter } from '../../common/notifications.js';
import { Action } from '../../../base/common/actions.js';
import { INotification, Severity, NotificationsFilter, NotificationPriority } from '../../../platform/notification/common/notification.js';
import { createErrorWithActions } from '../../../base/common/errorMessage.js';
import { timeout } from '../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';

suite('Notifications', () => {

	const disposables = new DisposableStore();
	const noFilter: INotificationsFilter = { global: NotificationsFilter.OFF, sources: new Map() };

	teardown(() => {
		disposables.clear();
	});

	test('Items', () => {

		// Invalid
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: '' }, noFilter));
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: null! }, noFilter));

		// Duplicates
		const item1 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;
		const item2 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;
		const item3 = NotificationViewItem.create({ severity: Severity.Info, message: 'Info Message' }, noFilter)!;
		const item4 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', source: 'Source' }, noFilter)!;
		const item5 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] } }, noFilter)!;
		const item6 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] }, progress: { infinite: true } }, noFilter)!;

		assert.strictEqual(item1.equals(item1), true);
		assert.strictEqual(item2.equals(item2), true);
		assert.strictEqual(item3.equals(item3), true);
		assert.strictEqual(item4.equals(item4), true);
		assert.strictEqual(item5.equals(item5), true);

		assert.strictEqual(item1.equals(item2), true);
		assert.strictEqual(item1.equals(item3), false);
		assert.strictEqual(item1.equals(item4), false);
		assert.strictEqual(item1.equals(item5), false);

		const itemId1 = NotificationViewItem.create({ id: 'same', message: 'Info Message', severity: Severity.Info }, noFilter)!;
		const itemId2 = NotificationViewItem.create({ id: 'same', message: 'Error Message', severity: Severity.Error }, noFilter)!;

		assert.strictEqual(itemId1.equals(itemId2), true);
		assert.strictEqual(itemId1.equals(item3), false);

		// Progress
		assert.strictEqual(item1.hasProgress, false);
		assert.strictEqual(item6.hasProgress, true);

		// Message Box
		assert.strictEqual(item5.canCollapse, false);
		assert.strictEqual(item5.expanded, true);

		// Events
		let called = 0;
		disposables.add(item1.onDidChangeExpansion(() => {
			called++;
		}));

		item1.expand();
		item1.expand();
		item1.collapse();
		item1.collapse();

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.PROGRESS) {
				called++;
			}
		}));

		item1.progress.infinite();
		item1.progress.done();

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.MESSAGE) {
				called++;
			}
		}));

		item1.updateMessage('message update');

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.SEVERITY) {
				called++;
			}
		}));

		item1.updateSeverity(Severity.Error);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.ACTIONS) {
				called++;
			}
		}));

		item1.updateActions({ primary: [disposables.add(new Action('id2', 'label'))] });

		assert.strictEqual(called, 1);

		called = 0;
		disposables.add(item1.onDidChangeVisibility(e => {
			called++;
		}));

		item1.updateVisibility(true);
		item1.updateVisibility(false);
		item1.updateVisibility(false);

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidClose(() => {
			called++;
		}));

		item1.close();
		assert.strictEqual(called, 1);

		// Error with Action
		const item7 = NotificationViewItem.create({ severity: Severity.Error, message: createErrorWithActions('Hello Error', [disposables.add(new Action('id', 'label'))]) }, noFilter)!;
		assert.strictEqual(item7.actions!.primary!.length, 1);

		// Filter
		const item8 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, { global: NotificationsFilter.OFF, sources: new Map() })!;
		assert.strictEqual(item8.priority, NotificationPriority.DEFAULT);

		const item9 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, { global: NotificationsFilter.ERROR, sources: new Map() })!;
		assert.strictEqual(item9.priority, NotificationPriority.DEFAULT);

		const item10 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message' }, { global: NotificationsFilter.ERROR, sources: new Map() })!;
		assert.strictEqual(item10.priority, NotificationPriority.SILENT);

		const sources = new Map<string, NotificationsFilter>();
		sources.set('test.source', NotificationsFilter.ERROR);
		const item11 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: 'test.source' }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item11.priority, NotificationPriority.DEFAULT);
		const item12 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: { id: 'test.source', label: 'foo' } }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item12.priority, NotificationPriority.SILENT);
		const item13 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: { id: 'test.source2', label: 'foo' } }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item13.priority, NotificationPriority.DEFAULT);

		for (const item of [item1, item2, item3, item4, item5, item6, itemId1, itemId2, item7, item8, item9, item10, item11, item12, item13]) {
			item.close();
		}
	});

	test('Items - does not fire changed when message did not change (content, severity)', async () => {
		const item1 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;

		let fired = false;
		disposables.add(item1.onDidChangeContent(() => {
			fired = true;
		}));

		item1.updateMessage('Error Message');
		await timeout(0);
		assert.ok(!fired, 'Expected onDidChangeContent to not be fired');

		item1.updateSeverity(Severity.Error);
		await timeout(0);
		assert.ok(!fired, 'Expected onDidChangeContent to not be fired');

		for (const item of [item1]) {
			item.close();
		}
	});

	test('Model', () => {
		const model = disposables.add(new NotificationsModel());

		let lastNotificationEvent!: INotificationChangeEvent;
		disposables.add(model.onDidChangeNotification(e => {
			lastNotificationEvent = e;
		}));

		let lastStatusMessageEvent!: IStatusMessageChangeEvent;
		disposables.add(model.onDidChangeStatusMessage(e => {
			lastStatusMessageEvent = e;
		}));

		const item1: INotification = { severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] } };
		const item2: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		const item2Duplicate: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		const item3: INotification = { severity: Severity.Info, message: 'Info Message' };

		const item1Handle = model.addNotification(item1);
		assert.strictEqual(lastNotificationEvent.item.severity, item1.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item1.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		item1Handle.updateMessage('Different Error Message');
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.MESSAGE);

		item1Handle.updateSeverity(Severity.Warning);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.SEVERITY);

		item1Handle.updateActions({ primary: [], secondary: [] });
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.ACTIONS);

		item1Handle.progress.infinite();
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.PROGRESS);

		const item2Handle = model.addNotification(item2);
		assert.strictEqual(lastNotificationEvent.item.severity, item2.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		const item3Handle = model.addNotification(item3);
		assert.strictEqual(lastNotificationEvent.item.severity, item3.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item3.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		assert.strictEqual(model.notifications.length, 3);

		let called = 0;
		disposables.add(item1Handle.onDidClose(() => {
			called++;
		}));

		item1Handle.close();
		assert.strictEqual(called, 1);
		assert.strictEqual(model.notifications.length, 2);
		assert.strictEqual(lastNotificationEvent.item.severity, Severity.Warning);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), 'Different Error Message');
		assert.strictEqual(lastNotificationEvent.index, 2);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		const item2DuplicateHandle = model.addNotification(item2Duplicate);
		assert.strictEqual(model.notifications.length, 2);
		assert.strictEqual(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2Duplicate.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		item2Handle.close();
		assert.strictEqual(model.notifications.length, 1);
		assert.strictEqual(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2Duplicate.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		model.notifications[0].expand();
		assert.strictEqual(lastNotificationEvent.item.severity, item3.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item3.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.EXPAND_COLLAPSE);

		const disposable = model.showStatusMessage('Hello World');
		assert.strictEqual(model.statusMessage!.message, 'Hello World');
		assert.strictEqual(lastStatusMessageEvent.item.message, model.statusMessage!.message);
		assert.strictEqual(lastStatusMessageEvent.kind, StatusMessageChangeType.ADD);
		disposable.close();
		assert.ok(!model.statusMessage);
		assert.strictEqual(lastStatusMessageEvent.kind, StatusMessageChangeType.REMOVE);

		const disposable2 = model.showStatusMessage('Hello World 2');
		const disposable3 = model.showStatusMessage('Hello World 3');

		assert.strictEqual(model.statusMessage!.message, 'Hello World 3');

		disposable2.close();
		assert.strictEqual(model.statusMessage!.message, 'Hello World 3');

		disposable3.close();
		assert.ok(!model.statusMessage);

		item2DuplicateHandle.close();
		item3Handle.close();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
