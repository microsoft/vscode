/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { Emitter } from '../../../../base/common/event.js';
import { MessageKind, PendingMessageKind, type ChatState, type Message, type PendingMessage } from '../../common/state/sessionState.js';
import type { AgentHostStateManager, IChatRegistration } from '../../node/agentHostStateManager.js';
import type { IAgentHostTurnService } from '../../node/agentHostTurnService.js';
import { FolderIsolationContinuationService } from '../../node/chatContributions/folderIsolation/folderIsolationContinuation.js';

suite('FolderIsolationContinuationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/session';
	const chat = URI.parse('copilotcli:/session/chat');
	const protocol = URI.file('/work/protocol');
	const protocolWorktree = URI.file('/work/protocol.worktrees/task');
	const docs = URI.file('/work/docs');
	const docsWorktree = URI.file('/work/docs.worktrees/task');

	function setup(activeTurn?: string, queuedMessages: PendingMessage[] = []) {
		const started: { chat: string; text: string }[] = [];
		const turnService: Partial<IAgentHostTurnService> = {
			startTurnMessage: (target: URI, message: Message) => { started.push({ chat: target.toString(), text: message.text }); },
		};
		const unregister = disposables.add(new Emitter<IChatRegistration>());
		const stateManager: Partial<AgentHostStateManager> = {
			getActiveTurnId: () => activeTurn,
			getChatState: () => ({ queuedMessages }) as ChatState,
			onDidUnregisterChat: unregister.event,
		};
		const service = disposables.add(new FolderIsolationContinuationService(turnService as IAgentHostTurnService, stateManager as AgentHostStateManager, new NullLogService()));
		const end = (turnId: string, kind: 'success' | 'cancelled'): void => service.onTurnEnd({ session, channel: chat.toString(), turnId, reason: { kind } });
		return { service, started, end, unregisterChat: () => unregister.fire({ chat: chat.toString() } as IChatRegistration) };
	}

	test('continues the chat once after the turn that isolated its folders, naming each worktree', () => {
		const { service, started, end } = setup();
		service.schedule(chat, 'turn-1', protocol, protocolWorktree);
		service.schedule(chat, 'turn-1', docs, docsWorktree);
		end('turn-0', 'success');
		end('turn-1', 'success');
		end('turn-1', 'success');

		assert.deepStrictEqual(started, [{
			chat: chat.toString(),
			// Hidden from the transcript, as the host's own message
			text: `<!-- vscode-request-hidden-from-transcript -->\nContinue the task. Folders moved into worktrees of their own: ${JSON.stringify(protocol.fsPath)} is now ${JSON.stringify(protocolWorktree.fsPath)}; ${JSON.stringify(docs.fsPath)} is now ${JSON.stringify(docsWorktree.fsPath)}. Make every change to them in their worktree paths only.`,
		}]);
	});

	test('does not continue a cancelled turn, a chat with a message the user started or queued, or a removed chat', () => {
		const cancelled = setup();
		cancelled.service.schedule(chat, 'turn-1', protocol, protocolWorktree);
		cancelled.end('turn-1', 'cancelled');
		const busy = setup('turn-2');
		busy.service.schedule(chat, 'turn-1', protocol, protocolWorktree);
		busy.end('turn-1', 'success');
		const queued = setup(undefined, [{ id: 'queued', kind: PendingMessageKind.Queued, message: { text: 'Next task', origin: { kind: MessageKind.User } } } as PendingMessage]);
		queued.service.schedule(chat, 'turn-1', protocol, protocolWorktree);
		queued.end('turn-1', 'success');
		const removed = setup();
		removed.service.schedule(chat, 'turn-1', protocol, protocolWorktree);
		removed.unregisterChat();
		removed.end('turn-1', 'success');

		assert.deepStrictEqual(
			{ cancelled: cancelled.started, busy: busy.started, queued: queued.started, removed: removed.started },
			{ cancelled: [], busy: [], queued: [], removed: [] },
		);
	});
});
