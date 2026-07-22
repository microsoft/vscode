/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { TerminalClaimKind, type TerminalClaim } from '../../../../common/state/protocol/state.js';
import {
	buildDefaultChatUri,
	MessageKind,
	PendingMessageKind,
	ROOT_STATE_URI,
	SessionStatus,
	type ChatState,
	type Message,
	type RootState,
	type SessionState,
	type TerminalState,
} from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { hostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineStateOperationsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	async function createSession(prefix: string): Promise<{ sessionUri: string; chatUri: string; clientId: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-state-${prefix}-`));
		tempDirs.push(workspace);
		const clientId = `${prefix}-${config.provider}`;
		const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), clientId, workspace };
	}

	async function sessionState(sessionUri: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chatUri: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return result.snapshot!.state as ChatState;
	}

	async function terminalState(terminalUri: string): Promise<TerminalState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		return result.snapshot!.state as TerminalState;
	}

	async function dispatchAndWait(channel: string, clientSeq: number, action: StateAction): Promise<void> {
		context.client.clearReceived();
		context.client.dispatch({ channel, clientSeq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel,
		);
	}

	function userMessage(text: string): Message {
		return { text, origin: { kind: MessageKind.User } };
	}

	async function createTerminal(prefix: string): Promise<{ sessionUri: string; terminalUri: string; clientId: string; workspace: string }> {
		const { sessionUri, clientId, workspace } = await createSession(prefix);
		const terminalUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${generateUuid()}` }).toString();
		await context.client.call('createTerminal', {
			channel: terminalUri,
			claim: { kind: TerminalClaimKind.Client, clientId },
			name: `E2E ${prefix}`,
			cwd: URI.file(workspace).toString(),
			cols: 90,
			rows: 30,
		});
		await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		return { sessionUri, terminalUri, clientId, workspace };
	}

	async function disposeTerminal(terminalUri: string): Promise<void> {
		await context.client.call('disposeTerminal', { channel: terminalUri });
	}

	async function withTerminal<T>(
		prefix: string,
		run: (terminal: Awaited<ReturnType<typeof createTerminal>>) => Promise<T>,
	): Promise<T> {
		const terminal = await createTerminal(prefix);
		try {
			return await run(terminal);
		} finally {
			await disposeTerminal(terminal.terminalUri);
		}
	}

	hostOnlyTest(context, 'client title change updates session state', async function () {
		const { sessionUri } = await createSession('title-change');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionTitleChanged, title: 'Direct AHP Title' });

		assert.strictEqual((await sessionState(sessionUri)).title, 'Direct AHP Title');
	});

	hostOnlyTest(context, 'marking a session read sets the read status flag', async function () {
		const { sessionUri } = await createSession('read-set');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });

		assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsRead);
	});

	hostOnlyTest(context, 'marking a session unread clears the read status flag', async function () {
		const { sessionUri } = await createSession('read-clear');
		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsReadChanged, isRead: false });

		assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsRead, 0);
	});

	hostOnlyTest(context, 'archiving a session sets the archived status flag', async function () {
		const { sessionUri } = await createSession('archive-set');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsArchived);
	});

	hostOnlyTest(context, 'unarchiving a session clears the archived status flag', async function () {
		const { sessionUri } = await createSession('archive-clear');
		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsArchivedChanged, isArchived: false });

		assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsArchived, 0);
	});

	hostOnlyTest(context, 'session config changes merge with existing values', async function () {
		const { sessionUri } = await createSession('config-merge');
		const before = await sessionState(sessionUri);

		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AutoApprove]: 'assisted' },
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
			...before.config?.values,
			[SessionConfigKey.AutoApprove]: 'assisted',
		});
	});

	hostOnlyTest(context, 'session config replacement drops previous values', async function () {
		const { sessionUri } = await createSession('config-replace');

		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AutoApprove]: 'default' },
			replace: true,
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
			[SessionConfigKey.AutoApprove]: 'default',
		});
	});

	hostOnlyTest(context, 'active client set adds a session participant', async function () {
		const { sessionUri, clientId } = await createSession('active-client-add');

		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'Coverage Client', tools: [] },
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, [{
			clientId,
			displayName: 'Coverage Client',
			tools: [],
		}]);
	});

	hostOnlyTest(context, 'active client set replaces an existing participant', async function () {
		const { sessionUri, clientId } = await createSession('active-client-update');
		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'Before', tools: [] },
		});

		await dispatchAndWait(sessionUri, 2, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'After', tools: [] },
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients.map(client => client.displayName), ['After']);
	});

	hostOnlyTest(context, 'active client removal removes the session participant', async function () {
		const { sessionUri, clientId } = await createSession('active-client-remove');
		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'Coverage Client', tools: [] },
		});

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionActiveClientRemoved, clientId });

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, []);
	});

	hostOnlyTest(context, 'draft change stores a user message', async function () {
		const { chatUri } = await createSession('draft-set');
		const draft = userMessage('draft text');

		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });

		assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
	});

	hostOnlyTest(context, 'draft change replaces the previous message', async function () {
		const { chatUri } = await createSession('draft-replace');
		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage('before') });

		await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged, draft: userMessage('after') });

		assert.deepStrictEqual((await chatState(chatUri)).draft, userMessage('after'));
	});

	hostOnlyTest(context, 'clearing a draft removes it from chat state', async function () {
		const { chatUri } = await createSession('draft-clear');
		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage('draft') });

		await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged });

		assert.strictEqual((await chatState(chatUri)).draft, undefined);
	});

	hostOnlyTest(context, 'removing a missing queued message leaves chat state unchanged', async function () {
		const { chatUri } = await createSession('queue-remove-missing');

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatPendingMessageRemoved,
			kind: PendingMessageKind.Queued,
			id: 'missing',
		});

		assert.strictEqual((await chatState(chatUri)).queuedMessages, undefined);
	});

	hostOnlyTest(context, 'reordering a missing queue leaves chat state unchanged', async function () {
		const { chatUri } = await createSession('queue-reorder-missing');

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatQueuedMessagesReordered,
			order: ['missing'],
		});

		assert.strictEqual((await chatState(chatUri)).queuedMessages, undefined);
	});

	hostOnlyTest(context, 'truncating at a missing turn leaves history unchanged', async function () {
		const { chatUri } = await createSession('truncate-missing');
		const before = await chatState(chatUri);

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatTruncated,
			turnId: 'missing-turn',
		});

		assert.deepStrictEqual((await chatState(chatUri)).turns, before.turns);
	});

	hostOnlyTest(context, 'cancelling a missing turn leaves the chat idle', async function () {
		const { chatUri } = await createSession('cancel-missing');

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatTurnCancelled,
			turnId: 'missing-turn',
			duration: 0,
		});

		const state = await chatState(chatUri);
		assert.deepStrictEqual(
			{ activeTurn: state.activeTurn, turns: state.turns, status: state.status },
			{ activeTurn: undefined, turns: [], status: SessionStatus.Idle },
		);
	});

	hostOnlyTest(context, 'createTerminal exposes requested dimensions cwd and claim', async function () {
		await withTerminal('terminal-create', async ({ terminalUri, clientId, workspace }) => {
			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({
				cwd: state.cwd,
				cols: state.cols,
				rows: state.rows,
				claim: state.claim,
			}, {
				cwd: URI.file(workspace).fsPath,
				cols: 90,
				rows: 30,
				claim: { kind: TerminalClaimKind.Client, clientId },
			});
		});
	});

	hostOnlyTest(context, 'terminal resize updates terminal dimensions', async function () {
		await withTerminal('terminal-resize', async ({ terminalUri }) => {
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 120, rows: 40 });
			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({ cols: state.cols, rows: state.rows }, { cols: 120, rows: 40 });
		});
	});

	hostOnlyTest(context, 'terminal title change is broadcast', async function () {
		await withTerminal('terminal-title', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalTitleChanged, title: 'Renamed Terminal' },
			});
			const notification = await context.client.waitForNotification(n =>
				isActionNotification(n, 'terminal/titleChanged')
				&& getActionEnvelope(n).channel === terminalUri
				&& (getActionEnvelope(n).action as { title: string }).title === 'Renamed Terminal',
			);
			assert.strictEqual((getActionEnvelope(notification).action as { title: string }).title, 'Renamed Terminal');
		});
	});

	hostOnlyTest(context, 'terminal claim can transfer from the client to the session', async function () {
		await withTerminal('terminal-claim', async ({ sessionUri, terminalUri }) => {
			const claim: TerminalClaim = { kind: TerminalClaimKind.Session, session: sessionUri };
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalClaimed, claim });
			assert.deepStrictEqual((await terminalState(terminalUri)).claim, claim);
		});
	});

	hostOnlyTest(context, 'terminal input reaches the shell and produces output', async function () {
		await withTerminal('terminal-input', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalInput, data: 'node -p "40+2"\r' },
			});
			let streamedOutput = '';
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'terminal/data') || getActionEnvelope(n).channel !== terminalUri) {
					return false;
				}
				const action = getActionEnvelope(n).action as { data: string };
				streamedOutput += action.data;
				return /(?:^|\D)42(?:\D|$)/.test(streamedOutput);
			}, 30_000);
			const output = (await terminalState(terminalUri)).content
				.map(part => part.type === 'command' ? part.output : part.value)
				.join('');
			assert.match(output, /(?:^|\D)42(?:\D|$)/);
		});
	});

	hostOnlyTest(context, 'disposeTerminal removes the terminal from root state', async function () {
		const { terminalUri } = await createTerminal('terminal-dispose');

		await disposeTerminal(terminalUri);

		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const state = root.snapshot!.state as RootState;
		assert.strictEqual(state.terminals?.some(terminal => terminal.resource === terminalUri) ?? false, false);
	});

	hostOnlyTest(context, 'creating a duplicate terminal resource is rejected', async function () {
		await withTerminal('terminal-duplicate', async ({ terminalUri, clientId }) => {
			await assert.rejects(context.client.call('createTerminal', {
				channel: terminalUri,
				claim: { kind: TerminalClaimKind.Client, clientId },
			}));
		});
	});

	hostOnlyTest(context, 'subscribing to an unknown terminal is rejected', async function () {
		await createSession('terminal-unknown');
		const terminalUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${generateUuid()}` }).toString();

		await assert.rejects(context.client.call<SubscribeResult>('subscribe', { channel: terminalUri }));
	});
}
