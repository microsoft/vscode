/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NotificationsPosition, NotificationsSettings } from '../../common/notifications.js';
import { getNotificationExpandIcon, getNotificationCollapseIcon } from '../../browser/parts/notifications/notificationsActions.js';

suite('Notifications Position', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('NotificationsPosition Enum Values', () => {

		test('enum values match expected strings', () => {
			assert.strictEqual(NotificationsPosition.BOTTOM_RIGHT, 'bottom-right');
			assert.strictEqual(NotificationsPosition.BOTTOM_LEFT, 'bottom-left');
			assert.strictEqual(NotificationsPosition.TOP_RIGHT, 'top-right');
		});

		test('setting key is correct', () => {
			assert.strictEqual(NotificationsSettings.NOTIFICATIONS_POSITION, 'workbench.notifications.position');
		});

		test('button setting key is correct', () => {
			assert.strictEqual(NotificationsSettings.NOTIFICATIONS_BUTTON, 'workbench.notifications.showInTitleBar');
		});
	});

	suite('Expand/Collapse Notification Icons', () => {

		test('bottom-right expand uses notifications-expand icon', () => {
			assert.strictEqual(getNotificationExpandIcon(NotificationsPosition.BOTTOM_RIGHT).id, 'notifications-expand');
		});

		test('bottom-left expand uses notifications-expand icon', () => {
			assert.strictEqual(getNotificationExpandIcon(NotificationsPosition.BOTTOM_LEFT).id, 'notifications-expand');
		});

		test('top-right expand uses notifications-expand-down icon', () => {
			assert.strictEqual(getNotificationExpandIcon(NotificationsPosition.TOP_RIGHT).id, 'notifications-expand-down');
		});

		test('bottom-right collapse uses notifications-collapse icon', () => {
			assert.strictEqual(getNotificationCollapseIcon(NotificationsPosition.BOTTOM_RIGHT).id, 'notifications-collapse');
		});

		test('bottom-left collapse uses notifications-collapse icon', () => {
			assert.strictEqual(getNotificationCollapseIcon(NotificationsPosition.BOTTOM_LEFT).id, 'notifications-collapse');
		});

		test('top-right collapse uses notifications-collapse-up icon', () => {
			assert.strictEqual(getNotificationCollapseIcon(NotificationsPosition.TOP_RIGHT).id, 'notifications-collapse-up');
		});
	});
});
