/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NotificationsModel, NotificationViewItem, INotificationChangeEvent, NotificationChangeType, NotificationViewItemLabelKind, IStatusMessageChangeEvent, StatusMessageChangeType } from 'vs/workbench/common/notifications';
import { Action } from 'vs/base/common/actions';
import { INotification, Severity } from 'vs/platform/notification/common/notification';
import { createErrorWithActions } from 'vs/base/common/errorsWithActions';

suite('Notifications', () => {

	test('Items', () => {

		// Invalid
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: '' }));
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: null! }));

		// Duplicates
		let item1 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' })!;
		let item2 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' })!;
		let item3 = NotificationViewItem.create({ severity: Severity.Info, message: 'Info Message' })!;
		let item4 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', source: 'Source' })!;
		let item5 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', actions: { primary: [new Action('id', 'label')] } })!;

		assert.equal(item1.equals(item1), true);
		assert.equal(item2.equals(item2), true);
		assert.equal(item3.equals(item3), true);
		assert.equal(item4.equals(item4), true);
		assert.equal(item5.equals(item5), true);

		assert.equal(item1.equals(item2), true);
		assert.equal(item1.equals(item3), false);
		assert.equal(item1.equals(item4), false);
		assert.equal(item1.equals(item5), false);

		// Message Box
		assert.equal(item5.canCollapse, false);
		assert.equal(item5.expanded, true);

		// Events
		let called = 0;
		item1.onDidExpansionChange(() => {
			called++;
		});

		item1.expand();
		item1.expand();
		item1.collapse();
		item1.collapse();

		assert.equal(called, 2);

		called = 0;
		item1.onDidLabelChange(e => {
			if (e.kind === NotificationViewItemLabelKind.PROGRESS) {
				called++;
			}
		});

		item1.progress.infinite();
		item1.progress.done();

		assert.equal(called, 2);

		called = 0;
		item1.onDidLabelChange(e => {
			if (e.kind === NotificationViewItemLabelKind.MESSAGE) {
				called++;
			}
		});

		item1.updateMessage('message update');

		called = 0;
		item1.onDidLabelChange(e => {
			if (e.kind === NotificationViewItemLabelKind.SEVERITY) {
				called++;
			}
		});

		item1.updateSeverity(Severity.Error);

		called = 0;
		item1.onDidLabelChange(e => {
			if (e.kind === NotificationViewItemLabelKind.ACTIONS) {
				called++;
			}
		});

		item1.updateActions({ primary: [new Action('id2', 'label')] });

		assert.equal(called, 1);

		called = 0;
		item1.onDidClose(() => {
			called++;
		});

		item1.close();
		assert.equal(called, 1);

		// Error with Action
		let item6 = NotificationViewItem.create({ severity: Severity.Error, message: createErrorWithActions('Hello Error', { actions: [new Action('id', 'label')] }) })!;
		assert.equal(item6.actions!.primary!.length, 1);

		// Links
		let item7 = NotificationViewItem.create({ severity: Severity.Info, message: 'Unable to [Link 1](http://link1.com) open [Link 2](command:open.me "Open This") and [Link 3](command:without.title) and [Invalid Link4](ftp://link4.com)' })!;

		const links = item7.message.links;
		assert.equal(links.length, 3);
		assert.equal(links[0].name, 'Link 1');
		assert.equal(links[0].href, 'http://link1.com');
		assert.equal(links[0].title, 'http://link1.com');
		assert.equal(links[0].length, '[Link 1](http://link1.com)'.length);
		assert.equal(links[0].offset, 'Unable to '.length);

		assert.equal(links[1].name, 'Link 2');
		assert.equal(links[1].href, 'command:open.me');
		assert.equal(links[1].title, 'Open This');
		assert.equal(links[1].length, '[Link 2](command:open.me "Open This")'.length);
		assert.equal(links[1].offset, 'Unable to [Link 1](http://link1.com) open '.length);

		assert.equal(links[2].name, 'Link 3');
		assert.equal(links[2].href, 'command:without.title');
		assert.equal(links[2].title, 'Click to execute command \'without.title\'');
		assert.equal(links[2].length, '[Link 3](command:without.title)'.length);
		assert.equal(links[2].offset, 'Unable to [Link 1](http://link1.com) open [Link 2](command:open.me "Open This") and '.length);
	});

	test('Model', () => {
		const model = new NotificationsModel();

		let lastNotificationEvent!: INotificationChangeEvent;
		model.onDidNotificationChange(e => {
			lastNotificationEvent = e;
		});

		let lastStatusMessageEvent!: IStatusMessageChangeEvent;
		model.onDidStatusMessageChange(e => {
			lastStatusMessageEvent = e;
		});

		let item1: INotification = { severity: Severity.Error, message: 'Error Message', actions: { primary: [new Action('id', 'label')] } };
		let item2: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		let item2Duplicate: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		let item3: INotification = { severity: Severity.Info, message: 'Info Message' };

		let item1Handle = model.addNotification(item1);
		assert.equal(lastNotificationEvent.item.severity, item1.severity);
		assert.equal(lastNotificationEvent.item.message.value, item1.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.ADD);

		let item2Handle = model.addNotification(item2);
		assert.equal(lastNotificationEvent.item.severity, item2.severity);
		assert.equal(lastNotificationEvent.item.message.value, item2.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.ADD);

		model.addNotification(item3);
		assert.equal(lastNotificationEvent.item.severity, item3.severity);
		assert.equal(lastNotificationEvent.item.message.value, item3.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.ADD);

		assert.equal(model.notifications.length, 3);

		let called = 0;
		item1Handle.onDidClose(() => {
			called++;
		});

		item1Handle.close();
		assert.equal(called, 1);
		assert.equal(model.notifications.length, 2);
		assert.equal(lastNotificationEvent.item.severity, item1.severity);
		assert.equal(lastNotificationEvent.item.message.value, item1.message);
		assert.equal(lastNotificationEvent.index, 2);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		model.addNotification(item2Duplicate);
		assert.equal(model.notifications.length, 2);
		assert.equal(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.equal(lastNotificationEvent.item.message.value, item2Duplicate.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.ADD);

		item2Handle.close();
		assert.equal(model.notifications.length, 1);
		assert.equal(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.equal(lastNotificationEvent.item.message.value, item2Duplicate.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		model.notifications[0].expand();
		assert.equal(lastNotificationEvent.item.severity, item3.severity);
		assert.equal(lastNotificationEvent.item.message.value, item3.message);
		assert.equal(lastNotificationEvent.index, 0);
		assert.equal(lastNotificationEvent.kind, NotificationChangeType.CHANGE);

		const disposable = model.showStatusMessage('Hello World');
		assert.equal(model.statusMessage!.message, 'Hello World');
		assert.equal(lastStatusMessageEvent.item.message, model.statusMessage!.message);
		assert.equal(lastStatusMessageEvent.kind, StatusMessageChangeType.ADD);
		disposable.dispose();
		assert.ok(!model.statusMessage);
		assert.equal(lastStatusMessageEvent.kind, StatusMessageChangeType.REMOVE);

		let disposable2 = model.showStatusMessage('Hello World 2');
		const disposable3 = model.showStatusMessage('Hello World 3');

		assert.equal(model.statusMessage!.message, 'Hello World 3');

		disposable2.dispose();
		assert.equal(model.statusMessage!.message, 'Hello World 3');

		disposable3.dispose();
		assert.ok(!model.statusMessage);
	});
});
