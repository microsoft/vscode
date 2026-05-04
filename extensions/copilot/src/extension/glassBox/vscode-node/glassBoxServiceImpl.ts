/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { Event } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IRequestLogger, LoggedInfo, LoggedInfoKind, LoggedRequestKind, type ILoggedChatMLCancelationRequest, type ILoggedChatMLFailureRequest, type ILoggedChatMLSuccessRequest, type ILoggedElementInfo, type ILoggedToolCall } from '../../../platform/requestLogger/common/requestLogger';
import { ThinkingData } from '../../../platform/thinking/common/thinking';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { redactSensitiveData, sanitizeLabel, sanitizePreview } from '../common/sensitiveDataFilter';
import type { IGlassBoxService } from '../common/glassBoxService';
import {
	ContextItemKind,
	GlassBoxContextItem,
	GlassBoxRequestAggregate,
	PerformanceMetrics,
	ReasoningTrace,
	TokenBudgetSnapshot,
	TokenElementBreakdown,
	ToolCallMetric,
} from '../common/types';

const MAX_STORED_REQUESTS = 50;

export class GlassBoxServiceImpl extends Disposable implements IGlassBoxService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeRequests = this._register(new Emitter<void>());
	readonly onDidChangeRequests: Event<void> = this._onDidChangeRequests.event;

	private readonly _requests: GlassBoxRequestAggregate[] = [];
	private _isEnabled = false;

	constructor(
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Glass Box is opt-in; starts disabled until the panel is opened
		this._isEnabled = false;

		// Subscribe to request logger changes
		this._register(this._requestLogger.onDidChangeRequests(() => {
			if (this._isEnabled) {
				this._syncFromRequestLogger();
			}
		}));
	}

	get isEnabled(): boolean {
		return this._isEnabled;
	}

	setEnabled(enabled: boolean): void {
		this._isEnabled = enabled;
		if (enabled) {
			this._syncFromRequestLogger();
		}
	}

	getRequests(): readonly GlassBoxRequestAggregate[] {
		return this._requests;
	}

	getRequestById(id: string): GlassBoxRequestAggregate | undefined {
		return this._requests.find(r => r.id === id);
	}

	/**
	 * Sync data from the request logger into sanitized Glass Box aggregates.
	 */
	private _syncFromRequestLogger(): void {
		try {
			const loggerEntries = this._requestLogger.getRequests();
			const newAggregates = this._buildAggregates(loggerEntries);

			// Add only new aggregates that we haven't seen yet
			const existingIds = new Set(this._requests.map(r => r.id));
			for (const aggregate of newAggregates) {
				if (!existingIds.has(aggregate.id)) {
					this._requests.push(aggregate);
				}
			}

			// Enforce max capacity
			while (this._requests.length > MAX_STORED_REQUESTS) {
				this._requests.shift();
			}

			this._onDidChangeRequests.fire();
		} catch (e) {
			this._logService.error('GlassBox: Error syncing from request logger', e);
		}
	}

	/**
	 * Build sanitized aggregates from logger entries.
	 * Also correlates tool calls with their parent requests.
	 */
	private _buildAggregates(entries: LoggedInfo[]): GlassBoxRequestAggregate[] {
		const aggregates: GlassBoxRequestAggregate[] = [];

		// Collect tool calls to correlate with requests
		const toolCalls: ILoggedToolCall[] = [];
		for (const entry of entries) {
			if (entry.kind === LoggedInfoKind.ToolCall) {
				toolCalls.push(entry);
			}
		}

		for (const entry of entries) {
			if (entry.kind === LoggedInfoKind.Request) {
				const request = entry.entry;
				if (request.type === LoggedRequestKind.MarkdownContentRequest) {
					continue; // Skip markdown-only entries
				}

				// Only include tool calls that belong to the same capture context as this request.
				// Matching on CapturingToken ensures tool calls from other turns aren't mixed in.
				const matchedToolCalls = entry.token
					? toolCalls.filter(tc => tc.token === entry.token)
					: [];

				const aggregate = this._buildRequestAggregate(entry.id, request, matchedToolCalls);
				if (aggregate) {
					aggregates.push(aggregate);
				}
			} else if (entry.kind === LoggedInfoKind.Element) {
				// Prompt trace entries get their own aggregate
				const aggregate = this._buildElementAggregate(entry);
				if (aggregate) {
					aggregates.push(aggregate);
				}
			}
		}

		return aggregates;
	}

	/**
	 * Build a sanitized aggregate from a logged ChatML request.
	 */
	private _buildRequestAggregate(
		id: string,
		request: ILoggedChatMLSuccessRequest | ILoggedChatMLFailureRequest | ILoggedChatMLCancelationRequest,
		toolCalls: ILoggedToolCall[],
	): GlassBoxRequestAggregate | undefined {
		const startTime = request.startTime.getTime();
		const endTime = request.endTime.getTime();
		const durationMs = endTime - startTime;
		const model = sanitizeLabel(request.chatEndpoint.model ?? 'unknown');

		// Build token budget
		const tokenBudget = this._buildTokenBudget(request);

		// Build tool call metrics. Tool calls are sorted by completion time so we
		// can estimate each call's duration as the gap between consecutive completion
		// timestamps. The first tool call's duration cannot be determined (no prior
		// reference), so it is left undefined.
		const reasoningTraces: ReasoningTrace[] = [];
		const toolCallMetrics: ToolCallMetric[] = [];
		const sortedToolCalls = [...toolCalls].sort((a, b) => a.time - b.time);
		for (let i = 0; i < sortedToolCalls.length; i++) {
			const tc = sortedToolCalls[i];
			if (tc.thinking) {
				reasoningTraces.push(...GlassBoxServiceImpl.buildReasoningTraces([tc.thinking]));
			}
			const tcDurationMs = i > 0
				? Math.max(0, tc.time - sortedToolCalls[i - 1].time)
				: undefined; // first call: no prior timestamp to diff against
			toolCallMetrics.push({
				name: redactSensitiveData(tc.name),
				durationMs: tcDurationMs,
			});
		}

		// Build performance metrics
		const performance = this._buildPerformanceMetrics(request, durationMs, toolCallMetrics);

		// Build context items from the request messages
		const contextItems = this._buildContextItems(request);

		const success = request.type === LoggedRequestKind.ChatMLSuccess;
		const errorMessage = request.type === LoggedRequestKind.ChatMLFailure
			? sanitizePreview(request.result?.reason ?? 'Unknown error')
			: undefined;

		// Capture the model response text for display in the Replay panel.
		// Primary source: result.value (accumulated completion text).
		// Fallback: reconstruct from streaming deltas if value is empty.
		let responseText: string | undefined;
		if (success) {
			const valueText = request.result.value.join('\n');
			if (valueText) {
				responseText = sanitizePreview(valueText, 4000);
			} else if (request.deltas && request.deltas.length > 0) {
				const deltaText = request.deltas.map((d: { text: string }) => d.text).join('');
				responseText = sanitizePreview(deltaText, 4000);
			}
		}

		return {
			id: `req-${id}`,
			label: sanitizeLabel(request.debugName ?? 'Chat Request'),
			timestamp: startTime,
			model,
			contextItems,
			tokenBudget,
			reasoningTraces,
			performance,
			success,
			errorMessage,
			responseText,
		};
	}

	/**
	 * Build a sanitized aggregate from a logged prompt element (trace).
	 */
	private _buildElementAggregate(
		entry: ILoggedElementInfo,
	): GlassBoxRequestAggregate {
		const contextItems: GlassBoxContextItem[] = [{
			label: sanitizeLabel(entry.name),
			kind: ContextItemKind.Custom,
			tokens: entry.tokens,
			maxTokens: entry.maxTokens,
			relevance: entry.maxTokens > 0 ? entry.tokens / entry.maxTokens : 0,
		}];

		return {
			id: `elem-${entry.id}`,
			label: sanitizeLabel(entry.name),
			timestamp: Date.now(),
			model: 'prompt-element',
			contextItems,
			tokenBudget: {
				modelMaxTokens: entry.maxTokens,
				promptTokens: entry.tokens,
				completionTokens: 0,
				totalTokens: entry.tokens,
				remainingTokens: entry.maxTokens - entry.tokens,
				elementBreakdown: [{
					name: sanitizeLabel(entry.name),
					tokens: entry.tokens,
					maxTokens: entry.maxTokens,
				}],
			},
			reasoningTraces: [],
			performance: {
				totalDurationMs: 0,
				toolCallCount: 0,
				toolCalls: [],
				cacheHit: false,
				cachedTokens: 0,
			},
			success: true,
		};
	}

	/**
	 * Build token budget snapshot from a logged request.
	 */
	private _buildTokenBudget(
		request: ILoggedChatMLSuccessRequest | ILoggedChatMLFailureRequest | ILoggedChatMLCancelationRequest,
	): TokenBudgetSnapshot {
		const modelMax = request.chatEndpoint.modelMaxPromptTokens ?? 0;

		if (request.type === LoggedRequestKind.ChatMLSuccess && request.usage) {
			const usage = request.usage;
			return {
				modelMaxTokens: modelMax,
				promptTokens: usage.prompt_tokens,
				completionTokens: usage.completion_tokens,
				totalTokens: usage.total_tokens,
				cachedTokens: usage.prompt_tokens_details?.cached_tokens,
				reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
				remainingTokens: Math.max(0, modelMax - usage.prompt_tokens),
				elementBreakdown: this._buildElementBreakdown(request),
			};
		}

		return {
			modelMaxTokens: modelMax,
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
			remainingTokens: modelMax,
			elementBreakdown: [],
		};
	}

	/**
	 * Build element breakdown from request messages.
	 * Uses role display names for labels.
	 */
	private _buildElementBreakdown(
		request: ILoggedChatMLSuccessRequest,
	): readonly TokenElementBreakdown[] {
		const breakdown: TokenElementBreakdown[] = [];
		const messages = request.chatParams.messages;

		for (const msg of messages) {
			const roleName = Raw.ChatRole.display(msg.role);
			const contentText = extractMessageText(msg);
			// Approximate token count from content length (rough heuristic: ~4 chars per token)
			const approxTokens = Math.ceil(contentText.length / 4);
			breakdown.push({
				name: sanitizeLabel(`${roleName} message`),
				tokens: approxTokens,
				maxTokens: request.chatEndpoint.modelMaxPromptTokens ?? 0,
			});
		}

		return breakdown;
	}

	/**
	 * Build performance metrics from a logged request.
	 */
	private _buildPerformanceMetrics(
		request: ILoggedChatMLSuccessRequest | ILoggedChatMLFailureRequest | ILoggedChatMLCancelationRequest,
		durationMs: number,
		toolCallMetrics: readonly ToolCallMetric[] = [],
	): PerformanceMetrics {
		const timeToFirstTokenMs = (request.type === LoggedRequestKind.ChatMLSuccess || request.type === LoggedRequestKind.ChatMLFailure)
			? request.timeToFirstToken
			: undefined;

		const cachedTokens = (request.type === LoggedRequestKind.ChatMLSuccess && request.usage?.prompt_tokens_details?.cached_tokens)
			? request.usage.prompt_tokens_details.cached_tokens
			: 0;

		return {
			timeToFirstTokenMs,
			totalDurationMs: durationMs,
			toolCallCount: toolCallMetrics.length,
			toolCalls: toolCallMetrics,
			cacheHit: cachedTokens > 0,
			cachedTokens,
		};
	}

	/**
	 * Build sanitized context items from request messages.
	 */
	private _buildContextItems(
		request: ILoggedChatMLSuccessRequest | ILoggedChatMLFailureRequest | ILoggedChatMLCancelationRequest,
	): readonly GlassBoxContextItem[] {
		const items: GlassBoxContextItem[] = [];
		const messages = request.chatParams.messages;
		const modelMax = request.chatEndpoint.modelMaxPromptTokens ?? 0;

		for (const msg of messages) {
			const roleName = Raw.ChatRole.display(msg.role);
			const content = extractMessageText(msg);
			const approxTokens = Math.ceil(content.length / 4);

			let kind: ContextItemKind;
			switch (msg.role) {
				case Raw.ChatRole.System:
					kind = ContextItemKind.SystemMessage;
					break;
				case Raw.ChatRole.User:
					kind = ContextItemKind.UserMessage;
					break;
				case Raw.ChatRole.Assistant:
					kind = ContextItemKind.History;
					break;
				default:
					kind = ContextItemKind.Custom;
			}

			items.push({
				label: sanitizeLabel(`${roleName} message`),
				kind,
				tokens: approxTokens,
				maxTokens: modelMax,
				relevance: modelMax > 0 ? Math.min(1, approxTokens / modelMax) : 0,
				// User messages represent the actual user query — store the full text so it can
				// be inspected in the panel. System messages are also shown in full so they can
				// be read and used for replay. History/assistant messages can be very large
				// (injected file contents, tool results, etc.), so cap those.
				preview: sanitizePreview(content, (kind === ContextItemKind.UserMessage || kind === ContextItemKind.SystemMessage) ? 50_000 : 2000),
			});
		}

		return items;
	}

	/**
	 * Build sanitized reasoning traces from thinking data.
	 */
	public static buildReasoningTraces(thinkingData: ThinkingData[]): readonly ReasoningTrace[] {
		return thinkingData.map(t => ({
			id: t.id,
			text: sanitizePreview(
				Array.isArray(t.text) ? t.text.join('\n') : t.text,
				2000,
			) ?? '',
			tokens: t.tokens,
			isEncrypted: !!t.encrypted,
		}));
	}

	/**
	 * Build sanitized tool call metrics.
	 */
	public static buildToolCallMetrics(
		toolCalls: Array<{ name: string; durationMs: number | undefined }>,
	): readonly ToolCallMetric[] {
		return toolCalls.map(tc => ({
			name: redactSensitiveData(tc.name),
			durationMs: tc.durationMs,
		}));
	}
}

/**
 * Extract text content from a Raw.ChatMessage, handling both string and content-part arrays.
 */
function extractMessageText(msg: Raw.ChatMessage): string {
	if (!msg.content || !Array.isArray(msg.content)) {
		return '';
	}
	return msg.content
		.map(part => {
			if (part.type === Raw.ChatCompletionContentPartKind.Text) {
				return part.text;
			}
			if (part.type === Raw.ChatCompletionContentPartKind.Image) {
				return '[image]';
			}
			if (part.type === Raw.ChatCompletionContentPartKind.Document) {
				return '[document]';
			}
			return '';
		})
		.filter(Boolean)
		.join('\n');
}
