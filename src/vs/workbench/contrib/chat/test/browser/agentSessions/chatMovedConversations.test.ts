/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ChatMovedConversationNotices, ChatMovedConversationsService, OPEN_MOVED_CONVERSATION_ACTION_ID } from '../../../browser/agentSessions/agentHost/chatMovedConversations.js';
import { ChatInputNotificationActionKind, type IChatInputNotification, type IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';

suite('ChatMovedConversations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const local = (id: string) => LocalChatSessionUri.forSession(id);
	const copilot = (id: string) => URI.from({ scheme: 'agent-host-copilot', path: `/${id}` });

	function createService(storage: InMemoryStorageService): ChatMovedConversationsService {
		return store.add(new ChatMovedConversationsService(storage, new NullLogService()));
	}

	test('remembers each move across reloads, a newer move of a chat replacing the older one', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.record(local('a'), copilot('first'), 'Copilot', 'Fix the build');
		service.record(local('b'), copilot('b'), 'Claude', undefined);
		service.record(local('a'), copilot('second'), 'Copilot', 'Fix the build');
		service.dismissNotice(copilot('b'));

		const reloaded = createService(storage);
		assert.deepStrictEqual({
			movedTo: reloaded.getMovedTo(local('a'))?.destination.toString(),
			movedFrom: reloaded.getMovedFrom(copilot('b'))?.source.toString(),
			replaced: reloaded.getMovedFrom(copilot('first')),
			conversations: reloaded.conversations.map(entry => ({ ...entry, source: entry.source.toString(), destination: entry.destination.toString() })),
		}, {
			movedTo: copilot('second').toString(),
			movedFrom: local('b').toString(),
			replaced: undefined,
			conversations: [
				{ source: local('b').toString(), destination: copilot('b').toString(), destinationName: 'Claude', title: undefined, sourceNoticeDismissed: false, destinationNoticeDismissed: true },
				{ source: local('a').toString(), destination: copilot('second').toString(), destinationName: 'Copilot', title: 'Fix the build', sourceNoticeDismissed: false, destinationNoticeDismissed: false },
			],
		});
	});

	test('shows a notice in each chat of a move linking to the other, until dismissed', () => {
		const service = createService(store.add(new InMemoryStorageService()));
		const shown = new Map<string, IChatInputNotification>();
		const notificationService = upcastPartial<IChatInputNotificationService>({
			onDidChange: Event.None,
			setNotification: notification => { shown.set(notification.id, notification); },
			deleteNotification: id => { shown.delete(id); },
		});
		store.add(new ChatMovedConversationNotices(service, notificationService));
		const notices = () => [...shown.values()].map(notice => ({
			id: notice.id,
			telemetryId: notice.telemetryId,
			message: notice.message,
			description: notice.description,
			chats: notice.sessionResources?.map(resource => resource.toString()),
			actions: notice.actions.map(action => action.kind === ChatInputNotificationActionKind.Command
				? { label: action.label, commandId: action.commandId, args: action.commandArgs?.map(String) }
				: action.kind),
		}));

		service.record(local('a'), copilot('a'), 'Copilot', 'Fix the build');
		// Notice ids carry no chat identity, since they are reported in telemetry.
		assert.deepStrictEqual(notices(), [
			{
				id: 'chat.movedConversationFrom.0', telemetryId: 'chat.movedConversationFrom',
				message: 'Continued from a Local chat', description: 'Fix the build',
				chats: [copilot('a').toString()],
				actions: [{ label: 'Open Original', commandId: OPEN_MOVED_CONVERSATION_ACTION_ID, args: [local('a').toString()] }],
			},
			{
				id: 'chat.movedConversationTo.1', telemetryId: 'chat.movedConversationTo',
				message: 'Continued in Copilot', description: 'Fix the build',
				chats: [local('a').toString()],
				actions: [{ label: 'Open in Copilot', commandId: OPEN_MOVED_CONVERSATION_ACTION_ID, args: [copilot('a').toString()] }],
			},
		]);

		shown.get('chat.movedConversationFrom.0')!.onDismiss!();
		assert.deepStrictEqual({
			shown: notices().map(notice => notice.id),
			dismissed: service.getMovedFrom(copilot('a'))?.destinationNoticeDismissed,
		}, { shown: ['chat.movedConversationTo.1'], dismissed: true });
	});
});
