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
import { TerminalClaimKind, TerminalLifecycleStatus, type TerminalClaim } from '../../../../common/state/protocol/state.js';
import {
	buildDefaultChatUri,
	MessageAttachmentKind,
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
import type { AhpNotification } from '../../../../common/state/sessionProtocol.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

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

	/** The terminal's visible text, flattening command parts and raw output alike. */
	function terminalText(state: TerminalState): string {
		return state.content
			.map(part => part.type === 'command' ? part.output : part.value)
			.join('');
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

	conformanceTest(context, 'client title change updates session state', async function () {
		const { sessionUri } = await createSession('title-change');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionTitleChanged, title: 'Direct AHP Title' });

		assert.strictEqual((await sessionState(sessionUri)).title, 'Direct AHP Title');
	});

	conformanceTest(context, 'marking a session read sets the read status flag', async function () {
		const { sessionUri } = await createSession('read-set');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });

		assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsRead);
	});

	conformanceTest(context, 'marking a session unread clears the read status flag', async function () {
		const { sessionUri } = await createSession('read-clear');
		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsReadChanged, isRead: false });

		assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsRead, 0);
	});

	conformanceTest(context, 'archiving a session sets the archived status flag', async function () {
		const { sessionUri } = await createSession('archive-set');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsArchived);
	});

	conformanceTest(context, 'unarchiving a session clears the archived status flag', async function () {
		const { sessionUri } = await createSession('archive-clear');
		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsArchivedChanged, isArchived: false });

		assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsArchived, 0);
	});

	conformanceTest(context, 'session read and archived flags compose independently', async function () {
		const { sessionUri } = await createSession('status-compose');

		await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });
		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		const state = await sessionState(sessionUri);

		assert.deepStrictEqual({
			isRead: (state.status & SessionStatus.IsRead) !== 0,
			isArchived: (state.status & SessionStatus.IsArchived) !== 0,
		}, {
			isRead: true,
			isArchived: true,
		});
	});

	conformanceTest(context, 'session config changes merge with existing values', async function () {
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

	conformanceTest(context, 'session config replacement drops previous values', async function () {
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

	conformanceTest(context, 'empty session config replacement clears previous values', async function () {
		const { sessionUri } = await createSession('config-clear');
		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AutoApprove]: 'assisted' },
		});

		await dispatchAndWait(sessionUri, 2, {
			type: ActionType.SessionConfigChanged,
			config: {},
			replace: true,
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {});
	});

	conformanceTest(context, 'active client set adds a session participant', async function () {
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

	conformanceTest(context, 'active client tools retain their protocol schemas', async function () {
		const { sessionUri, clientId } = await createSession('active-client-tools');
		const tools = [{
			name: 'coverage_echo',
			description: 'Echoes a value',
			inputSchema: {
				type: 'object' as const,
				properties: { value: { type: 'string' } },
				required: ['value'],
			},
		}];

		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'Tool Client', tools },
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, [{
			clientId,
			displayName: 'Tool Client',
			tools,
		}]);
	});

	conformanceTest(context, 'active client set replaces an existing participant', async function () {
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

	conformanceTest(context, 'two active clients remain independently addressable', async function () {
		const { sessionUri, clientId } = await createSession('active-client-multiple');

		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'First', tools: [] },
		});
		await dispatchAndWait(sessionUri, 2, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId: 'second-client', displayName: 'Second', tools: [] },
		});

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients.map(client => client.clientId).sort(), [
			clientId,
			'second-client',
		].sort());
	});

	conformanceTest(context, 'removing one active client preserves its sibling', async function () {
		const { sessionUri, clientId } = await createSession('active-client-remove-one');
		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'First', tools: [] },
		});
		await dispatchAndWait(sessionUri, 2, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId: 'second-client', displayName: 'Second', tools: [] },
		});

		await dispatchAndWait(sessionUri, 3, { type: ActionType.SessionActiveClientRemoved, clientId });

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients.map(client => client.clientId), ['second-client']);
	});

	conformanceTest(context, 'active client removal removes the session participant', async function () {
		const { sessionUri, clientId } = await createSession('active-client-remove');
		await dispatchAndWait(sessionUri, 1, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { clientId, displayName: 'Coverage Client', tools: [] },
		});

		await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionActiveClientRemoved, clientId });

		assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, []);
	});

	conformanceTest(context, 'draft change stores a user message', async function () {
		const { chatUri } = await createSession('draft-set');
		const draft = userMessage('draft text');

		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });

		assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
	});

	conformanceTest(context, 'draft change preserves resource attachments', async function () {
		const { chatUri, workspace } = await createSession('draft-attachment');
		const draft: Message = {
			...userMessage('review this'),
			attachments: [{
				type: MessageAttachmentKind.Resource,
				uri: URI.file(join(workspace, 'draft.ts')).toString(),
				label: 'draft.ts',
				displayKind: 'document',
			}],
		};

		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });

		assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
	});

	conformanceTest(context, 'draft change preserves the selected model', async function () {
		const { chatUri } = await createSession('draft-model');
		const draft: Message = {
			...userMessage('model draft'),
			model: { id: 'coverage-model' },
		};

		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });

		assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
	});

	conformanceTest(context, 'draft change replaces the previous message', async function () {
		const { chatUri } = await createSession('draft-replace');
		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage('before') });

		await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged, draft: userMessage('after') });

		assert.deepStrictEqual((await chatState(chatUri)).draft, userMessage('after'));
	});

	conformanceTest(context, 'clearing a draft removes it from chat state', async function () {
		const { chatUri } = await createSession('draft-clear');
		await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage('draft') });

		await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged });

		assert.strictEqual((await chatState(chatUri)).draft, undefined);
	});

	conformanceTest(context, 'a message queued on an idle chat is promoted straight into a turn', async function () {
		const { chatUri } = await createSession('queue-promote');
		context.client.clearReceived();

		// Queueing exists to hold work while a turn is running. With nothing
		// running there is nothing to wait for, so the host must start the
		// message rather than park it — otherwise a queued message on an idle
		// chat would never run at all. `/rename` keeps the promoted turn inside
		// the host's local-command dispatcher, with no shell and no model.
		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatPendingMessageSet,
			kind: PendingMessageKind.Queued,
			id: 'queued-1',
			message: userMessage('/rename Queue Promoted'),
		});

		const started = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnStarted')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { queuedMessageId?: string }).queuedMessageId === 'queued-1',
			30_000,
		);
		const turnId = (getActionEnvelope(started).action as { turnId: string }).turnId;
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId,
			60_000,
		);

		// Promotion has to be atomic with removal: a message left in the queue
		// after being started would run a second time on the next idle event.
		assert.deepStrictEqual((await chatState(chatUri)).queuedMessages ?? [], []);
	});

	conformanceTest(context, 'removing a missing queued message leaves chat state unchanged', async function () {
		const { chatUri } = await createSession('queue-remove-missing');

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatPendingMessageRemoved,
			kind: PendingMessageKind.Queued,
			id: 'missing',
		});

		assert.strictEqual((await chatState(chatUri)).queuedMessages, undefined);
	});

	conformanceTest(context, 'reordering a missing queue leaves chat state unchanged', async function () {
		const { chatUri } = await createSession('queue-reorder-missing');

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatQueuedMessagesReordered,
			order: ['missing'],
		});

		assert.strictEqual((await chatState(chatUri)).queuedMessages, undefined);
	});

	conformanceTest(context, 'truncating at a missing turn leaves history unchanged', async function () {
		const { chatUri } = await createSession('truncate-missing');
		const before = await chatState(chatUri);

		await dispatchAndWait(chatUri, 1, {
			type: ActionType.ChatTruncated,
			turnId: 'missing-turn',
		});

		assert.deepStrictEqual((await chatState(chatUri)).turns, before.turns);
	});

	conformanceTest(context, 'cancelling a missing turn leaves the chat idle', async function () {
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

	conformanceTest(context, 'createTerminal exposes requested dimensions cwd and claim', async function () {
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

	conformanceTest(context, 'terminal resize updates terminal dimensions', async function () {
		await withTerminal('terminal-resize', async ({ terminalUri }) => {
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 120, rows: 40 });
			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({ cols: state.cols, rows: state.rows }, { cols: 120, rows: 40 });
		});
	});

	conformanceTest(context, 'successive terminal resizes retain the latest dimensions', async function () {
		await withTerminal('terminal-resize-latest', async ({ terminalUri }) => {
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 100, rows: 35 });
			await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalResized, cols: 140, rows: 50 });

			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({ cols: state.cols, rows: state.rows }, { cols: 140, rows: 50 });
		});
	});

	conformanceTest(context, 'terminal claim transfer preserves dimensions and cwd', async function () {
		await withTerminal('terminal-claim-metadata', async ({ sessionUri, terminalUri, workspace }) => {
			await dispatchAndWait(terminalUri, 1, {
				type: ActionType.TerminalClaimed,
				claim: { kind: TerminalClaimKind.Session, session: sessionUri, chat: buildDefaultChatUri(sessionUri) },
			});

			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({
				cwd: state.cwd,
				cols: state.cols,
				rows: state.rows,
			}, {
				cwd: URI.file(workspace).fsPath,
				cols: 90,
				rows: 30,
			});
		});
	});

	conformanceTest(context, 'terminal title change is broadcast', async function () {
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

	conformanceTest(context, 'terminal claim can transfer from the client to the session', async function () {
		await withTerminal('terminal-claim', async ({ sessionUri, terminalUri }) => {
			const claim: TerminalClaim = { kind: TerminalClaimKind.Session, session: sessionUri, chat: buildDefaultChatUri(sessionUri) };
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalClaimed, claim });
			assert.deepStrictEqual((await terminalState(terminalUri)).claim, claim);
		});
	});

	conformanceTest(context, 'terminal claim can transfer back to the client', async function () {
		await withTerminal('terminal-claim-return', async ({ sessionUri, terminalUri, clientId }) => {
			await dispatchAndWait(terminalUri, 1, {
				type: ActionType.TerminalClaimed,
				claim: { kind: TerminalClaimKind.Session, session: sessionUri, chat: buildDefaultChatUri(sessionUri) },
			});
			const clientClaim: TerminalClaim = { kind: TerminalClaimKind.Client, clientId };

			await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalClaimed, claim: clientClaim });

			assert.deepStrictEqual((await terminalState(terminalUri)).claim, clientClaim);
		});
	});

	conformanceTest(context, 'session terminal claims preserve turn and tool identifiers', async function () {
		await withTerminal('terminal-session-claim', async ({ sessionUri, terminalUri }) => {
			const claim: TerminalClaim = {
				kind: TerminalClaimKind.Session,
				session: sessionUri,
				chat: buildDefaultChatUri(sessionUri),
				turnId: 'turn-claim',
				toolCallId: 'tool-claim',
			};

			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalClaimed, claim });

			assert.deepStrictEqual((await terminalState(terminalUri)).claim, claim);
		});
	});

	conformanceTest(context, 'terminal input reaches the shell and produces output', async function () {
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
			const output = terminalText(await terminalState(terminalUri));
			assert.match(output, /(?:^|\D)42(?:\D|$)/);
		});
	});

	conformanceTest(context, 'terminal input preserves Unicode output', async function () {
		await withTerminal('terminal-unicode', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalInput, data: 'node -e "console.log(\'SNOWMAN_\'+String.fromCodePoint(0x2603))"\r' },
			});
			let streamedOutput = '';
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'terminal/data') || getActionEnvelope(n).channel !== terminalUri) {
					return false;
				}
				streamedOutput += (getActionEnvelope(n).action as { data: string }).data;
				return streamedOutput.includes('SNOWMAN_\u2603');
			}, 30_000);

			assert.match(terminalText(await terminalState(terminalUri)), /SNOWMAN_\u2603/);
		});
	});

	conformanceTest(context, 'clearing a terminal drops the scrollback the client already saw', async function () {
		await withTerminal('terminal-clear', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalInput, data: 'node -p "\'CLEAR_\'+\'MARKER\'"\r' },
			});
			let streamedOutput = '';
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'terminal/data') || getActionEnvelope(n).channel !== terminalUri) {
					return false;
				}
				streamedOutput += (getActionEnvelope(n).action as { readonly data: string }).data;
				return streamedOutput.includes('CLEAR_MARKER');
			}, 30_000);
			const before = terminalText(await terminalState(terminalUri));

			await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalCleared });

			// The scrollback lives in host state, not just in the client's view,
			// so clearing must drop it for every subscriber including one that
			// subscribes later.
			//
			// Asserting the buffer is *empty* would be wrong: the shell is live
			// and redraws its prompt as soon as the screen is cleared, so bytes
			// legitimately arrive after the clear reduces. What has to be gone
			// is the output the client had already accumulated.
			const after = terminalText(await terminalState(terminalUri));
			assert.deepStrictEqual({
				markerBeforeClear: before.includes('CLEAR_MARKER'),
				markerAfterClear: after.includes('CLEAR_MARKER'),
			}, {
				markerBeforeClear: true,
				markerAfterClear: false,
			});
		});
	});

	conformanceTest(context, 'clearing a terminal preserves dimensions and claim', async function () {
		await withTerminal('terminal-clear-metadata', async ({ terminalUri, clientId }) => {
			await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 111, rows: 37 });

			await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalCleared });

			const state = await terminalState(terminalUri);
			assert.deepStrictEqual({
				cols: state.cols,
				rows: state.rows,
				claim: state.claim,
			}, {
				cols: 111,
				rows: 37,
				claim: { kind: TerminalClaimKind.Client, clientId },
			});
		});
	});

	conformanceTest(context, 'a terminal whose shell exits reports its exit code', async function () {
		await withTerminal('terminal-exit', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalInput, data: 'exit\r' },
			});

			const exited = await context.client.waitForNotification(n =>
				isActionNotification(n, 'terminal/exited') && getActionEnvelope(n).channel === terminalUri,
				30_000,
			);

			// The exit code itself is the shell's, not the host's, so only its
			// presence and its arrival in state are contractual.
			const action = getActionEnvelope(exited).action as { exitCode?: number };
			const lifecycle = (await terminalState(terminalUri)).lifecycle;
			assert.deepStrictEqual({
				reportedExitCode: typeof action.exitCode,
				stateMatchesNotification: lifecycle.status === TerminalLifecycleStatus.Exited && lifecycle.exitCode === action.exitCode,
			}, {
				reportedExitCode: 'number',
				stateMatchesNotification: true,
			});
		});
	});

	conformanceTest(context, 'root state tracks terminals as they appear and disappear', async function () {
		// The first terminal also establishes the connection; root can only be
		// subscribed once the client has handshaked.
		await withTerminal('terminal-root', async ({ clientId, workspace }) => {
			await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			context.client.clearReceived();

			function terminalsIn(n: AhpNotification): readonly { resource: string }[] {
				return (getActionEnvelope(n).action as { terminals?: readonly { resource: string }[] }).terminals ?? [];
			}

			// Root is how a client discovers terminals it did not create itself, so
			// it has to be told on both edges, not only on creation.
			const observedUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${generateUuid()}` }).toString();
			let observedCreated = false;
			try {
				await context.client.call('createTerminal', {
					channel: observedUri,
					claim: { kind: TerminalClaimKind.Client, clientId },
					name: 'E2E terminal-root-observed',
					cwd: URI.file(workspace).toString(),
					cols: 90,
					rows: 30,
				});
				observedCreated = true;
				await context.client.waitForNotification(n =>
					isActionNotification(n, 'root/terminalsChanged')
					&& terminalsIn(n).some(terminal => terminal.resource === observedUri),
					30_000,
				);

				await disposeTerminal(observedUri);
				observedCreated = false;
				await context.client.waitForNotification(n =>
					isActionNotification(n, 'root/terminalsChanged')
					&& !terminalsIn(n).some(terminal => terminal.resource === observedUri),
					30_000,
				);
			} finally {
				if (observedCreated) {
					await disposeTerminal(observedUri);
				}
			}
		});
	});

	conformanceTest(context, 'root terminal metadata reflects title changes', async function () {
		await withTerminal('terminal-root-title', async ({ terminalUri }) => {
			await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalTitleChanged, title: 'Root Metadata Title' },
			});

			const changed = await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'root/terminalsChanged')) {
					return false;
				}
				const terminals = (getActionEnvelope(n).action as { terminals?: readonly { resource: string; title: string }[] }).terminals;
				return terminals?.some(terminal => terminal.resource === terminalUri && terminal.title === 'Root Metadata Title') ?? false;
			});

			assert.ok(isActionNotification(changed, 'root/terminalsChanged'));
		});
	});

	conformanceTest(context, 'root terminal metadata reflects claim transfers', async function () {
		await withTerminal('terminal-root-claim', async ({ sessionUri, terminalUri }) => {
			await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			const claim: TerminalClaim = {
				kind: TerminalClaimKind.Session,
				session: sessionUri,
				chat: buildDefaultChatUri(sessionUri),
				turnId: 'turn-root-claim',
			};
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalClaimed, claim },
			});

			const changed = await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'root/terminalsChanged')) {
					return false;
				}
				const terminals = (getActionEnvelope(n).action as { terminals?: readonly { resource: string; claim: TerminalClaim }[] }).terminals;
				return terminals?.some(terminal =>
					terminal.resource === terminalUri
					&& terminal.claim.kind === TerminalClaimKind.Session
					&& terminal.claim.session === claim.session
					&& terminal.claim.turnId === claim.turnId,
				) ?? false;
			});

			assert.ok(isActionNotification(changed, 'root/terminalsChanged'));
		});
	});

	conformanceTest(context, 'an exited terminal remains discoverable with its exit code until disposal', async function () {
		await withTerminal('terminal-root-exit', async ({ terminalUri }) => {
			context.client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: 1,
				action: { type: ActionType.TerminalInput, data: 'exit\r' },
			});
			const exited = await context.client.waitForNotification(n =>
				isActionNotification(n, 'terminal/exited') && getActionEnvelope(n).channel === terminalUri,
				30_000,
			);
			const exitCode = (getActionEnvelope(exited).action as { exitCode?: number }).exitCode;

			const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			const terminal = (root.snapshot!.state as RootState).terminals?.find(terminal => terminal.resource === terminalUri);
			const lifecycle = terminal?.lifecycle;
			assert.deepStrictEqual({
				listed: terminal !== undefined,
				reportedExitCode: typeof exitCode,
				stateMatchesNotification: lifecycle?.status === TerminalLifecycleStatus.Exited && lifecycle.exitCode === exitCode,
			}, {
				listed: true,
				reportedExitCode: 'number',
				stateMatchesNotification: true,
			});
		});
	});

	conformanceTest(context, 'disposeTerminal removes the terminal from root state', async function () {
		const { terminalUri } = await createTerminal('terminal-dispose');

		await disposeTerminal(terminalUri);

		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const state = root.snapshot!.state as RootState;
		assert.strictEqual(state.terminals?.some(terminal => terminal.resource === terminalUri) ?? false, false);
	});

	conformanceTest(context, 'creating a duplicate terminal resource is rejected', async function () {
		await withTerminal('terminal-duplicate', async ({ terminalUri, clientId }) => {
			await assert.rejects(context.client.call('createTerminal', {
				channel: terminalUri,
				claim: { kind: TerminalClaimKind.Client, clientId },
			}));
		});
	});

	conformanceTest(context, 'subscribing to an unknown terminal is rejected', async function () {
		await createSession('terminal-unknown');
		const terminalUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${generateUuid()}` }).toString();

		await assert.rejects(context.client.call<SubscribeResult>('subscribe', { channel: terminalUri }));
	});
}
