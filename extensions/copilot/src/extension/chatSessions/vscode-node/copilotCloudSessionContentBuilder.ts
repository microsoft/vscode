/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pathLib from 'path';
import { AgentTaskGetResponse, AgentTaskSession, AgentTaskSessionEvent, AgentTaskState } from '@vscode/copilot-api';
import type { SessionEvent } from '@github/copilot/sdk';
import * as vscode from 'vscode';
import { ChatRequestTurn, ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseMultiDiffPart, ChatResponseProgressPart, ChatResponseThinkingProgressPart, ChatResponseTurn2, ChatResult, ChatToolInvocationPart, MarkdownString, Uri } from 'vscode';
import { IGitService } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { ILogService } from '../../../platform/log/common/logService';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { appendResponsePartsForEvent, createResponseEventRenderContext, flushPendingAssistantMessage, ResponseEventRenderContext } from '../common/sessionEventRenderer';
import { CLI_TOOL_EVENT_HANDLERS } from '../copilotcli/common/copilotCLITools';
import { getAuthorDisplayName, isFailedTaskState } from '../vscode/copilotCodingAgentUtils';

export interface SessionResponseLogChunk {
	choices: Array<{
		finish_reason?: 'tool_calls' | 'null' | (string & {});
		delta: {
			content?: string;
			role: 'assistant' | (string & {});
			tool_calls?: Array<{
				function: {
					arguments: string;
					name: string;
				};
				id: string;
				type: string;
				index: number;
			}>;
		};
	}>;
	created: number;
	id: string;
	usage: {
		completion_tokens: number;
		prompt_tokens: number;
		prompt_tokens_details: {
			cached_tokens: number;
		};
		total_tokens: number;
	};
	model: string;
	object: string;
}

export interface ToolCall {
	function: {
		arguments: string;
		name: 'bash' | 'reply_to_comment' | (string & {});
	};
	id: string;
	type: string;
	index: number;
}

export interface AssistantDelta {
	content?: string;
	role: 'assistant' | (string & {});
	tool_calls?: ToolCall[];
}

export interface Choice {
	finish_reason?: 'tool_calls' | (string & {});
	delta: {
		content?: string;
		role: 'assistant' | (string & {});
		tool_calls?: ToolCall[];
	};
}

export interface StrReplaceEditorToolData {
	command: 'view' | 'edit' | string;
	filePath?: string;
	fileLabel?: string;
	parsedContent?: { content: string; fileA: string | undefined; fileB: string | undefined };
	viewRange?: { start: number; end: number };
}

export namespace StrReplaceEditorToolData {
	export function is(value: any): value is StrReplaceEditorToolData {
		return value && (typeof value.command === 'string');
	}
}

export interface BashToolData {
	commandLine: {
		original: string;
	};
	language: 'bash';
}

export interface ParsedToolCallDetails {
	toolName: string;
	invocationMessage: string;
	pastTenseMessage?: string;
	originMessage?: string;
	toolSpecificData?: StrReplaceEditorToolData | BashToolData;
}

/**
 * Best-effort human-readable error detail for a terminally-failed task (v2). Prefers the last
 * non-dismissed `session.error` event (`(errorType) message`), falling back to a `session.shutdown`
 * event's `errorReason`. Returns undefined when no detail is available — e.g. an agent that failed
 * to launch before emitting any error event, where the failure is only reflected in the task state.
 * Scans the full event list because a `session.error` emitted during bootstrap (before the first
 * user message) is suppressed from the rendered turn history.
 */
export function extractTaskErrorDetail(events: readonly AgentTaskSessionEvent[]): string | undefined {
	const errorEvent = findLast(events, e => e.type === 'session.error' && !e.dismissed);
	if (errorEvent) {
		const data = errorEvent.data as { errorType?: string; message?: string };
		const message = data.message?.trim();
		if (message) {
			return data.errorType ? `(${data.errorType}) ${message}` : message;
		}
	}
	const shutdownEvent = findLast(events, e => e.type === 'session.shutdown' && !e.dismissed);
	if (shutdownEvent) {
		const data = shutdownEvent.data as { shutdownType?: string; errorReason?: string };
		const reason = data.errorReason?.trim();
		if (data.shutdownType === 'error' && reason) {
			return reason;
		}
	}
	return undefined;
}

/**
 * The notice shown for a terminally-stopped task (v2): `Copilot stopped: <reason>`. The reason is
 * the concrete error detail when one is available (`session.error`/`session.shutdown`), otherwise a
 * word derived from the terminal task state — "cancelled" for a user/agent cancellation and "timed
 * out" for a timeout, neither of which emits an error event. Failed tasks with no detail fall back
 * to a generic "an error occurred".
 */
export function formatTaskStoppedMessage(state: AgentTaskState, detail: string | undefined): string {
	const reason = detail ?? defaultStopReasonForState(state);
	return vscode.l10n.t('Copilot stopped: {0}', reason);
}

function defaultStopReasonForState(state: AgentTaskState): string {
	switch (state) {
		case 'cancelled':
			return vscode.l10n.t('cancelled');
		case 'timed_out':
			return vscode.l10n.t('timed out');
		default:
			return vscode.l10n.t('an error occurred');
	}
}

export class ChatSessionContentBuilder {
	constructor(
		private type: string,
		@IGitService private readonly _gitService: IGitService,
		@ILogService private readonly _logService: ILogService,
	) {
	}

	public async buildSessionHistory(
		problemStatementPromise: Promise<string | undefined>,
		sessions: SessionInfo[],
		pullRequest: PullRequestSearchItem,
		getLogsForSession: (id: string) => Promise<string>,
		initialReferences: Promise<vscode.ChatPromptReference[]>,
	): Promise<Array<ChatRequestTurn | ChatResponseTurn2>> {
		const history: Array<ChatRequestTurn | ChatResponseTurn2> = [];

		// Process all sessions concurrently and assemble results in order
		const sessionResults = await Promise.all(
			sessions.map(async (session, sessionIndex) => {
				const [logs, problemStatement] = await Promise.all([getLogsForSession(session.id), sessionIndex === 0 ? problemStatementPromise : Promise.resolve(undefined)]);

				const turns: Array<ChatRequestTurn | ChatResponseTurn2> = [];

				// Create request turn with references for the first session
				const references = sessionIndex === 0 ? Array.from(await initialReferences) : [];
				turns.push(new ChatRequestTurn2(
					problemStatement || session.name,
					undefined, // command
					references, // references
					this.type,
					[], // toolReferences
					[],
					undefined,
					undefined,
					undefined
				));

				// Create the PR card right after problem statement for first session
				if (sessionIndex === 0 && pullRequest.author && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
					const plaintextBody = pullRequest.body;

					const card = new vscode.ChatResponsePullRequestPart({ command: 'github.copilot.chat.openPullRequestReroute', title: vscode.l10n.t('View Pull Request {0}', `#${pullRequest.number}`), arguments: [pullRequest.number] }, pullRequest.title, plaintextBody, getAuthorDisplayName(pullRequest.author), `#${pullRequest.number}`);
					const cardTurn = new vscode.ChatResponseTurn2([card], {}, this.type);
					turns.push(cardTurn);
				}

				const response = await this.createResponseTurn(pullRequest, logs, session);
				if (response) {
					turns.push(response);
				}

				return { sessionIndex, turns };
			})
		);

		// Assemble results in correct order
		sessionResults
			.sort((a, b) => a.sessionIndex - b.sessionIndex)
			.forEach(result => history.push(...result.turns));

		return history;
	}

	/**
	 * Render a Task API task as chat history. Each entry in `task.sessions[]` is one turn
	 * (request = the turn prompt; response = a markdown summary derived from events scoped
	 * to that turn). This does NOT call the SSE log parser — events are typed.
	 *
	 * `pullRequest` is shown as a header card only when the task happens to have a PR.
	 */
	public buildTaskHistory(
		task: AgentTaskGetResponse,
		events: readonly AgentTaskSessionEvent[],
		pullRequest: PullRequestSearchItem | undefined,
		initialReferences: Promise<vscode.ChatPromptReference[]>,
	): Promise<Array<ChatRequestTurn | ChatResponseTurn2>> {
		return (async () => {
			const history: Array<ChatRequestTurn | ChatResponseTurn2> = [];
			const references = Array.from(await initialReferences);
			const isTurnBoundary = (e: AgentTaskSessionEvent): e is AgentTaskSessionEvent & { data: { content?: string } } =>
				e.type === 'user.message' && !e.dismissed && isUserAuthoredMessage(e.data);

			// Single pass: skip bootstrap events between `session.requested`/`session.start`
			// and the next user-authored `user.message` (which opens a new turn), and append
			// everything else to the current turn. Events that arrive before any turn opens
			// (rare, only happens if the stream starts mid-bootstrap) land in `preTurnEvents`
			// and are used as the synthesized turn's events below.
			const turns: { prompt: string; events: AgentTaskSessionEvent[] }[] = [];
			const preTurnEvents: AgentTaskSessionEvent[] = [];
			let suppressing = false;
			for (const event of events) {
				if (event.type === 'session.requested' || event.type === 'session.start') {
					suppressing = true;
					continue;
				}
				if (isTurnBoundary(event)) {
					suppressing = false;
					turns.push({ prompt: event.data.content ?? '', events: [] });
				} else if (!suppressing) {
					(turns.length > 0 ? turns[turns.length - 1].events : preTurnEvents).push(event);
				}
			}

			// Brand-new task with no user.message yet (just bootstrap): synthesize a single
			// turn from the first session's prompt so the request bubble isn't empty and
			// never shows the AI-generated title.
			if (turns.length === 0) {
				turns.push({ prompt: task.sessions?.[0]?.prompt ?? task.name ?? '', events: preTurnEvents });
			}

			const latestSession = task.sessions?.[task.sessions.length - 1];

			turns.forEach((turn, index) => {
				const turnReferences = index === 0 ? references : [];
				history.push(new ChatRequestTurn2(
					turn.prompt,
					undefined,
					turnReferences,
					this.type,
					[],
					[],
					undefined,
					undefined,
					undefined,
				));

				// PR card after the first request, if a PR is attached.
				if (index === 0 && pullRequest && pullRequest.author && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
					const card = new vscode.ChatResponsePullRequestPart(
						{ command: 'github.copilot.chat.openPullRequestReroute', title: vscode.l10n.t('View Pull Request {0}', `#${pullRequest.number}`), arguments: [pullRequest.number] },
						pullRequest.title,
						pullRequest.body,
						getAuthorDisplayName(pullRequest.author),
						`#${pullRequest.number}`,
					);
					history.push(new vscode.ChatResponseTurn2([card], {}, this.type));
				}

				// Only the latest turn can still be in-progress. When the task itself terminally
				// failed, surface a failure notice (with any available error detail) instead of a
				// stuck progress spinner — the latest session state can still read as active (e.g.
				// "Failed to launch agent"). Detail is extracted from the full event list because a
				// bootstrap `session.error` is suppressed from the rendered turns above.
				// Only the latest turn can still be in-progress. When the task terminally stopped,
				// surface a "Copilot stopped: <reason>" notice instead of a stuck progress spinner —
				// the latest session state can still read as active (e.g. "Failed to launch agent"
				// or a cancelled turn). Detail is extracted from the full event list because a
				// bootstrap `session.error` is suppressed from the rendered turns above; a cancelled
				// or timed-out task emits no error event, so the reason falls back to the task state.
				const isLatestTurn = index === turns.length - 1;
				const state = isLatestTurn ? latestSession?.state : undefined;
				let failureMessage: string | undefined;
				if (isLatestTurn && isFailedTaskState(task.state)) {
					const detail = extractTaskErrorDetail(events);
					this._logService.trace(`[ChatSessionContentBuilder] task ${task.id} stopped (state=${task.state}); errorDetail=${detail ?? 'none'}`);
					failureMessage = formatTaskStoppedMessage(task.state, detail);
				}
				history.push(...this.buildTaskResponseTurn(turn.events, state, failureMessage));
			});

			return history;
		})();
	}

	/**
	 * Renders one Task API turn into a {@link ChatResponseTurn2}. Three rules,
	 * shared with the live {@link TaskTurnStreamer} so post-stream `refresh()`
	 * is idempotent:
	 *
	 * 1. Render tool cards eagerly from `assistant.message.toolRequests` (deduped
	 *    by `toolCallId`); `tool.execution_complete` is unreliable for synthesised
	 *    setup ops like `run_setup`.
	 * 2. Skip `tool.execution_complete` for tools already rendered by rule 1.
	 * 3. Render `assistant.message.content` only for the final reply (last message
	 *    with content, no `parentToolCallId`, no `toolRequests`); intermediate
	 *    messages carry narration that would clutter the view.
	 */
	private buildTaskResponseTurn(events: readonly AgentTaskSessionEvent[], state: AgentTaskSession['state'] | undefined, failureMessage?: string): ChatResponseTurn2[] {
		const lastFinalMessage = findLast(events, e =>
			!e.dismissed
			&& e.type === 'assistant.message'
			&& !!e.data.content
			&& !e.data.parentToolCallId
			&& !((e.data as { toolRequests?: readonly unknown[] }).toolRequests?.length)
		);

		const ctx = createResponseEventRenderContext(this._logService, CLI_TOOL_EVENT_HANDLERS);
		const renderedToolCallIds = new Set<string>();

		for (const event of events) {
			if (event.dismissed) {
				continue;
			}

			if (event.type === 'assistant.message') {
				const data = event.data as { parentToolCallId?: string; toolRequests?: ReadonlyArray<{ name?: string; toolCallId?: string; arguments?: unknown }> };
				if (!data.parentToolCallId && data.toolRequests) {
					for (const req of data.toolRequests) {
						if (!req?.toolCallId || renderedToolCallIds.has(req.toolCallId)) {
							continue;
						}
						renderedToolCallIds.add(req.toolCallId);
						const part = this.createToolPartFromRequest(req);
						if (part) {
							ctx.currentResponseParts.push(part);
						}
					}
				}
				if (event !== lastFinalMessage) {
					continue;
				}
			} else if (event.type === 'tool.execution_complete') {
				const toolCallId = (event.data as { toolCallId?: string }).toolCallId;
				if (toolCallId && renderedToolCallIds.has(toolCallId)) {
					continue;
				}
			}

			appendResponsePartsForEvent(remapCustomAgentEventType(event) as unknown as SessionEvent, ctx);
		}
		flushPendingAssistantMessage(ctx);

		const parts = [...ctx.currentResponseParts];
		if (parts.length === 0) {
			if (failureMessage !== undefined) {
				// The task ended in an unsuccessful terminal state (e.g. "Failed to launch agent")
				// without emitting any renderable events. Surface the failure instead of a spinner.
				parts.push(new ChatResponseMarkdownPart(failureMessage));
			} else if (state === 'in_progress' || state === 'queued') {
				// TODO: Handle in-progress sessions correctly
				parts.push(new ChatResponseProgressPart(vscode.l10n.t('Session is in progress...')));
			}
		}
		return [new ChatResponseTurn2(parts, {}, this.type)];
	}

	/**
	 * Build a tool-invocation part from an `assistant.message.toolRequests` entry.
	 * Shared by the history path and the live streamer so both produce identical cards
	 * (which is what makes the `refresh()` after live-streaming idempotent).
	 */
	public createToolPartFromRequest(req: { name?: string; toolCallId?: string; arguments?: unknown }): vscode.ChatToolInvocationPart | vscode.ChatResponseThinkingProgressPart | undefined {
		if (!req.name || !req.toolCallId) {
			return undefined;
		}
		const toolCall: ToolCall = {
			function: {
				name: req.name,
				arguments: typeof req.arguments === 'string' ? req.arguments : safeStringifyToolArgs(req.arguments),
			},
			id: req.toolCallId,
			type: 'function',
			index: 0,
		};
		try {
			return this.createToolInvocationPart(undefined, toolCall);
		} catch (e) {
			this._logService.warn(`[ChatSessionContentBuilder] Failed to render tool request ${req.name}: ${e}`);
			return undefined;
		}
	}

	/**
	 * Append a single Task API event into a long-lived render context. Used by the
	 * live-streaming poll loop to incrementally produce response parts as events arrive.
	 * Skips `dismissed` events; the SDK helper handles `assistant.message` /
	 * `assistant.message_delta` deduping via the context's `processedMessages` set.
	 */
	public static appendTaskEventToContext<TToolCall>(event: AgentTaskSessionEvent, ctx: ResponseEventRenderContext<TToolCall>): void {
		if (event.dismissed) {
			return;
		}
		appendResponsePartsForEvent(remapCustomAgentEventType(event) as unknown as SessionEvent, ctx);
	}

	private async createResponseTurn(pullRequest: PullRequestSearchItem, logs: string, session: SessionInfo): Promise<ChatResponseTurn2 | undefined> {
		if (logs.trim().length > 0) {
			return await this.parseSessionLogsIntoResponseTurn(pullRequest, logs, session);
		} else if (session.state === 'in_progress' || session.state === 'queued') {
			// For in-progress sessions without logs, create a placeholder response
			const placeholderParts = [new ChatResponseProgressPart('Session is initializing...')];
			const responseResult: ChatResult = {};
			return new ChatResponseTurn2(placeholderParts, responseResult, this.type);
		} else {
			// For completed sessions without logs, add an empty response to maintain pairing
			const emptyParts = [new ChatResponseMarkdownPart('_No logs available for this session_')];
			const responseResult: ChatResult = {};
			return new ChatResponseTurn2(emptyParts, responseResult, this.type);
		}
	}

	private async parseSessionLogsIntoResponseTurn(pullRequest: PullRequestSearchItem, logs: string, session: SessionInfo): Promise<ChatResponseTurn2 | undefined> {
		try {
			const logChunks = this.parseSessionLogs(logs);
			const responseParts: Array<ChatResponseMarkdownPart | ChatToolInvocationPart | ChatResponseMultiDiffPart> = [];

			for (const chunk of logChunks) {
				if (!chunk.choices || !Array.isArray(chunk.choices)) {
					continue;
				}

				for (const choice of chunk.choices) {
					const delta = choice.delta;
					if (delta.role === 'assistant') {
						this.processAssistantDelta(delta, choice, pullRequest, responseParts);
					}

				}
			}

			if (responseParts.length > 0) {
				const responseResult: ChatResult = {};
				return new ChatResponseTurn2(responseParts, responseResult, this.type);
			}

			return undefined;
		} catch (error) {
			return undefined;
		}
	}

	public parseSessionLogs(rawText: string): SessionResponseLogChunk[] {
		const parts = rawText
			.split(/\r?\n/)
			.filter(part => part.startsWith('data: '))
			.map(part => part.slice('data: '.length).trim())
			.map(part => JSON.parse(part));

		return parts as SessionResponseLogChunk[];
	}

	private processAssistantDelta(
		delta: AssistantDelta,
		choice: Choice,
		pullRequest: PullRequestSearchItem,
		responseParts: Array<ChatResponseMarkdownPart | ChatToolInvocationPart | ChatResponseMultiDiffPart | ChatResponseThinkingProgressPart>,
	): string {
		let currentResponseContent = '';
		if (delta.role === 'assistant') {
			const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : undefined;
			// Handle special case for run_custom_setup_step
			if (
				choice.finish_reason === 'tool_calls' &&
				toolCalls?.length &&
				(toolCalls[0].function.name === 'run_custom_setup_step' || toolCalls[0].function.name === 'run_setup')
			) {
				const toolCall = toolCalls[0];
				let args: { name?: string } = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// fallback to empty args
				}

				if (delta.content && delta.content.trim()) {
					const toolPart = this.createToolInvocationPart(pullRequest, toolCall, args.name || delta.content);
					if (toolPart) {
						responseParts.push(toolPart);
						if (toolPart instanceof ChatResponseThinkingProgressPart) {
							responseParts.push(new ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
						}
					}
				}
				// Skip if content is empty (running state)
			} else {
				if (delta.content) {
					if (!delta.content.startsWith('<pr_title>') && !delta.content.startsWith('<error>')) {
						currentResponseContent += delta.content;
					}
				}

				const isError = delta.content?.startsWith('<error>');
				if (toolCalls) {
					// Add any accumulated content as markdown first
					if (currentResponseContent.trim()) {
						responseParts.push(new ChatResponseMarkdownPart(currentResponseContent.trim()));
						currentResponseContent = '';
					}

					for (const toolCall of toolCalls) {
						const toolPart = this.createToolInvocationPart(pullRequest, toolCall, delta.content || '');
						if (toolPart) {
							responseParts.push(toolPart);
							if (toolPart instanceof ChatResponseThinkingProgressPart) {
								responseParts.push(new ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
							}
						}
					}

					if (isError) {
						const toolPart = new ChatToolInvocationPart('Command', 'command');
						// Remove <error> at the start and </error> at the end
						const cleaned = (delta.content ?? '').replace(/^\s*<error>\s*/i, '').replace(/\s*<\/error>\s*$/i, '');
						toolPart.invocationMessage = cleaned;
						toolPart.isError = true;
						responseParts.push(toolPart);
					}
				} else {
					const trimmedContent = currentResponseContent.trim();
					if (trimmedContent) {
						// TODO@rebornix @osortega validate if this is the only finish_reason for session end.
						if (choice.finish_reason === 'stop') {
							responseParts.push(new ChatResponseMarkdownPart(trimmedContent));
						} else {
							responseParts.push(new ChatResponseThinkingProgressPart(trimmedContent, '', { vscodeReasoningDone: true }));
						}
						currentResponseContent = '';
					}
				}
			}
		}
		return currentResponseContent;
	}

	public createToolInvocationPart(pullRequest: PullRequestSearchItem | undefined, toolCall: ToolCall, deltaContent: string = ''): ChatToolInvocationPart | ChatResponseThinkingProgressPart | undefined {
		if (!toolCall.function?.name || !toolCall.id) {
			return undefined;
		}

		// Hide reply_to_comment tool
		if (toolCall.function.name === 'reply_to_comment') {
			return undefined;
		}

		const toolPart = new ChatToolInvocationPart(toolCall.function.name, toolCall.id);
		toolPart.isComplete = true;
		toolPart.isError = false;
		toolPart.isConfirmed = true;

		try {
			const toolDetails = this.parseToolCallDetails(toolCall, deltaContent);
			toolPart.toolName = toolDetails.toolName;

			if (toolPart.toolName === 'think') {
				return new ChatResponseThinkingProgressPart(toolDetails.invocationMessage);
			}

			if (toolCall.function.name === 'bash') {
				toolPart.invocationMessage = new MarkdownString(`\`\`\`bash\n${toolDetails.invocationMessage}\n\`\`\``);
			} else {
				toolPart.invocationMessage = new MarkdownString(toolDetails.invocationMessage);
			}

			if (toolDetails.pastTenseMessage) {
				toolPart.pastTenseMessage = new MarkdownString(toolDetails.pastTenseMessage);
			}
			if (toolDetails.originMessage) {
				toolPart.originMessage = new MarkdownString(toolDetails.originMessage);
			}
			if (toolDetails.toolSpecificData) {
				if (StrReplaceEditorToolData.is(toolDetails.toolSpecificData)) {
					if ((toolDetails.toolSpecificData.command === 'view' || toolDetails.toolSpecificData.command === 'edit') && toolDetails.toolSpecificData.fileLabel) {
						const currentRepository = this._gitService.activeRepository.get();
						const uri = currentRepository?.rootUri ? Uri.file(pathLib.join(currentRepository.rootUri.fsPath, toolDetails.toolSpecificData.fileLabel)) : Uri.file(toolDetails.toolSpecificData.fileLabel);
						toolPart.invocationMessage = new MarkdownString(`${toolPart.toolName} [](${uri.toString()})` + (toolDetails.toolSpecificData?.viewRange ? `, lines ${toolDetails.toolSpecificData.viewRange?.start} to ${toolDetails.toolSpecificData.viewRange?.end}` : ''));
						toolPart.invocationMessage.supportHtml = true;
						toolPart.pastTenseMessage = new MarkdownString(`${toolPart.toolName} [](${uri.toString()})` + (toolDetails.toolSpecificData?.viewRange ? `, lines ${toolDetails.toolSpecificData.viewRange?.start} to ${toolDetails.toolSpecificData.viewRange?.end}` : ''));
					}
				} else {
					toolPart.toolSpecificData = toolDetails.toolSpecificData;
				}
			}
		} catch (error) {
			toolPart.toolName = toolCall.function.name || 'unknown';
			toolPart.invocationMessage = new MarkdownString(`Tool: ${toolCall.function.name}`);
			toolPart.isError = true;
		}

		return toolPart;
	}

	/**
	 * Convert an absolute agent-host file path to a workspace-relative label.
	 *
	 * Agent-host paths all follow `<workspace-root>/<owner>/<repo>/<path>`, only the
	 * root differs:
	 * - Jobs API (v1): `/home/runner/work/<owner>/<repo>/<path>`
	 * - Task API (v2): `/tmp/workspace/<owner>/<repo>/<path>` (or `/workspace/...`)
	 *
	 * If none of the known roots match, fall back to the basename — better to show
	 * just the filename than to render a bare "Edit"/"Read" card.
	 */
	private toFileLabel(file: string): string {
		const stripped = file.replace(/^\/(?:home\/runner\/work|tmp\/workspace|workspace)\/[^/]+\/[^/]+\//, '');
		return stripped !== file ? stripped : pathLib.basename(file);
	}

	private parseRange(view_range: unknown): { start: number; end: number } | undefined {
		if (!view_range) {
			return undefined;
		}

		if (!Array.isArray(view_range)) {
			return undefined;
		}

		if (view_range.length !== 2) {
			return undefined;
		}

		const start = view_range[0];
		const end = view_range[1];

		if (typeof start !== 'number' || typeof end !== 'number') {
			return undefined;
		}

		return {
			start,
			end
		};
	}

	/**
	 * Parse diff content and extract file information
	 */
	private parseDiff(content: string): { content: string; fileA: string | undefined; fileB: string | undefined } | undefined {
		const lines = content.split(/\r?\n/g);
		let fileA: string | undefined;
		let fileB: string | undefined;

		let startDiffLineIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith('diff --git')) {
				const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
				if (match) {
					fileA = match[1];
					fileB = match[2];
				}
			} else if (line.startsWith('@@ ')) {
				startDiffLineIndex = i + 1;
				break;
			}
		}
		if (startDiffLineIndex < 0) {
			return undefined;
		}

		return {
			content: lines.slice(startDiffLineIndex).join('\n'),
			fileA: typeof fileA === 'string' ? '/' + fileA : undefined,
			fileB: typeof fileB === 'string' ? '/' + fileB : undefined
		};
	}

	/**
	  * Parse tool call arguments and return normalized tool details
	  */
	private parseToolCallDetails(
		toolCall: {
			function: { name: string; arguments: string };
			id: string;
			type: string;
			index: number;
		},
		content: string
	): ParsedToolCallDetails {
		// Parse arguments once with graceful fallback
		let args: { command?: string; path?: string; prDescription?: string; commitMessage?: string; view_range?: unknown } = {};
		try { args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}; } catch { /* ignore */ }

		const name = toolCall.function.name;

		// Small focused helpers to remove duplication while preserving behavior
		const buildReadDetails = (filePath: string | undefined, parsedRange: { start: number; end: number } | undefined, opts?: { parsedContent?: { content: string; fileA: string | undefined; fileB: string | undefined } }): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			if (fileLabel === undefined || fileLabel === '') {
				return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
			}
			const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
			// Default helper returns bracket variant (used for generic view). Plain variant handled separately for str_replace_editor non-diff.
			return {
				toolName: 'Read',
				invocationMessage: `Read [](${fileLabel})${rangeSuffix}`,
				pastTenseMessage: `Read [](${fileLabel})${rangeSuffix}`,
				toolSpecificData: {
					command: 'view',
					filePath: filePath,
					fileLabel: fileLabel,
					parsedContent: opts?.parsedContent,
					viewRange: parsedRange
				}
			};
		};

		const buildEditDetails = (filePath: string | undefined, command: string = 'edit', parsedRange: { start: number; end: number } | undefined, opts?: { defaultName?: string }): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
			let invocationMessage: string;
			let pastTenseMessage: string;
			if (fileLabel) {
				invocationMessage = `Edit [](${fileLabel})${rangeSuffix}`;
				pastTenseMessage = `Edit [](${fileLabel})${rangeSuffix}`;
			} else {
				if (opts?.defaultName === 'Create') {
					invocationMessage = pastTenseMessage = `Create File ${filePath}`;
				} else {
					invocationMessage = pastTenseMessage = (opts?.defaultName || 'Edit');
				}
				invocationMessage += rangeSuffix;
				pastTenseMessage += rangeSuffix;
			}

			return {
				toolName: opts?.defaultName || 'Edit',
				invocationMessage,
				pastTenseMessage,
				toolSpecificData: fileLabel ? {
					command: command || (opts?.defaultName === 'Create' ? 'create' : (command || 'edit')),
					filePath: filePath,
					fileLabel: fileLabel,
					viewRange: parsedRange
				} : undefined
			};
		};

		const buildStrReplaceDetails = (filePath: string | undefined): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const message = fileLabel ? `Edit [](${fileLabel})` : `Edit ${filePath}`;
			return {
				toolName: 'Edit',
				invocationMessage: message,
				pastTenseMessage: message,
				toolSpecificData: fileLabel ? { command: 'str_replace', filePath, fileLabel } : undefined
			};
		};

		const buildCreateDetails = (filePath: string | undefined): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const message = fileLabel ? `Create [](${fileLabel})` : `Create File ${filePath}`;
			return {
				toolName: 'Create',
				invocationMessage: message,
				pastTenseMessage: message,
				toolSpecificData: fileLabel ? { command: 'create', filePath, fileLabel } : undefined
			};
		};

		const buildBashDetails = (bashArgs: typeof args, contentStr: string): ParsedToolCallDetails => {
			const command = bashArgs.command ? `$ ${bashArgs.command}` : undefined;
			const bashContent = [command, contentStr].filter(Boolean).join('\n');

			const MAX_CONTENT_LENGTH = 200;
			let displayContent = bashContent;
			if (bashContent && bashContent.length > MAX_CONTENT_LENGTH) {
				// Check if content contains EOF marker (heredoc pattern)
				const hasEOF = (bashContent && /<<\s*['"]?EOF['"]?/.test(bashContent));
				if (hasEOF) {
					// show the command line up to EOL
					const firstLineEnd = bashContent.indexOf('\n');
					if (firstLineEnd > 0) {
						const firstLine = bashContent.substring(0, firstLineEnd);
						const remainingChars = bashContent.length - firstLineEnd - 1;
						displayContent = firstLine + `\n... [${remainingChars} characters of heredoc content]`;
					} else {
						displayContent = bashContent;
					}
				} else {
					displayContent = bashContent.substring(0, MAX_CONTENT_LENGTH) + `\n... [${bashContent.length - MAX_CONTENT_LENGTH} more characters]`;
				}
			}

			const details: ParsedToolCallDetails = { toolName: 'Run Bash command', invocationMessage: bashContent || 'Run Bash command' };
			if (bashArgs.command) { details.toolSpecificData = { commandLine: { original: displayContent ?? '' }, language: 'bash' }; }
			return details;
		};

		switch (name) {
			case 'str_replace_editor': {
				if (args.command === 'view') {
					const parsedContent = this.parseDiff(content);
					const parsedRange = this.parseRange(args.view_range);
					if (parsedContent) {
						const file = parsedContent.fileA ?? parsedContent.fileB;
						const fileLabel = file && this.toFileLabel(file);
						if (fileLabel === '') {
							return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
						} else if (fileLabel === undefined) {
							return { toolName: 'Read', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
						} else {
							const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
							return {
								toolName: 'Read',
								invocationMessage: `Read [](${fileLabel})${rangeSuffix}`,
								pastTenseMessage: `Read [](${fileLabel})${rangeSuffix}`,
								toolSpecificData: { command: 'view', filePath: file, fileLabel, parsedContent, viewRange: parsedRange }
							};
						}
					}
					// No diff parsed: use PLAIN (non-bracket) variant for str_replace_editor views
					const plainRange = this.parseRange(args.view_range);
					const fp = args.path; const fl = fp && this.toFileLabel(fp);
					if (fl === undefined || fl === '') {
						return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
					}
					const suffix = plainRange ? `, lines ${plainRange.start} to ${plainRange.end}` : '';
					return {
						toolName: 'Read',
						invocationMessage: `Read ${fl}${suffix}`,
						pastTenseMessage: `Read ${fl}${suffix}`,
						toolSpecificData: { command: 'view', filePath: fp, fileLabel: fl, viewRange: plainRange }
					};
				}
				return buildEditDetails(args.path, args.command, this.parseRange(args.view_range));
			}
			case 'str_replace':
				return buildStrReplaceDetails(args.path);
			case 'create':
				return buildCreateDetails(args.path);
			case 'view':
				return buildReadDetails(args.path, this.parseRange(args.view_range)); // generic view always bracket variant
			case 'think': {
				const thought = (args as unknown as { thought?: string }).thought || content || 'Thought';
				return { toolName: 'think', invocationMessage: thought };
			}
			case 'report_progress': {
				const details: ParsedToolCallDetails = { toolName: 'Progress Update', invocationMessage: `${args.prDescription}` || content || 'Progress Update' };
				if (args.commitMessage) { details.originMessage = `Commit: ${args.commitMessage}`; }
				return details;
			}
			case 'bash':
				return buildBashDetails(args, content);
			case 'read_bash':
				return { toolName: 'read_bash', invocationMessage: 'Read logs from Bash session' };
			case 'stop_bash':
				return { toolName: 'stop_bash', invocationMessage: 'Stop Bash session' };
			case 'edit':
				return buildEditDetails(args.path, args.command, undefined);
			case 'run_setup':
			case 'run_custom_setup_step': {
				const stepName = (args as unknown as { name?: string; details?: { name?: string } }).name
					?? (args as unknown as { details?: { name?: string } }).details?.name;
				const label = stepName ? `Setting up environment — ${stepName}` : 'Setting up environment';
				return { toolName: 'Setting up environment', invocationMessage: label, pastTenseMessage: label };
			}
			case 'report_intent': {
				const intent = (args as unknown as { intent?: string }).intent;
				const label = intent ? intent : 'Working';
				return { toolName: 'Working', invocationMessage: label, pastTenseMessage: label };
			}
			default:
				return { toolName: name || 'unknown', invocationMessage: content || name || 'unknown' };
		}
	}
}

/**
 * Translates CMC Task API `custom_agent.*` event types into the equivalent
 * `subagent.*` names used by the CLI SDK so {@link appendResponsePartsForEvent}
 * can handle both producers. Data payloads are identical per the CMC OpenAPI
 * spec, so a name swap is sufficient.
 */
function remapCustomAgentEventType(event: AgentTaskSessionEvent): { type: string; data: unknown } {
	switch (event.type) {
		case 'custom_agent.started':
			return { ...event, type: 'subagent.started' };
		case 'custom_agent.completed':
			return { ...event, type: 'subagent.completed' };
		case 'custom_agent.failed':
			return { ...event, type: 'subagent.failed' };
		case 'custom_agent.selected':
			return { ...event, type: 'subagent.selected' };
		default:
			return event;
	}
}

/**
 * Heuristic for identifying user-authored messages in the Task API event
 * stream. Real user input is rewritten by the agent host into a longer
 * `transformedContent` prompt (problem statement + repository context +
 * steps + memories). Runtime-injected user messages (e.g. the post-turn
 * PR description prompt) are sent verbatim, so their `content` is identical
 * to `transformedContent`.
 */
export function isUserAuthoredMessage(data: { content?: string; transformedContent?: string }): boolean {
	const content = data.content ?? '';
	const transformed = data.transformedContent ?? '';
	if (!content) {
		return false;
	}
	return transformed === '' || transformed !== content;
}

/** JSON-stringify tool arguments, returning '{}' on cycles or other failures. */
function safeStringifyToolArgs(args: unknown): string {
	if (args === undefined || args === null) {
		return '{}';
	}
	try {
		return JSON.stringify(args) ?? '{}';
	} catch {
		return '{}';
	}
}
