/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadChatInputNotification } from '../../browser/mainThreadChatInputNotification.js';
import { ExtHostChatInputNotification } from '../../common/extHostChatInputNotification.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadChatInputNotification', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Wires the extension-facing notification to the real main-thread customer,
	 * so a test drives the whole ext host -> DTO -> main thread -> service path
	 * rather than either half in isolation.
	 */
	function createBridge(): { notification: vscode.ChatInputNotification; pushed: IChatInputNotification[] } {
		const pushed: IChatInputNotification[] = [];
		const notificationService = new class extends mock<IChatInputNotificationService>() {
			override setNotification(notification: IChatInputNotification): void {
				pushed.push(notification);
			}
			override deleteNotification(): void { }
		};
		const mainThread = store.add(new MainThreadChatInputNotification(SingleProxyRPCProtocol(null), notificationService));
		const extHost = new ExtHostChatInputNotification(SingleProxyRPCProtocol(mainThread));
		return { notification: extHost.createInputNotification(nullExtensionDescription, 'byokUtilityModelHint'), pushed };
	}

	test('carries session types across the bridge, defaulting to none', () => {
		const { notification, pushed } = createBridge();

		notification.message = 'Set BYOK utility models';
		notification.show();
		notification.sessionTypes = ['local', 'agent-host-copilotcli'];
		notification.sessionTypes = undefined;

		assert.deepStrictEqual(pushed.map(entry => entry.sessionTypes), [
			undefined,
			['local', 'agent-host-copilotcli'],
			undefined,
		]);
	});

	test('maps the notification onto the internal shape', () => {
		const { notification, pushed } = createBridge();

		notification.message = 'Set BYOK utility models';
		notification.description = 'Pick the models used for background work.';
		notification.actions = [{ label: 'Configure', commandId: 'workbench.action.openSettings', commandArgs: ['chat.byokUtilityModelDefault'] }];
		notification.sessionTypes = ['local'];
		notification.show();

		assert.deepStrictEqual(pushed.at(-1), {
			id: 'nullextensiondescription.byokUtilityModelHint',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Set BYOK utility models',
			description: 'Pick the models used for background work.',
			actions: [{ kind: ChatInputNotificationActionKind.Command, label: 'Configure', commandId: 'workbench.action.openSettings', commandArgs: ['chat.byokUtilityModelDefault'] }],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionTypes: ['local'],
		});
	});
});
