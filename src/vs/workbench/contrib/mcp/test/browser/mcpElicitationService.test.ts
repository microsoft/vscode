/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotification, NotificationsFilter, Severity } from '../../../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../../../platform/notification/common/notificationMessage.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationsFilter, NotificationViewItem } from '../../../../common/notifications.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { McpElicitationService } from '../../browser/mcpElicitationService.js';
import { IMcpServer, McpConnectionState, MpcResponseError } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';

const noFilter: INotificationsFilter = { global: NotificationsFilter.OFF, sources: new Map() };

class TestMcpServer extends mock<IMcpServer>() {
	override readonly definition = { id: 'test.server', label: 'Test Server' };
	override readonly connection = constObservable(undefined);
	override readonly connectionState = constObservable<McpConnectionState>({ state: McpConnectionState.Kind.Running });
}

class CapturingNotificationService extends TestNotificationService {
	readonly notifications: INotification[] = [];

	override notify(notification: INotification) {
		this.notifications.push(notification);
		return super.notify(notification);
	}
}

suite('MCP Elicitation Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('treats form messages as literal notification content', async () => {
		const notificationService = new CapturingNotificationService();
		const service = new McpElicitationService(
			notificationService,
			new class extends mock<IQuickInputService>() { }(),
			new class extends mock<IChatService>() { }(),
			new class extends mock<IOpenerService>() { }(),
		);
		const tokenSource = store.add(new CancellationTokenSource());
		const message = '[Open details](command:workbench.action.terminal.sendSequence?%7B%22text%22%3A%22echo%20mcp-repro%5Cr%22%7D "Open safe details")';

		const result = service.elicit(new TestMcpServer(), undefined, {
			mode: 'form',
			message,
			requestedSchema: {
				type: 'object',
				properties: {},
			},
		}, tokenSource.token);

		const notification = notificationService.notifications[0];
		const item = NotificationViewItem.create(notification, noFilter)!;
		store.add(toDisposable(() => item.close()));

		assert.deepStrictEqual({
			severity: notification.severity,
			isExplicitText: notification.message instanceof NotificationText,
			nodes: item.message.linkedText.nodes,
		}, {
			severity: Severity.Info,
			isExplicitText: true,
			nodes: [message],
		});

		tokenSource.cancel();
		await result;
	});

	test('rejects non-string messages before rendering', async () => {
		const notificationService = new CapturingNotificationService();
		const service = new McpElicitationService(
			notificationService,
			new class extends mock<IQuickInputService>() { }(),
			new class extends mock<IChatService>() { }(),
			new class extends mock<IOpenerService>() { }(),
		);
		const server = new TestMcpServer();
		const maliciousMessage = {
			_nodes: [{ label: 'Open details', href: 'command:workbench.action.terminal.sendSequence?{"text":"echo pwned"}' }],
		} as unknown as string;
		const requests = [
			{
				mode: 'form',
				message: maliciousMessage,
				requestedSchema: { type: 'object', properties: {} },
			},
			{
				message: maliciousMessage,
				requestedSchema: { type: 'object', properties: {} },
			},
			{
				mode: 'url',
				message: maliciousMessage,
				elicitationId: 'test',
				url: 'https://example.com',
			},
		] satisfies MCP.ElicitRequest['params'][];

		for (const request of requests) {
			await assert.rejects(
				service.elicit(server, undefined, request, CancellationToken.None),
				(error: unknown) => error instanceof MpcResponseError && error.code === MCP.INVALID_PARAMS,
			);
		}

		assert.strictEqual(notificationService.notifications.length, 0);
	});
});
