/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import type { AgentEvent } from 'son-of-anton-core/dist/agents/agentEvents';
import type { AgentStack } from 'son-of-anton-core/dist/agents/AgentStackFactory';
import type { ChatContextLike, ChatRequestLike, ChatStreamLike } from 'son-of-anton-core/dist/chatStream';
import { CliCancellation } from '../cancellation';
import {
	JsonRpcErrorCode,
	type AuthenticateRequestParams,
	type ContentBlock,
	type InitializeRequestParams,
	type InitializeResult,
	type NewSessionRequestParams,
	type NewSessionResult,
	type PromptRequestParams,
	type PromptResult,
	type PromptStopReason,
	type SessionNotificationParams,
	type SessionUpdate,
} from './protocol';

/** Protocol version this build implements. The public ACP spec is at v1. */
export const PROTOCOL_VERSION = 1;

/**
 * Handler-side error so the dispatcher can map domain failures onto JSON-RPC
 * error responses without leaking thrown native errors to the client.
 */
export class AcpError extends Error {
	constructor(readonly code: number, message: string, readonly data?: unknown) {
		super(message);
	}
}

/**
 * Active prompt state — only one is live at a time per spec. We keep the
 * cancellation token here so `session/cancel` can flip it without the
 * dispatcher having to thread it through every handler.
 */
interface ActivePrompt {
	readonly sessionId: string;
	readonly cancellation: CliCancellation;
}

interface SessionState {
	readonly sessionId: string;
	readonly cwd: string;
	readonly history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Dependencies the handlers need. `sendNotification` is wired by the server
 * loop — handlers call it for streaming updates while a prompt runs.
 *
 * `hasAnyApiKey` is checked at startup (env vars are mirrored into the secret
 * store by `bootstrapCredentials`) but we keep it as a callback so future
 * iterations can refresh it without restarting the process.
 */
export interface HandlerDeps {
	readonly stack: AgentStack;
	readonly sendNotification: (method: string, params: unknown) => void;
	readonly hasAnyApiKey: () => boolean;
	readonly defaultCwd: string;
}

/**
 * Handler set for the public ACP method surface. Each handler returns the
 * `result` portion of the JSON-RPC response (or void for notifications);
 * the dispatcher wraps it in a JSON-RPC envelope.
 */
export class AcpHandlers {
	private session: SessionState | null = null;
	private active: ActivePrompt | null = null;

	constructor(private readonly deps: HandlerDeps) { }

	// -----------------------------------------------------------------------
	// initialize
	// -----------------------------------------------------------------------

	async initialize(params: InitializeRequestParams | undefined): Promise<InitializeResult> {
		const requested = params?.protocolVersion;
		// Spec: respond with the client's requested version if we support it,
		// otherwise the highest version we do support. We only speak v1 today.
		const negotiated = requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION;
		return {
			protocolVersion: negotiated,
			agentCapabilities: {
				promptCapabilities: {
					image: false,
					audio: false,
					embeddedContext: false,
				},
				loadSession: false,
			},
			// CLI v1 reads keys from env vars at startup; no interactive auth.
			authMethods: [],
		};
	}

	// -----------------------------------------------------------------------
	// authenticate
	// -----------------------------------------------------------------------

	async authenticate(_params: AuthenticateRequestParams | undefined): Promise<Record<string, never>> {
		if (!this.deps.hasAnyApiKey()) {
			throw new AcpError(
				JsonRpcErrorCode.AuthRequired,
				'no API key configured. Set ANTHROPIC_API_KEY (or another supported provider env var) before launching the ACP server.',
			);
		}
		// Spec: response is an empty object on success.
		return {};
	}

	// -----------------------------------------------------------------------
	// session/new
	// -----------------------------------------------------------------------

	async newSession(params: NewSessionRequestParams | undefined): Promise<NewSessionResult> {
		// v1 supports a single live session per process. Replacing it
		// invalidates any in-flight prompt — the spec doesn't forbid this and
		// it keeps the server from leaking history across reconnects.
		if (this.active) {
			this.active.cancellation.cancel();
			this.active = null;
		}
		const sessionId = randomUUID();
		this.session = {
			sessionId,
			cwd: params?.cwd ?? this.deps.defaultCwd,
			history: [],
		};
		return { sessionId };
	}

	// -----------------------------------------------------------------------
	// session/prompt
	// -----------------------------------------------------------------------

	async prompt(params: PromptRequestParams | undefined): Promise<PromptResult> {
		if (!params) {
			throw new AcpError(JsonRpcErrorCode.InvalidParams, 'session/prompt requires params');
		}
		const session = this.session;
		if (!session || session.sessionId !== params.sessionId) {
			throw new AcpError(
				JsonRpcErrorCode.SessionNotFound,
				`unknown session id: ${params.sessionId}`,
			);
		}
		if (this.active) {
			throw new AcpError(
				JsonRpcErrorCode.InvalidRequest,
				'a prompt is already in flight for this session',
			);
		}

		const text = extractText(params.prompt);
		if (!text) {
			throw new AcpError(JsonRpcErrorCode.InvalidParams, 'prompt has no text content');
		}

		const cancellation = new CliCancellation();
		this.active = { sessionId: session.sessionId, cancellation };

		try {
			const stopReason = await this.runOrchestrator(session, text, cancellation);
			return { stopReason };
		} finally {
			this.active = null;
		}
	}

	// -----------------------------------------------------------------------
	// session/cancel (notification — no response)
	// -----------------------------------------------------------------------

	cancel(params: { sessionId: string } | undefined): void {
		if (!params || !this.active || params.sessionId !== this.active.sessionId) {
			return;
		}
		this.active.cancellation.cancel();
	}

	// -----------------------------------------------------------------------
	// Internal: orchestrator driver
	// -----------------------------------------------------------------------

	private async runOrchestrator(
		session: SessionState,
		userText: string,
		cancellation: CliCancellation,
	): Promise<PromptStopReason> {
		const sessionId = session.sessionId;
		const send = (update: SessionUpdate): void => {
			const params: SessionNotificationParams = { sessionId, update };
			this.deps.sendNotification('session/update', params);
		};

		// Buffer assistant text so we can append it to the in-process history
		// once the turn completes. (Conversational continuity is best-effort —
		// the orchestrator currently treats each `handleChatRequest` call as a
		// fresh turn; the history is here so a future hook can lift it into
		// the request context.)
		let assistantText = '';

		// `markdown()` is the only method the orchestrator actually calls into.
		// We capture text into the same chunk stream so editors that listen
		// solely for `agent_message_chunk` still see the response prose.
		const stream: ChatStreamLike = {
			markdown: (value: string) => {
				if (!value) {
					return;
				}
				assistantText += value;
				send({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: value },
				});
			},
			progress: () => { /* surfaced via session/update if needed in v2 */ },
		};

		const request: ChatRequestLike = { prompt: userText };
		const context: ChatContextLike = { history: session.history };

		const onEvent = (event: AgentEvent): void => {
			mapAgentEventToUpdate(event, send);
			if (event.type === 'token') {
				assistantText += event.token;
			}
		};

		try {
			await this.deps.stack.orchestrator.handleChatRequest(
				request,
				context,
				stream,
				cancellation,
				onEvent,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			send({ sessionUpdate: 'error', message });
			throw new AcpError(JsonRpcErrorCode.InternalError, message);
		}

		// Append to history regardless of cancellation so a partially streamed
		// reply isn't entirely lost from the in-process record.
		session.history.push({ role: 'user', content: userText });
		if (assistantText) {
			session.history.push({ role: 'assistant', content: assistantText });
		}

		return cancellation.isCancellationRequested ? 'cancelled' : 'end_turn';
	}
}

/**
 * Concatenate any `text`-typed content blocks in the prompt array. Non-text
 * blocks are skipped because v1 advertises `image`/`audio`/`embeddedContext`
 * as `false` in `agentCapabilities.promptCapabilities`.
 */
function extractText(blocks: ReadonlyArray<ContentBlock>): string {
	let out = '';
	for (const block of blocks) {
		if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
			out += (block as { text: string }).text;
		}
	}
	return out.trim();
}

/**
 * Map a core `AgentEvent` onto an ACP `session/update` notification. The
 * orchestrator emits richer events than the spec defines; we collapse them
 * onto the closest spec-defined kind and drop the rest. (Subtask events get
 * surfaced through `markdown()` already, so swallowing them here keeps the
 * client surface focused.)
 */
function mapAgentEventToUpdate(event: AgentEvent, send: (u: SessionUpdate) => void): void {
	switch (event.type) {
		case 'token':
			// Token already fed via stream.markdown(); avoid double-streaming.
			return;
		case 'plan-proposed':
			send({
				sessionUpdate: 'plan',
				entries: event.plan.subtasks.map(s => ({
					content: `@${s.assignee}: ${s.instruction}`,
					priority: 'medium',
					status: 'pending',
				})),
			});
			return;
		case 'subtask-started':
			send({
				sessionUpdate: 'tool_call',
				toolCallId: event.subtaskId,
				title: `@${event.assignee}: ${event.instruction}`,
				status: 'in_progress',
				kind: 'think',
			});
			return;
		case 'subtask-completed':
			send({
				sessionUpdate: 'tool_call_update',
				toolCallId: event.subtaskId,
				status: 'completed',
				rawOutput: { summary: event.summary },
			});
			return;
		case 'subtask-failed':
			send({
				sessionUpdate: 'tool_call_update',
				toolCallId: event.subtaskId,
				status: 'failed',
				rawOutput: { error: event.error },
			});
			return;
		case 'error':
			send({ sessionUpdate: 'error', message: event.message });
			return;
		default:
			// Includes subtask-token / subtask-ready / subtask-reassigned /
			// subtask-blocked / final — already echoed via markdown chunks
			// or otherwise not represented in the public ACP surface.
			return;
	}
}
