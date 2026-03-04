/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Options, Query, SDKAssistantMessage, SDKMessage, SDKResultMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import {
	IAgentDeltaEvent,
	IAgentIdleEvent,
	IAgentMessageEvent,
	IAgentProgressEvent,
	IAgentToolCompleteEvent,
	IAgentToolStartEvent,
	AgentSession,
} from '../../common/agentService.js';
import {
	getClaudeInvocationMessage,
	getClaudePastTenseMessage,
	getClaudeShellLanguage,
	getClaudeToolDisplayName,
	getClaudeToolInputString,
	getClaudeToolKind,
	isHiddenClaudeTool,
} from './claudeToolDisplay.js';

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

/**
 * Wraps a single Claude Agent SDK session. Uses the `query()` function with
 * streaming input (`AsyncIterable<SDKUserMessage>`) so the session stays alive
 * across multiple user messages.
 *
 * Emits {@link IAgentProgressEvent} for each SDK message, matching the same
 * event shape used by the Copilot SDK wrapper.
 */
export class ClaudeSession extends Disposable {
	private readonly _disposables = this._register(new DisposableStore());

	private _query: Query | undefined;
	private _abortController = new AbortController();

	/** Queue of user prompts waiting to be yielded to the SDK. */
	private _promptQueue: { prompt: string; deferred: DeferredPromise<void> }[] = [];
	/** Pending DeferredPromise that the prompt iterable awaits on when the queue is empty. */
	private _pendingPrompt: DeferredPromise<{ prompt: string; deferred: DeferredPromise<void> }> | undefined;

	/** Tracks active tool calls so we can emit past-tense messages on completion. */
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined }>();

	private readonly _onProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onProgress = this._onProgress.event;

	private readonly _session: URI;

	constructor(
		readonly sessionId: string,
		private readonly _model: string | undefined,
		private readonly _cwd: string | undefined,
		private readonly _logService: ILogService,
	) {
		super();

		this._session = AgentSession.uri('claude', this.sessionId);

		this._disposables.add(toDisposable(() => {
			this._abortController.abort();
			// Reject any pending prompts
			for (const queued of this._promptQueue) {
				queued.deferred.error(new Error('Session disposed'));
			}
			this._promptQueue = [];
			this._pendingPrompt?.error(new Error('Session disposed'));
			this._pendingPrompt = undefined;
		}));
	}

	/**
	 * Start the session by invoking the SDK `query()` function. This begins
	 * the message processing loop.
	 */
	async start(): Promise<void> {
		const { query } = await import('@anthropic-ai/claude-agent-sdk');

		const options: Options = {
			cwd: this._cwd ?? process.cwd(),
			model: this._model,
			abortController: this._abortController,
			sessionId: this.sessionId,
			permissionMode: 'bypassPermissions',
			allowDangerouslySkipPermissions: true,
			systemPrompt: {
				type: 'preset',
				preset: 'claude_code',
			},
			stderr: data => this._logService.error(`[Claude:${this.sessionId}] stderr: ${data}`),
		};

		this._logService.info(`[Claude:${this.sessionId}] Starting query...`);
		this._query = query({
			prompt: this._createPromptIterable(),
			options,
		});

		// Start the message processing loop (fire-and-forget)
		void this._processMessages().catch(err => {
			this._logService.error(`[Claude:${this.sessionId}] Unhandled error in message processing loop`, err);
		});
	}

	/**
	 * Abort the current turn by signaling the AbortController.
	 */
	abort(): void {
		this._logService.info(`[Claude:${this.sessionId}] Aborting...`);
		this._abortController.abort();
		// Create a new AbortController for future turns
		this._abortController = new AbortController();
	}

	/**
	 * Send a user message to the running session.
	 */
	async send(prompt: string): Promise<void> {
		if (!this._query) {
			throw new Error('Session not started');
		}

		const deferred = new DeferredPromise<void>();
		const entry = { prompt, deferred };
		this._promptQueue.push(entry);

		// If the prompt iterable is waiting, fulfill it immediately
		if (this._pendingPrompt) {
			const pending = this._pendingPrompt;
			this._pendingPrompt = undefined;
			pending.complete(entry);
		}

		return deferred.p;
	}

	/**
	 * Async generator that yields user messages to the SDK.
	 * Waits for messages to appear in the queue before yielding.
	 */
	private async *_createPromptIterable(): AsyncIterable<SDKUserMessage> {
		while (true) {
			let entry: { prompt: string; deferred: DeferredPromise<void> };

			if (this._promptQueue.length > 0) {
				entry = this._promptQueue[0];
			} else {
				// Wait for a message to be queued
				this._pendingPrompt = new DeferredPromise();
				entry = await this._pendingPrompt.p;
			}

			yield {
				type: 'user',
				message: {
					role: 'user',
					content: entry.prompt,
				},
				parent_tool_use_id: null,
				session_id: this.sessionId,
			};

			// Wait for this request to complete before yielding the next
			await entry.deferred.p;
		}
	}

	/**
	 * Process messages from the SDK query generator and emit progress events.
	 */
	private async _processMessages(): Promise<void> {
		try {
			for await (const message of this._query!) {
				this._handleMessage(message);
			}
			this._logService.info(`[Claude:${this.sessionId}] Query generator ended`);
		} catch (err) {
			if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
				this._logService.info(`[Claude:${this.sessionId}] Session aborted`);
			} else {
				this._logService.error(`[Claude:${this.sessionId}] Error processing messages`, err);
			}
		}
	}

	private _handleMessage(message: SDKMessage): void {
		switch (message.type) {
			case 'assistant':
				this._handleAssistantMessage(message as SDKAssistantMessage);
				break;
			case 'result':
				this._handleResultMessage(message as SDKResultMessage);
				break;
			default:
				this._logService.trace(`[Claude:${this.sessionId}] Unhandled message type: ${message.type}`);
				break;
		}
	}

	private _handleAssistantMessage(message: SDKAssistantMessage): void {
		if (message.error) {
			this._logService.error(`[Claude:${this.sessionId}] Assistant error: ${message.error}`);
		}

		const content = message.message.content;
		const textParts: string[] = [];

		for (const block of content) {
			if (block.type === 'text') {
				textParts.push(block.text);
			} else if (block.type === 'tool_use') {
				this._handleToolUse(block.id, block.name, block.input as Record<string, unknown>);
			}
		}

		if (textParts.length > 0) {
			const fullText = textParts.join('');
			// Emit as a message event
			this._onProgress.fire({
				session: this._session,
				type: 'message',
				role: 'assistant',
				messageId: message.uuid,
				content: fullText,
			} satisfies IAgentMessageEvent);

			// Also emit as a delta for streaming display
			this._onProgress.fire({
				session: this._session,
				type: 'delta',
				messageId: message.uuid,
				content: fullText,
			} satisfies IAgentDeltaEvent);
		}
	}

	private _handleToolUse(toolCallId: string, toolName: string, input: Record<string, unknown>): void {
		if (isHiddenClaudeTool(toolName)) {
			this._logService.trace(`[Claude:${this.sessionId}] Tool use (hidden): ${toolName}`);
			return;
		}

		const displayName = getClaudeToolDisplayName(toolName);
		const toolArgs = tryStringify(input);
		let parameters: Record<string, unknown> | undefined;
		if (toolArgs) {
			try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
		}

		this._activeToolCalls.set(toolCallId, { toolName, displayName, parameters });
		const toolKind = getClaudeToolKind(toolName);

		this._onProgress.fire({
			session: this._session,
			type: 'tool_start',
			toolCallId,
			toolName,
			displayName,
			invocationMessage: getClaudeInvocationMessage(toolName, displayName, parameters),
			toolInput: getClaudeToolInputString(toolName, parameters, toolArgs),
			toolKind,
			language: toolKind === 'terminal' ? getClaudeShellLanguage(toolName) : undefined,
			toolArguments: toolArgs,
		} satisfies IAgentToolStartEvent);
	}

	private _handleResultMessage(message: SDKResultMessage): void {
		this._logService.info(`[Claude:${this.sessionId}] Result: type=${message.type}, subtype=${message.subtype}`);

		// Complete any pending tool calls
		for (const [toolCallId, tracked] of this._activeToolCalls) {
			this._onProgress.fire({
				session: this._session,
				type: 'tool_complete',
				toolCallId,
				success: true,
				pastTenseMessage: getClaudePastTenseMessage(tracked.toolName, tracked.displayName, tracked.parameters, true),
			} satisfies IAgentToolCompleteEvent);
		}
		this._activeToolCalls.clear();

		// Emit idle event
		this._onProgress.fire({
			session: this._session,
			type: 'idle',
		} satisfies IAgentIdleEvent);

		// Resolve the current request
		if (this._promptQueue.length > 0) {
			const completed = this._promptQueue.shift()!;
			completed.deferred.complete();
		}
	}

	override dispose(): void {
		this._query?.close();
		super.dispose();
	}
}
