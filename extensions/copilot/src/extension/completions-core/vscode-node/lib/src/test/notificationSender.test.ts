/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestNotificationSender } from './testHelpers';

suite('NotificationSender test suite', function () {
	test('should show information message every time when called without ID', async function () {
		const notificationSender = new TestNotificationSender();
		const message = 'Operation completed successfully';
		await notificationSender.showInformationMessage(message);
		await notificationSender.showInformationMessage(message);
		const count = notificationSender.sentMessages.length;
		assert.strictEqual(
			count,
			2,
			`Expected showInformationMessage to be called twice, but was called ${count} times`
		);
	});

	test('should return action when provided to information message', async function () {
		const notificationSender = new TestNotificationSender();
		const action = { title: 'OK' };
		notificationSender.performAction('OK');

		const result = await notificationSender.showInformationMessage('Success', action);
		assert.deepStrictEqual(result, action);
	});

	test('should return undefined when action is dismissed for information message', async function () {
		const notificationSender = new TestNotificationSender();
		notificationSender.performDismiss();

		const result = await notificationSender.showInformationMessage('Success', { title: 'OK' });
		assert.strictEqual(result, undefined);
	});

	test('should show request message and return action', async function () {
		const notificationSender = new TestNotificationSender();
		const action = { title: 'Yes' };
		notificationSender.performAction('Yes');

		const result = await notificationSender.showInformationModal('Are you sure?', action, { title: 'No' });
		assert.deepStrictEqual(result, action);
		assert.strictEqual(notificationSender.sentMessages.length, 1);
		assert.strictEqual(notificationSender.sentMessages[0], 'Are you sure?');
	});

	test('should return undefined when request is dismissed', async function () {
		const notificationSender = new TestNotificationSender();
		notificationSender.performDismiss();

		const result = await notificationSender.showInformationModal('Are you sure?', { title: 'Yes' });
		assert.strictEqual(result, undefined);
	});

	test('should handle request without actions', async function () {
		const notificationSender = new TestNotificationSender();

		const result = await notificationSender.showInformationModal('Just showing info');
		assert.strictEqual(result, undefined);
		assert.strictEqual(notificationSender.sentMessages.length, 1);
		assert.strictEqual(notificationSender.sentMessages[0], 'Just showing info');
	});
});
