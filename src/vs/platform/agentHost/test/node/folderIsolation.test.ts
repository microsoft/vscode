/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { MessageKind, PendingMessageKind, type ChatState, type Message, type ISessionWithDefaultChat, type PendingMessage } from '../../common/state/sessionState.js';
import type { AgentHostStateManager, IChatRegistration } from '../../node/agentHostStateManager.js';
import type { IAgentHostTurnService } from '../../node/agentHostTurnService.js';
import { FolderIsolationService } from '../../node/chatContributions/folderIsolation/folderIsolation.js';

suite('FolderIsolationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.parse('copilotcli:/session');
	const chat = URI.parse('copilotcli:/session/chat');
	const protocol = URI.file('/work/protocol');
	const docs = URI.file('/work/docs');
	const notGit = URI.file('/work/notes');
	const worktreeOf = (folder: URI) => URI.file(`${folder.fsPath}.worktrees/task`);
	const sponsor = { principal: { apiOrigin: 'https://api.github.com', userId: '1' } } as IAgentHostCredentialSource;

	function setup(options: { queuedMessages?: PendingMessage[]; moved?: Promise<void> } = {}) {
		let activeTurn: string | undefined = 'turn-1';
		const admissions: string[] = [];
		const started: { chat: string; text: string; sponsor?: string }[] = [];
		const isolated: { folder: string; sponsor?: string }[] = [];
		const turnService: Partial<IAgentHostTurnService> = {
			startTurnMessage: (target: URI, message: Message, credentials?: IAgentHostCredentialSource) => {
				started.push({ chat: target.toString(), text: message.text, ...(credentials ? { sponsor: credentials.principal?.userId } : {}) });
			},
		};
		const unregister = disposables.add(new Emitter<IChatRegistration>());
		const stateManager: Partial<AgentHostStateManager> = {
			getActiveTurnId: () => activeTurn,
			getChatState: () => ({ queuedMessages: options.queuedMessages ?? [] }) as ChatState,
			getSessionState: () => ({ chats: [{ resource: chat.toString() }] }) as unknown as ISessionWithDefaultChat,
			onDidUnregisterChat: unregister.event,
			holdChatAdmission: chats => {
				admissions.push(`hold ${chats.join()}`);
				return toDisposable(() => admissions.push(`release ${chats.join()}`));
			},
		};
		const service = disposables.add(new FolderIsolationService({
			validateFolderIsolation: (_session, _chat, folder) => {
				if (folder.toString() === URI.file('/work/app').toString()) {
					throw new Error('primary folder');
				}
			},
			isolateChatFolder: async (_session, _chat, folder, credentials) => {
				isolated.push({ folder: folder.fsPath, ...(credentials ? { sponsor: credentials.principal?.userId } : {}) });
				await options.moved;
				if (folder.toString() === notGit.toString()) {
					throw new Error('not in a Git repository');
				}
				return worktreeOf(folder);
			},
		}, turnService as IAgentHostTurnService, stateManager as AgentHostStateManager, new NullLogService()));
		const end = async (kind: 'success' | 'cancelled') => {
			activeTurn = undefined;
			service.onTurnEnd({ session: session.toString(), channel: chat.toString(), turnId: 'turn-1', reason: { kind } });
			// The isolation runs after the turn ended
			await new Promise(resolve => setTimeout(resolve, 0));
		};
		return { service, started, isolated, admissions, end, clearTurn: () => { activeTurn = undefined; }, unregisterChat: () => unregister.fire({ chat: chat.toString() } as IChatRegistration) };
	}

	test('requests only from the active turn a folder the chat can isolate', () => {
		const { service } = setup();
		assert.throws(() => service.request(session, chat, 'turn-0', protocol, undefined), /requires an active turn/);
		assert.throws(() => service.request(session, chat, 'turn-1', URI.file('/work/app'), undefined), /primary folder/);
	});

	test('once the turn succeeds, isolates each requested folder with its sponsor and continues the task once, naming each worktree or failure', async () => {
		const { service, started, isolated, end } = setup();
		service.request(session, chat, 'turn-1', protocol, sponsor);
		service.request(session, chat, 'turn-1', docs, sponsor);
		service.request(session, chat, 'turn-1', protocol, sponsor);
		service.request(session, chat, 'turn-1', notGit, sponsor);
		await end('success');
		await end('success');

		assert.deepStrictEqual({ isolated, started }, {
			isolated: [protocol, docs, notGit].map(folder => ({ folder: folder.fsPath, sponsor: '1' })),
			started: [{
				chat: chat.toString(),
				// Hidden from the transcript, as the host's own message
				text: `<!-- vscode-request-hidden-from-transcript -->\nContinue the task. ${JSON.stringify(protocol.fsPath)} is now ${JSON.stringify(worktreeOf(protocol).fsPath)}; make every change to it there only. ${JSON.stringify(docs.fsPath)} is now ${JSON.stringify(worktreeOf(docs).fsPath)}; make every change to it there only. ${JSON.stringify(notGit.fsPath)} could not be moved into a worktree (not in a Git repository); do not change it, and tell the user.`,
				sponsor: '1',
			}],
		});
	});

	test('holds the chat\'s queued messages and refuses new ones from the end of the turn until its folders moved', async () => {
		const moved = new DeferredPromise<void>();
		const { service, started, admissions, clearTurn } = setup({ moved: moved.p });
		service.request(session, chat, 'turn-1', protocol, sponsor);
		clearTurn();
		service.onTurnEnd({ session: session.toString(), channel: chat.toString(), turnId: 'turn-1', reason: { kind: 'success' } });
		const whileMoving = { admissions: [...admissions], moving: service.isMoving(chat.toString()), started: started.length };
		await moved.complete();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({ whileMoving, after: { admissions, moving: service.isMoving(chat.toString()), started: started.length } }, {
			// Held synchronously at the end of the turn, before the queue drain runs
			whileMoving: { admissions: [`hold ${chat.toString()}`], moving: true, started: 0 },
			// Released once the continuation started
			after: { admissions: [`hold ${chat.toString()}`, `release ${chat.toString()}`], moving: false, started: 1 },
		});
	});

	test('isolates nothing for a cancelled turn or a removed chat, and does not continue a chat with a message the user queued', async () => {
		const cancelled = setup();
		cancelled.service.request(session, chat, 'turn-1', protocol, sponsor);
		await cancelled.end('cancelled');
		const removed = setup();
		removed.service.request(session, chat, 'turn-1', protocol, sponsor);
		removed.unregisterChat();
		await removed.end('success');
		const queued = setup({ queuedMessages: [{ id: 'queued', kind: PendingMessageKind.Queued, message: { text: 'Next task', origin: { kind: MessageKind.User } } } as PendingMessage] });
		queued.service.request(session, chat, 'turn-1', protocol, sponsor);
		await queued.end('success');

		assert.deepStrictEqual({
			cancelled: { isolated: cancelled.isolated, started: cancelled.started },
			removed: { isolated: removed.isolated, started: removed.started },
			// The queued message's turn launches in the new folder
			queued: { isolated: queued.isolated.map(entry => entry.folder), started: queued.started },
		}, {
			cancelled: { isolated: [], started: [] },
			removed: { isolated: [], started: [] },
			queued: { isolated: [protocol.fsPath], started: [] },
		});
	});
});
