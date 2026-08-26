/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { FEEDBACK_ANNOTATION_META_KEY, type IFeedbackAnnotationMeta } from '../../../../common/meta/agentFeedbackAnnotations.js';
import { buildAnnotationsUri } from '../../../../common/annotationsUri.js';
import { buildOpenSessionLinkUri } from '../../../../common/openSessionLink.js';
import { SessionServerToolName } from '../../../../common/serverToolNames.js';
import type { ListSessionsResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, NotificationType, type ChatToolCallCompleteAction, type ChatToolCallStartAction, type SessionAddedParams, type StateAction } from '../../../../common/state/sessionActions.js';
import {
	buildDefaultChatUri,
	readSessionCreationReference,
	ROOT_STATE_URI,
	type AnnotationsState,
	type ChatState,
	type RootState,
	type SessionState,
} from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { createRealSession, driveChatTurnToCompletion, driveTurnToCompletion, resolveGitHubToken, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest } from '../harness/capiWireCodec.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

interface IServerToolTestSession {
	readonly sessionUri: string;
	readonly chatUri: string;
	readonly workspace: string;
}

interface IObservedToolCall {
	readonly start: ChatToolCallStartAction;
	readonly completion: ChatToolCallCompleteAction;
	readonly resultText: string;
}

interface ISeedFeedbackOptions {
	readonly id: string;
	readonly resource: string;
	readonly text: string;
	readonly state: IFeedbackAnnotationMeta['state'];
	readonly kind?: IFeedbackAnnotationMeta['kind'];
	readonly resolved?: boolean;
	readonly pendingAgentReveal?: boolean;
	readonly replies?: readonly string[];
}

const feedbackToolNames = ['addComment', 'listComments', 'replyToComment', 'deleteComments', 'resolveComments', 'viewUnreviewedComments'] as const;
const feedbackResourceUri = 'untitled://server-tools/reviewed.ts';
const sessionToolNames = [
	SessionServerToolName.ListSessions,
	SessionServerToolName.GetCurrentSession,
	SessionServerToolName.CreateSession,
	SessionServerToolName.CreateChat,
	SessionServerToolName.SendMessage,
	SessionServerToolName.GetSessionContext,
	SessionServerToolName.DeleteSession,
] as const;

export function defineServerToolsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;
	// Codex fails model authentication before a direct session lookup reaches the server tool.
	const supportsDirectSessionLookup = config.provider !== 'codex';
	// Claude omits the prior server-tool input from detailed session context.
	const supportsFullSessionContext = config.provider !== 'claude';
	// Codex fails model authentication while materializing the target session.
	const supportsCrossSessionSend = config.provider !== 'codex';
	// Claude leaves the target listed; Codex fails authentication while materializing it.
	const supportsCrossSessionDelete = config.provider === 'copilotcli';
	// Claude and Codex start another turn instead of rejecting a message to the current chat.
	const supportsSelfSendRejection = config.provider === 'copilotcli';
	// Model ids are not provider-qualified; Claude and Codex selections currently resolve to Copilot.
	const supportsProviderModelSessionCreation = config.provider === 'copilotcli';
	// Claude's create_chat server-tool turn does not complete after confirmation.
	const supportsServerToolCreateChat = config.provider === 'copilotcli';
	let nextClientSequence = 10_000;

	function reserveClientSequenceBlock(): number {
		const start = nextClientSequence;
		nextClientSequence += 100;
		return start;
	}

	async function addSession(prefix: string, workspace: string, stableResource = false): Promise<IServerToolTestSession> {
		const id = stableResource && config.provider === 'copilotcli' ? `e2e-server-tools-${prefix}` : generateUuid();
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${id}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'folder' },
		}, 30_000);
		createdSessions.push(sessionUri);
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return { sessionUri, chatUri, workspace };
	}

	async function createSession(prefix: string, stableResource = false): Promise<IServerToolTestSession> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-server-tools-${prefix}-`));
		tempDirs.push(workspace);
		if (!stableResource) {
			const sessionUri = await createRealSession(
				context.client,
				config,
				`server-tools-${prefix}-${config.provider}`,
				createdSessions,
				URI.file(workspace),
			);
			context.client.clearReceived();
			return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), workspace };
		}
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `server-tools-${prefix}-${config.provider}`,
		}, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		const session = await addSession(prefix, workspace, true);
		context.client.clearReceived();
		return session;
	}

	async function sessionState(sessionUri: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chatUri: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return result.snapshot!.state as ChatState;
	}

	async function annotationsState(sessionUri: string): Promise<AnnotationsState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: buildAnnotationsUri(sessionUri) });
		return result.snapshot!.state as AnnotationsState;
	}

	async function dispatchAndWait(channel: string, action: StateAction): Promise<void> {
		const clientSeq = reserveClientSequenceBlock();
		context.client.dispatch({ channel, clientSeq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel
			&& getActionEnvelope(n).origin?.clientSeq === clientSeq,
			30_000,
		);
	}

	async function seedFeedback(sessionUri: string, options: ISeedFeedbackOptions): Promise<void> {
		const annotationsUri = buildAnnotationsUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: annotationsUri });
		const meta: IFeedbackAnnotationMeta = {
			kind: options.kind ?? 'codeReview',
			state: options.state,
			sessionResource: sessionUri,
			...(options.pendingAgentReveal ? { pendingAgentReveal: true } : {}),
		};
		const entries = [
			{ id: `${options.id}:0`, text: options.text },
			...(options.replies ?? []).map((text, index) => ({ id: `${options.id}:${index + 1}`, text })),
		];
		await dispatchAndWait(annotationsUri, {
			type: ActionType.AnnotationsSet,
			annotation: {
				id: options.id,
				origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'seed-feedback' },
				resource: options.resource,
				range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
				resolved: options.resolved ?? false,
				entries,
				_meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta },
			},
		});
		context.client.clearReceived();
	}

	function toolNameMatches(observed: string, expected: string): boolean {
		return observed === expected || observed.endsWith(`__${expected}`);
	}

	async function driveServerTool(
		session: IServerToolTestSession,
		turnId: string,
		prompt: string,
		toolName: string,
		options: { readonly success?: boolean; readonly result?: readonly RegExp[] } = {},
	): Promise<{ readonly turn: Awaited<ReturnType<typeof driveTurnToCompletion>>; readonly tool: IObservedToolCall }> {
		const turn = await driveChatTurnToCompletion(context.client, session.chatUri, turnId, prompt, reserveClientSequenceBlock());
		const starts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallStartAction }))
			.filter(({ envelope, action }) => envelope.channel === session.chatUri && action.turnId === turnId && toolNameMatches(action.toolName, toolName));
		const start = starts.at(-1)?.action;
		assert.ok(start, `expected ${turnId} to start server tool ${toolName}`);
		assert.notStrictEqual(start.contributor?.kind, 'client');
		const completion = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallCompleteAction }))
			.find(({ envelope, action }) => envelope.channel === session.chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId)?.action;
		assert.ok(completion, `expected ${turnId} to complete server tool ${toolName}`);
		assert.strictEqual(completion.result.success, options.success ?? true);
		const resultText = textFromContent(completion.result.content ?? []);
		if (options.result) {
			for (const expected of options.result) {
				assert.match(resultText, expected);
			}
		}
		return { turn, tool: { start, completion, resultText } };
	}

	async function waitForChatIdle(chatUri: string): Promise<ChatState> {
		let state = await chatState(chatUri);
		if (state.activeTurn) {
			const turnId = state.activeTurn.id;
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/turnComplete')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId,
				90_000,
			);
			state = await chatState(chatUri);
		}
		assert.strictEqual(state.activeTurn, undefined);
		return state;
	}

	if (context.tier !== 'parity') {
		return;
	}

	function serverToolTest(title: string, run: Mocha.AsyncFunc, enabled = true): void {
		(enabled ? test : test.skip)(title, function () {
			this.timeout(180_000);
			return run.call(this);
		});
	}

	async function materializeSession(session: IServerToolTestSession, turnId: string, marker: string): Promise<void> {
		await driveTurnToCompletion(
			context.client,
			session.sessionUri,
			turnId,
			`Reply exactly "${marker}".`,
			reserveClientSequenceBlock(),
		);
	}

	serverToolTest('server tool: sessions advertise the complete host-owned tool catalog', async function () {
		const session = await createSession('catalog');
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-catalog', 'Reply exactly "ready".', reserveClientSequenceBlock());
		const toolNames = await retry(async () => {
			const state = await sessionState(session.sessionUri);
			if (!state.serverTools) {
				throw new Error('Server tools have not been advertised');
			}
			return state.serverTools.map(tool => tool.name);
		}, 100, 30);
		assert.deepStrictEqual(toolNames, [...feedbackToolNames, ...sessionToolNames]);
	});

	serverToolTest('server tool: listComments executes in-process with an empty annotation channel', async function () {
		const session = await createSession('comments-empty');
		const { tool } = await driveServerTool(
			session,
			'turn-comments-empty',
			'Call the listComments tool exactly once, then reply with exactly "listed".',
			'listComments',
		);
		assert.deepStrictEqual(JSON.parse(tool.resultText), { comments: [] });
	});

	serverToolTest('server tool: addComment converts a one-based input range to the zero-based annotations range', async function () {
		const session = await createSession('comment-add');
		await driveServerTool(
			session,
			'turn-comment-add',
			`Call addComment exactly once for ${feedbackResourceUri} with range startLineNumber 1, startColumn 7, endLineNumber 1, endColumn 13 and text "rename this", then reply exactly "added".`,
			'addComment',
			{ result: [/Comment added/] },
		);
		const annotations = (await annotationsState(session.sessionUri)).annotations;
		assert.deepStrictEqual(annotations.map(annotation => ({
			resource: annotation.resource,
			range: annotation.range,
			text: annotation.entries?.[0]?.text,
			meta: annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY],
		})), [{
			resource: feedbackResourceUri,
			range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
			text: 'rename this',
			meta: { kind: 'codeReview', state: 'created', sessionResource: session.sessionUri },
		}]);
	});

	serverToolTest('server tool: listComments returns accepted feedback and reports hidden review feedback', async function () {
		const session = await createSession('comments-list');
		const resource = feedbackResourceUri;
		await seedFeedback(session.sessionUri, { id: 'accepted-comment', resource, text: 'visible', state: 'accepted', replies: ['reply'] });
		await seedFeedback(session.sessionUri, { id: 'hidden-comment', resource, text: 'hidden', state: 'created' });
		const { tool } = await driveServerTool(
			session,
			'turn-comments-list',
			'Call listComments exactly once, then reply exactly "listed".',
			'listComments',
		);
		const result = JSON.parse(tool.resultText) as { comments: readonly { id: string; author?: string; replies?: readonly { author: string; text: string }[] }[]; note?: string };
		assert.deepStrictEqual({
			comments: result.comments.map(comment => ({ id: comment.id, author: comment.author, replies: comment.replies })),
			noteMentionsUnreviewed: result.note?.includes('1 code review comment') ?? false,
		}, {
			// The seeded entries carry no author, so the comment falls back to its
			// `codeReview` origin and the reply to the user.
			comments: [{ id: 'accepted-comment', author: 'agent', replies: [{ author: 'user', text: 'reply' }] }],
			noteMentionsUnreviewed: true,
		});
	});

	serverToolTest('server tool: resolveComments marks accepted feedback resolved', async function () {
		const session = await createSession('comment-resolve');
		const resource = feedbackResourceUri;
		await seedFeedback(session.sessionUri, { id: 'resolve-me', resource, text: 'resolve', state: 'accepted' });
		await driveServerTool(
			session,
			'turn-comment-resolve',
			'Call resolveComments exactly once with commentIds ["resolve-me"], then reply exactly "resolved".',
			'resolveComments',
			{ result: [/"updatedCommentIds":\s*\[\s*"resolve-me"/] },
		);
		const annotation = (await annotationsState(session.sessionUri)).annotations.find(annotation => annotation.id === 'resolve-me');
		assert.deepStrictEqual({
			resolved: annotation?.resolved,
			state: (annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY] as IFeedbackAnnotationMeta | undefined)?.state,
		}, {
			resolved: true,
			state: 'resolved',
		});
	});

	serverToolTest('server tool: resolveComments can reopen resolved feedback', async function () {
		const session = await createSession('comment-reopen');
		const resource = feedbackResourceUri;
		await seedFeedback(session.sessionUri, { id: 'reopen-me', resource, text: 'reopen', state: 'resolved', resolved: true });
		await driveServerTool(
			session,
			'turn-comment-reopen',
			'Call resolveComments exactly once with commentIds ["reopen-me"] and resolved false, then reply exactly "reopened".',
			'resolveComments',
			{ result: [/"resolved":\s*false/] },
		);
		const annotation = (await annotationsState(session.sessionUri)).annotations.find(annotation => annotation.id === 'reopen-me');
		assert.deepStrictEqual({
			resolved: annotation?.resolved,
			state: (annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY] as IFeedbackAnnotationMeta | undefined)?.state,
		}, {
			resolved: false,
			state: 'submitted',
		});
	});

	serverToolTest('server tool: deleteComments removes accepted feedback without touching hidden feedback', async function () {
		const session = await createSession('comment-delete');
		const resource = feedbackResourceUri;
		await seedFeedback(session.sessionUri, { id: 'delete-me', resource, text: 'delete', state: 'accepted' });
		await seedFeedback(session.sessionUri, { id: 'keep-hidden', resource, text: 'hidden', state: 'created' });
		const hiddenBefore = (await annotationsState(session.sessionUri)).annotations.find(annotation => annotation.id === 'keep-hidden');
		assert.ok(hiddenBefore);
		await driveServerTool(
			session,
			'turn-comment-delete',
			'Call deleteComments exactly once with commentIds ["delete-me"], then reply exactly "deleted".',
			'deleteComments',
			{ result: [/"deletedCommentIds":\s*\[\s*"delete-me"/] },
		);
		assert.deepStrictEqual((await annotationsState(session.sessionUri)).annotations, [hiddenBefore]);
	});

	serverToolTest('server tool: viewUnreviewedComments returns selected feedback and clears pending reveal state', async function () {
		const session = await createSession('comments-view');
		const resource = feedbackResourceUri;
		await seedFeedback(session.sessionUri, {
			id: 'reveal-me',
			resource,
			text: 'revealed',
			state: 'accepted',
			kind: 'prReview',
			pendingAgentReveal: true,
		});
		const { turn, tool } = await driveServerTool(
			session,
			'turn-comments-view',
			'Call viewUnreviewedComments exactly once, then reply exactly "viewed".',
			'viewUnreviewedComments',
			{ result: [/"id":\s*"reveal-me"/] },
		);
		assert.strictEqual(turn.sawPendingConfirmation, true);
		const annotation = (await annotationsState(session.sessionUri)).annotations.find(annotation => annotation.id === 'reveal-me');
		assert.deepStrictEqual({
			pendingAgentReveal: (annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY] as IFeedbackAnnotationMeta | undefined)?.pendingAgentReveal,
			result: (JSON.parse(tool.resultText) as { comments: readonly { id: string }[] }).comments.map(comment => comment.id),
		}, {
			pendingAgentReveal: undefined,
			result: ['reveal-me'],
		});
	});

	serverToolTest('server tool: get_current_session returns the invoking session metadata and open link', async function () {
		const session = await createSession('current-session');
		const { tool } = await driveServerTool(
			session,
			'turn-current-session',
			'Call get_current_session exactly once, then reply exactly "current".',
			SessionServerToolName.GetCurrentSession,
		);
		const result = JSON.parse(tool.resultText) as { session: string; openLink: string; workingDirectory?: string };
		assert.deepStrictEqual({
			session: result.session,
			openLink: result.openLink,
			workingDirectory: result.workingDirectory,
		}, {
			session: session.sessionUri,
			openLink: buildOpenSessionLinkUri(URI.parse(session.sessionUri)),
			workingDirectory: URI.file(session.workspace).toString(),
		});
	});

	serverToolTest('server tool: list_sessions returns live session metadata', async function () {
		const session = await createSession('sessions-list');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-list',
			`Call list_sessions exactly once with workspace "${session.workspace}", then reply exactly "listed".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string; workingDirectory?: string }[] };
		assert.deepStrictEqual(result.sessions.map(item => ({
			session: item.session,
			workingDirectory: item.workingDirectory,
		})), [{
			session: session.sessionUri,
			workingDirectory: URI.file(session.workspace).toString(),
		}]);
	});

	serverToolTest('server tool: list_sessions direct lookup accepts an open-session link', async function () {
		const session = await createSession('sessions-direct', true);
		const openLink = buildOpenSessionLinkUri(URI.parse(session.sessionUri));
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-direct',
			`Call list_sessions exactly once with session "${openLink}", then reply exactly "found".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		assert.deepStrictEqual(result.sessions.map(item => item.session), [session.sessionUri]);
	}, supportsDirectSessionLookup);

	serverToolTest('server tool: list_sessions workspace filter excludes sessions in other folders', async function () {
		const session = await createSession('sessions-workspace');
		const otherWorkspace = join(session.workspace, 'other');
		mkdirSync(otherWorkspace);
		const other = await addSession('sessions-workspace-other', otherWorkspace);
		await materializeSession(other, 'turn-sessions-workspace-target', 'WORKSPACE_TARGET_READY');
		context.client.clearReceived();
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-workspace',
			`Call list_sessions exactly once with workspace "${otherWorkspace}", then reply exactly "filtered".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		assert.deepStrictEqual(result.sessions.map(item => item.session), [other.sessionUri]);
	});

	serverToolTest('server tool: list_sessions can include an archived session on request', async function () {
		const session = await createSession('sessions-archived');
		const archived = await addSession('sessions-archived-target', session.workspace);
		await materializeSession(archived, 'turn-sessions-archived-target', 'ARCHIVED_TARGET_READY');
		await dispatchAndWait(archived.sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		context.client.clearReceived();
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-archived',
			'Call list_sessions exactly once with status ["archived"], then reply exactly "listed".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string; status?: string }[] };
		assert.deepStrictEqual(result.sessions.find(item => item.session === archived.sessionUri)?.status?.split(',').sort(), ['archived', 'idle']);
	});

	serverToolTest('server tool: list_sessions hides archived sessions by default', async function () {
		const session = await createSession('sessions-hide-archived');
		const archived = await addSession('sessions-hide-archived-target', session.workspace);
		await materializeSession(archived, 'turn-sessions-hide-archived-target', 'ARCHIVED_HIDDEN_READY');
		await dispatchAndWait(archived.sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		context.client.clearReceived();

		const { tool } = await driveServerTool(
			session,
			'turn-sessions-hide-archived',
			`Call list_sessions exactly once with workspace "${session.workspace}", then reply exactly "listed".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };

		assert.deepStrictEqual({
			includesActive: result.sessions.some(item => item.session === session.sessionUri),
			includesArchived: result.sessions.some(item => item.session === archived.sessionUri),
		}, {
			includesActive: true,
			includesArchived: false,
		});
	});

	serverToolTest('server tool: list_sessions includeArchived returns active and archived sessions', async function () {
		const session = await createSession('sessions-include-archived');
		const archived = await addSession('sessions-include-archived-target', session.workspace);
		await materializeSession(archived, 'turn-sessions-include-archived-target', 'ARCHIVED_INCLUDED_READY');
		await dispatchAndWait(archived.sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		context.client.clearReceived();

		const { tool } = await driveServerTool(
			session,
			'turn-sessions-include-archived',
			`Call list_sessions exactly once with workspace "${session.workspace}" and includeArchived true, then reply exactly "listed".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		const returned = new Set(result.sessions.map(item => item.session));

		assert.deepStrictEqual({
			includesActive: returned.has(session.sessionUri),
			includesArchived: returned.has(archived.sessionUri),
		}, {
			includesActive: true,
			includesArchived: true,
		});
	});

	serverToolTest('server tool: list_sessions status filter finds the invoking in-progress session', async function () {
		const session = await createSession('sessions-status');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-status',
			'Call list_sessions exactly once with status ["inProgress"], then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string; status?: string }[] };
		assert.deepStrictEqual(result.sessions.map(item => ({ session: item.session, status: item.status })), [{
			session: session.sessionUri,
			status: 'inProgress',
		}]);
	});

	serverToolTest('server tool: list_sessions status filter combines active and archived sessions', async function () {
		const session = await createSession('sessions-status-combined');
		const archived = await addSession('sessions-status-combined-target', session.workspace);
		await materializeSession(archived, 'turn-sessions-status-combined-target', 'COMBINED_TARGET_READY');
		await dispatchAndWait(archived.sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		context.client.clearReceived();

		const { tool } = await driveServerTool(
			session,
			'turn-sessions-status-combined',
			'Call list_sessions exactly once with status ["inProgress", "archived"], then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		const returned = new Set(result.sessions.map(item => item.session));

		assert.deepStrictEqual({
			includesActive: returned.has(session.sessionUri),
			includesArchived: returned.has(archived.sessionUri),
		}, {
			includesActive: true,
			includesArchived: true,
		});
	});

	serverToolTest('server tool: list_sessions unread filter returns the invoking unread session', async function () {
		const session = await createSession('sessions-unread');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-unread',
			'Call list_sessions exactly once with unread true, then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string; unread?: boolean }[] };
		assert.deepStrictEqual(result.sessions.map(item => ({ session: item.session, unread: item.unread })), [{
			session: session.sessionUri,
			unread: true,
		}]);
	});

	serverToolTest('server tool: list_sessions createdAfter accepts current sessions', async function () {
		const session = await createSession('sessions-created-after');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-created-after',
			`Call list_sessions exactly once with workspace "${session.workspace}" and createdAfter "2000-01-01T00:00:00Z", then reply exactly "filtered".`,
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		assert.ok(result.sessions.some(item => item.session === session.sessionUri));
	});

	serverToolTest('server tool: list_sessions createdAfter excludes sessions before the boundary', async function () {
		const session = await createSession('sessions-created-after-exclude');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-created-after-exclude',
			'Call list_sessions exactly once with createdAfter "2999-01-01T00:00:00Z", then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };

		assert.strictEqual(result.sessions.some(item => item.session === session.sessionUri), false);
	});

	serverToolTest('server tool: list_sessions createdBefore excludes current sessions', async function () {
		const session = await createSession('sessions-created-before');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-created-before',
			'Call list_sessions exactly once with createdBefore "2000-01-01T00:00:00Z", then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };
		assert.strictEqual(result.sessions.some(item => item.session === session.sessionUri), false);
	});

	serverToolTest('server tool: list_sessions createdBefore accepts sessions before a future boundary', async function () {
		const session = await createSession('sessions-created-before-include');
		const { tool } = await driveServerTool(
			session,
			'turn-sessions-created-before-include',
			'Call list_sessions exactly once with createdBefore "2999-01-01T00:00:00Z", then reply exactly "filtered".',
			SessionServerToolName.ListSessions,
		);
		const result = JSON.parse(tool.resultText) as { sessions: readonly { session: string }[] };

		assert.ok(result.sessions.some(item => item.session === session.sessionUri));
	});

	serverToolTest('server tool: create_chat defaults to the invoking session and starts its local prompt', async function () {
		const session = await createSession('create-chat-default');
		const before = new Set((await sessionState(session.sessionUri)).chats.map(chat => chat.resource));
		const { turn } = await driveServerTool(
			session,
			'turn-create-chat-default',
			'Call create_chat exactly once with prompt "/rename Created Peer", then reply exactly "created".',
			SessionServerToolName.CreateChat,
		);
		const after = await sessionState(session.sessionUri);
		const peer = after.chats.find(chat => !before.has(chat.resource));
		assert.ok(peer);
		const peerState = await waitForChatIdle(peer.resource);
		assert.deepStrictEqual({
			sawPendingConfirmation: turn.sawPendingConfirmation,
			messages: peerState.turns.map(turn => turn.message.text),
		}, {
			sawPendingConfirmation: true,
			messages: ['/rename Created Peer'],
		});
	}, config.supportsMultipleChats && supportsServerToolCreateChat);

	serverToolTest('server tool: create_chat applies an explicit peer title', async function () {
		const session = await createSession('create-chat-title');
		const before = new Set((await sessionState(session.sessionUri)).chats.map(chat => chat.resource));
		await driveServerTool(
			session,
			'turn-create-chat-title',
			'Call create_chat exactly once with prompt "/rename" and title "Explicit Peer", then reply exactly "created".',
			SessionServerToolName.CreateChat,
		);
		const after = await sessionState(session.sessionUri);
		const peer = after.chats.find(chat => !before.has(chat.resource));
		assert.ok(peer);
		await waitForChatIdle(peer.resource);
		assert.strictEqual((await sessionState(session.sessionUri)).chats.find(chat => chat.resource === peer.resource)?.title, 'Explicit Peer');
	}, config.supportsMultipleChats && supportsServerToolCreateChat);

	serverToolTest('server tool: get_session_context summary includes a completed prior turn', async function () {
		const session = await createSession('context-summary', true);
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-seed', 'Reply exactly "CONTEXT_READY".', reserveClientSequenceBlock());
		const { tool } = await driveServerTool(
			session,
			'turn-context-summary',
			`Call get_session_context exactly once with session "${session.sessionUri}", then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { detail: string; transcript: readonly { user?: string; assistant?: string }[] };
		assert.deepStrictEqual({
			detail: result.detail,
			first: result.transcript[0],
		}, {
			detail: 'summary',
			first: { turn: 1, state: 'complete', user: 'Reply exactly "CONTEXT_READY".', assistant: 'CONTEXT_READY' },
		});
	});

	serverToolTest('server tool: get_session_context accepts explicit summary detail', async function () {
		const session = await createSession('context-explicit-summary', true);
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-explicit-summary-seed', 'Reply exactly "SUMMARY_READY".', reserveClientSequenceBlock());
		const { tool } = await driveServerTool(
			session,
			'turn-context-explicit-summary',
			`Call get_session_context exactly once with session "${session.sessionUri}" and detail "summary", then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { detail: string; transcript: readonly { user?: string; assistant?: string }[] };

		assert.deepStrictEqual({
			detail: result.detail,
			first: result.transcript[0],
		}, {
			detail: 'summary',
			first: {
				turn: 1,
				state: 'complete',
				user: 'Reply exactly "SUMMARY_READY".',
				assistant: 'SUMMARY_READY',
			},
		});
	});

	serverToolTest('server tool: get_session_context accepts an open-session link', async function () {
		const session = await createSession('context-link', true);
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-link-seed', 'Reply exactly "LINK_READY".', reserveClientSequenceBlock());
		const link = buildOpenSessionLinkUri(URI.parse(session.sessionUri));
		const { tool } = await driveServerTool(
			session,
			'turn-context-link',
			`Call get_session_context exactly once with session "${link}", then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { transcript: readonly { user?: string; assistant?: string }[] };

		assert.deepStrictEqual(result.transcript[0], {
			turn: 1,
			state: 'complete',
			user: 'Reply exactly "LINK_READY".',
			assistant: 'LINK_READY',
		});
	});

	serverToolTest('server tool: get_session_context digest includes completed response text', async function () {
		const session = await createSession('context-digest', true);
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-digest-seed', 'Reply exactly "DIGEST_READY".', reserveClientSequenceBlock());
		const { tool } = await driveServerTool(
			session,
			'turn-context-digest',
			`Call get_session_context exactly once with session "${session.sessionUri}" and detail "digest", then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { detail: string; transcript: readonly { user?: string; assistant?: string }[] };

		assert.deepStrictEqual({
			detail: result.detail,
			first: result.transcript[0],
		}, {
			detail: 'digest',
			first: {
				turn: 1,
				state: 'complete',
				user: 'Reply exactly "DIGEST_READY".',
				assistant: 'DIGEST_READY',
			},
		});
	});

	serverToolTest('server tool: get_session_context full includes prior server-tool input', async function () {
		const session = await createSession('context-full', true);
		await driveServerTool(
			session,
			'turn-context-tool-seed',
			'Call list_sessions exactly once with no filters, then reply exactly "SEEDED".',
			SessionServerToolName.ListSessions,
		);
		const { tool } = await driveServerTool(
			session,
			'turn-context-full',
			`Call get_session_context exactly once with session "${session.sessionUri}" and detail "full", then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { transcript: readonly { toolCalls?: readonly { name: string; input?: string }[] }[] };
		assert.deepStrictEqual(result.transcript[0]?.toolCalls, [{ name: SessionServerToolName.ListSessions, input: '{}' }]);
	}, supportsFullSessionContext);

	serverToolTest('server tool: get_session_context transcriptLimit keeps only the newest turn', async function () {
		const session = await createSession('context-limit', true);
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-old', 'Reply exactly "OLD".', reserveClientSequenceBlock());
		await driveTurnToCompletion(context.client, session.sessionUri, 'turn-context-new', 'Reply exactly "NEW".', reserveClientSequenceBlock());
		const { tool } = await driveServerTool(
			session,
			'turn-context-limit',
			`Call get_session_context exactly once with session "${session.sessionUri}" and transcriptLimit 1, then reply exactly "read".`,
			SessionServerToolName.GetSessionContext,
		);
		const result = JSON.parse(tool.resultText) as { transcript: readonly { user?: string }[]; truncated: boolean };
		assert.deepStrictEqual({
			users: result.transcript.map(turn => turn.user),
			truncated: result.truncated,
		}, {
			users: [`Call get_session_context exactly once with session "${session.sessionUri}" and transcriptLimit 1, then reply exactly "read".`],
			truncated: true,
		});
	});

	serverToolTest('server tool: send_message starts a turn in another session', async function () {
		const session = await createSession('send-message', true);
		const target = await addSession('send-message-target', session.workspace, true);
		await materializeSession(target, 'turn-send-message-target-seed', 'TARGET_MATERIALIZED');
		context.client.clearReceived();
		const { turn } = await driveServerTool(
			session,
			'turn-send-message',
			`Call send_message exactly once with session "${target.sessionUri}" and message "/rename Target Via Send", then reply exactly "sent".`,
			SessionServerToolName.SendMessage,
		);
		const targetState = await waitForChatIdle(target.chatUri);
		assert.deepStrictEqual({
			sawPendingConfirmation: turn.sawPendingConfirmation,
			messages: targetState.turns.map(turn => turn.message.text),
		}, {
			sawPendingConfirmation: true,
			messages: ['Reply exactly "TARGET_MATERIALIZED".', '/rename Target Via Send'],
		});
	}, supportsCrossSessionSend);

	serverToolTest('server tool: create_session materializes a selected-model child session and starts its prompt', async function () {
		const session = await createSession('create-session');
		await materializeSession(session, 'turn-create-session-seed', 'PARENT_READY');
		const childPrompt = 'Reply exactly CHILD_READY.';
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const model = (root.snapshot!.state as RootState).agents
			.find(agent => agent.provider === config.provider)
			?.models.find(model => model.id === 'claude-opus-4.6');
		assert.ok(model);
		context.client.clearReceived();
		const { turn } = await driveServerTool(
			session,
			'turn-create-session',
			`Call create_session exactly once with workspace "${session.workspace}", prompt "${childPrompt}", and model "${model.id}", then reply exactly "created".`,
			SessionServerToolName.CreateSession,
		);
		const childAdded = await context.client.waitForNotification(notification => {
			if (notification.method !== NotificationType.SessionAdded) {
				return false;
			}
			const summary = (notification.params as SessionAddedParams).summary;
			return summary.resource !== session.sessionUri && summary.provider === model.provider;
		}, 30_000);
		const child = (childAdded.params as SessionAddedParams).summary;
		createdSessions.push(child.resource);
		const creationReference = readSessionCreationReference(child._meta);
		assert.ok(creationReference, 'child SessionAdded summary should include its creating turn');
		const childRequest = await retry(async () => {
			const requests = context.observedModelRequestBodies
				.map(summarizeAnthropicRequest)
				.filter(request => request !== undefined);
			const request = requests.find(request => request.messages.some(message => message.role === 'user' && message.content === childPrompt));
			if (!request) {
				throw new Error(`child prompt has not been requested; observed models ${requests.map(request => request.model).join(', ')}`);
			}
			return request;
		}, 50, 600);
		const childState = await waitForChatIdle(buildDefaultChatUri(child.resource));
		assert.deepStrictEqual({
			sawPendingConfirmation: turn.sawPendingConfirmation,
			provider: child.provider,
			messages: childState.turns.map(turn => turn.message.text),
			childRequestModel: childRequest.model,
			creationReference,
		}, {
			sawPendingConfirmation: true,
			provider: model.provider,
			messages: [childPrompt],
			childRequestModel: model.id,
			creationReference: {
				session: session.sessionUri,
				chat: session.chatUri,
				turnId: 'turn-create-session',
			},
		});
	}, supportsProviderModelSessionCreation);

	serverToolTest('server tool: delete_session removes a non-current session', async function () {
		const session = await createSession('delete-session', true);
		const target = await addSession('delete-session-target', session.workspace, true);
		await materializeSession(target, 'turn-delete-session-target-seed', 'DELETE_TARGET_READY');
		context.client.clearReceived();
		const { turn } = await driveServerTool(
			session,
			'turn-delete-session',
			`Call delete_session exactly once with session "${target.sessionUri}", then reply exactly "deleted".`,
			SessionServerToolName.DeleteSession,
		);
		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.deepStrictEqual({
			sawPendingConfirmation: turn.sawPendingConfirmation,
			stillListed: result.items.some(item => item.resource === target.sessionUri),
		}, {
			sawPendingConfirmation: true,
			stillListed: false,
		});
		const trackedIndex = createdSessions.indexOf(target.sessionUri);
		if (trackedIndex >= 0) {
			createdSessions.splice(trackedIndex, 1);
		}
	}, supportsCrossSessionDelete);

	serverToolTest('server tool: send_message refuses to target the invoking chat', async function () {
		const session = await createSession('send-self', true);
		await driveServerTool(
			session,
			'turn-send-self',
			`Call send_message exactly once with session "${session.sessionUri}" and message "loop", then reply exactly "refused".`,
			SessionServerToolName.SendMessage,
			{ success: false, result: [/current chat/i] },
		);
		const state = await chatState(session.chatUri);
		assert.deepStrictEqual({
			messages: state.turns.map(turn => turn.message.text),
			activeTurn: state.activeTurn,
			queuedMessages: state.queuedMessages,
			steeringMessage: state.steeringMessage,
		}, {
			messages: [`Call send_message exactly once with session "${session.sessionUri}" and message "loop", then reply exactly "refused".`],
			activeTurn: undefined,
			queuedMessages: undefined,
			steeringMessage: undefined,
		});
	}, supportsSelfSendRejection);

	serverToolTest('server tool: delete_session refuses to delete the invoking session', async function () {
		const session = await createSession('delete-current', true);
		await driveServerTool(
			session,
			'turn-delete-current',
			`You must call delete_session exactly once with session "${session.sessionUri}" so its safety check can reject the call. Do not refuse on your own. After the tool fails, reply exactly "refused".`,
			SessionServerToolName.DeleteSession,
			{ success: false, result: [/current session/i] },
		);
		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.strictEqual(result.items.some(item => item.resource === session.sessionUri), true);
	});
}
