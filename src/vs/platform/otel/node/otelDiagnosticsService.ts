/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { dirname } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { AgentHostOTelSpansDbSubPath } from '../../agentHost/common/agentService.js';
import { AgentHostSessionUriAttribute } from '../../agentHost/common/otel/agentHostOTelService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { join } from '../../../base/common/path.js';
import { IOTelDiagnosticsLog, IOTelDiagnosticsMessage, IOTelDiagnosticsService, IOTelDiagnosticsSessionIdentity, IOTelDiagnosticsSessionSummary, IOTelDiagnosticsSpan, IOTelDiagnosticsTrace, IOTelDiagnosticsTraceDetails } from '../common/otelDiagnosticsService.js';
import { OTelSqliteStore, SpanRow } from './sqlite/otelSqliteStore.js';

interface IRawMessagePart {
	readonly id?: string;
	readonly content?: unknown;
	readonly name?: string;
	readonly arguments?: unknown;
	readonly response?: unknown;
}

interface IRawMessage {
	readonly role?: string;
	readonly parts?: readonly IRawMessagePart[];
}

interface IMessageBatch {
	readonly span: SpanRow;
	readonly messages: readonly IRawMessage[];
	readonly timestamp: number;
}

interface IToolDetails {
	readonly callId: string;
	name?: string;
	description?: string;
	input?: string;
	output?: string;
	status?: 'success' | 'error';
	duration?: number;
}

export class OTelDiagnosticsService extends Disposable implements IOTelDiagnosticsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly store: OTelSqliteStore;

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
	) {
		super();
		const dbPath = join(environmentService.userDataPath, AgentHostOTelSpansDbSubPath);
		this.store = new OTelSqliteStore(dbPath);
		this._register(toDisposable(() => this.store.close()));

		const dbResource = URI.file(dbPath);
		const walResource = URI.file(`${dbPath}-wal`);
		const scheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 250));
		const watcher = this._register(fileService.createWatcher(dirname(dbResource), { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(event => {
			if (event.affects(dbResource) || event.affects(walResource)) {
				scheduler.schedule();
			}
		}));
	}

	async resolveSessionUri(sessionUri: string): Promise<IOTelDiagnosticsSessionIdentity | undefined> {
		const normalizedSessionUri = URI.parse(sessionUri).with({ fragment: '' }).toString();
		const exact = this.store.getSpansByAttribute(AgentHostSessionUriAttribute, normalizedSessionUri);
		const anchorSpans = exact.length > 0
			? exact
			: this.store.getSpansByAttributeSuffix(AgentHostSessionUriAttribute, normalizedSessionUri.slice(normalizedSessionUri.indexOf(':') + 1));
		const anchor = anchorSpans.findLast(span => !!span.conversation_id);
		return anchor?.conversation_id
			? { sessionUri: normalizedSessionUri, conversationId: anchor.conversation_id }
			: undefined;
	}

	async getSessionSummary(sessionUri: string): Promise<IOTelDiagnosticsSessionSummary | undefined> {
		const identity = await this.resolveSessionUri(sessionUri);
		if (!identity) {
			return undefined;
		}
		const spans = this.getSessionSpans(identity);
		if (spans.length === 0) {
			return undefined;
		}
		const tokenSpans = spans.filter(span => span.operation_name === 'chat');
		const traces = new Set(spans.map(span => span.trace_id));
		const startTime = Math.min(...spans.map(span => span.start_time_ms));
		const endTime = Math.max(...spans.map(span => span.end_time_ms));
		return {
			...identity,
			turns: spans.filter(span => span.operation_name === 'invoke_agent').length,
			traceCount: traces.size,
			spanCount: spans.length,
			startTime,
			endTime,
			duration: endTime - startTime,
			inputTokens: sum(tokenSpans, span => span.input_tokens),
			outputTokens: sum(tokenSpans, span => span.output_tokens),
			cachedTokens: sum(tokenSpans, span => span.cached_tokens),
		};
	}

	async getSessionMessages(sessionUri: string): Promise<readonly IOTelDiagnosticsMessage[]> {
		const identity = await this.resolveSessionUri(sessionUri);
		if (!identity) {
			return [];
		}
		const messages: IOTelDiagnosticsMessage[] = [];
		const seen = new Set<string>();
		const batches: IMessageBatch[] = [];
		const toolDetailsByCallId = new Map<string, IToolDetails>();
		for (const span of this.getSessionSpans(identity)) {
			const attributes = this.getAttributes(span.span_id);
			if (attributes['gen_ai.input.messages']) {
				batches.push({ span, messages: JSON.parse(attributes['gen_ai.input.messages']) as IRawMessage[], timestamp: span.start_time_ms });
			}
			if (attributes['gen_ai.output.messages']) {
				batches.push({ span, messages: JSON.parse(attributes['gen_ai.output.messages']) as IRawMessage[], timestamp: span.end_time_ms });
			}
			if (span.operation_name === 'execute_tool' && span.tool_call_id) {
				toolDetailsByCallId.set(span.tool_call_id, {
					callId: span.tool_call_id,
					name: span.tool_name ?? undefined,
					description: attributes['gen_ai.tool.description'],
					input: attributes['gen_ai.tool.call.arguments'],
					output: attributes['gen_ai.tool.call.result'],
					status: span.status_code === 2 ? 'error' : 'success',
					duration: span.end_time_ms - span.start_time_ms,
				});
			}
		}
		for (const batch of batches) {
			for (const message of batch.messages) {
				for (const part of message.parts ?? []) {
					if (part.id) {
						let details = toolDetailsByCallId.get(part.id);
						if (!details) {
							details = { callId: part.id };
							toolDetailsByCallId.set(part.id, details);
						}
						details.name ??= part.name;
						if (part.arguments !== undefined) {
							details.input ??= formatMessageValue(part.arguments);
						}
						if (part.response !== undefined) {
							details.output ??= formatMessageValue(part.response);
						}
					}
				}
			}
		}
		for (const batch of batches) {
			this.appendMessages(messages, seen, batch, toolDetailsByCallId);
		}
		return messages.sort((a, b) => a.timestamp - b.timestamp);
	}

	async getSessionTraces(sessionUri: string): Promise<readonly IOTelDiagnosticsTrace[]> {
		const identity = await this.resolveSessionUri(sessionUri);
		if (!identity) {
			return [];
		}
		return this.createTraceSummaries(this.getSessionSpans(identity));
	}

	async getSessionLogs(sessionUri: string): Promise<readonly IOTelDiagnosticsLog[]> {
		const identity = await this.resolveSessionUri(sessionUri);
		if (!identity) {
			return [];
		}
		const logs: IOTelDiagnosticsLog[] = [];
		for (const span of this.getSessionSpans(identity)) {
			for (const event of this.store.getSpanEvents(span.span_id)) {
				logs.push({
					id: `${span.span_id}:${event.id}`,
					traceId: span.trace_id,
					spanId: span.span_id,
					timestamp: event.timestamp_ms,
					name: event.name,
					body: event.attributes ?? undefined,
					severity: 'info',
				});
			}
			if (span.status_code === 2) {
				logs.push({
					id: `${span.span_id}:error`,
					traceId: span.trace_id,
					spanId: span.span_id,
					timestamp: span.end_time_ms,
					name: span.name,
					body: span.status_message ?? undefined,
					severity: 'error',
				});
			}
		}
		return logs.sort((a, b) => a.timestamp - b.timestamp);
	}

	async getSessionHookSpans(sessionUri: string): Promise<readonly IOTelDiagnosticsSpan[]> {
		const identity = await this.resolveSessionUri(sessionUri);
		if (!identity) {
			return [];
		}
		return this.getSessionSpans(identity)
			.filter(span => span.operation_name === 'execute_hook')
			.map(span => this.createSpan(span));
	}

	async getTraceDetails(traceId: string): Promise<IOTelDiagnosticsTraceDetails | undefined> {
		const rows = this.store.getSpansByTraceId(traceId);
		const trace = this.createTraceSummaries(rows)[0];
		return trace ? {
			trace,
			spans: rows.map(row => this.createSpan(row)),
		} : undefined;
	}

	private getSessionSpans(identity: IOTelDiagnosticsSessionIdentity): SpanRow[] {
		const rows = this.store.getSpansByConversationId(identity.conversationId);
		const anchors = this.store.getSpansByAttribute(AgentHostSessionUriAttribute, identity.sessionUri);
		const byId = new Map<string, SpanRow>();
		for (const span of [...anchors, ...rows]) {
			byId.set(span.span_id, span);
		}
		return [...byId.values()].sort((a, b) => a.start_time_ms - b.start_time_ms);
	}

	private createTraceSummaries(spans: readonly SpanRow[]): IOTelDiagnosticsTrace[] {
		const spansByTrace = new Map<string, SpanRow[]>();
		for (const span of spans) {
			let traceSpans = spansByTrace.get(span.trace_id);
			if (!traceSpans) {
				traceSpans = [];
				spansByTrace.set(span.trace_id, traceSpans);
			}
			traceSpans.push(span);
		}
		return [...spansByTrace].map(([traceId, traceSpans]) => {
			const spanIds = new Set(traceSpans.map(span => span.span_id));
			const root = traceSpans.find(span => !span.parent_span_id || !spanIds.has(span.parent_span_id)) ?? traceSpans[0];
			const startTime = Math.min(...traceSpans.map(span => span.start_time_ms));
			const endTime = Math.max(...traceSpans.map(span => span.end_time_ms));
			const tokenSpans = traceSpans.filter(span => span.operation_name === 'chat');
			return {
				traceId,
				name: root.name,
				serviceName: this.store.getSpanAttribute(root.span_id, 'service.name') ?? undefined,
				startTime,
				endTime,
				duration: endTime - startTime,
				spanCount: traceSpans.length,
				hasError: traceSpans.some(span => span.status_code === 2),
				inputTokens: sum(tokenSpans, span => span.input_tokens),
				outputTokens: sum(tokenSpans, span => span.output_tokens),
				cachedTokens: sum(tokenSpans, span => span.cached_tokens),
			};
		}).sort((a, b) => a.startTime - b.startTime);
	}

	private createSpan(row: SpanRow): IOTelDiagnosticsSpan {
		return {
			spanId: row.span_id,
			traceId: row.trace_id,
			parentSpanId: row.parent_span_id ?? undefined,
			name: row.name,
			startTime: row.start_time_ms,
			endTime: row.end_time_ms,
			duration: row.end_time_ms - row.start_time_ms,
			statusCode: row.status_code,
			statusMessage: row.status_message ?? undefined,
			operationName: row.operation_name ?? undefined,
			providerName: row.provider_name ?? undefined,
			agentName: row.agent_name ?? undefined,
			requestModel: row.request_model ?? undefined,
			responseModel: row.response_model ?? undefined,
			inputTokens: row.input_tokens ?? 0,
			outputTokens: row.output_tokens ?? 0,
			cachedTokens: row.cached_tokens ?? 0,
			toolName: row.tool_name ?? undefined,
			attributes: this.getAttributes(row.span_id),
			events: this.store.getSpanEvents(row.span_id).map(event => ({
				name: event.name,
				timestamp: event.timestamp_ms,
				attributes: event.attributes ?? undefined,
			})),
		};
	}

	private getAttributes(spanId: string): Record<string, string> {
		const attributes: Record<string, string> = {};
		for (const attribute of this.store.getSpanAttributes(spanId)) {
			if (attribute.value !== null) {
				attributes[attribute.key] = attribute.value;
			}
		}
		return attributes;
	}

	private appendMessages(target: IOTelDiagnosticsMessage[], seen: Set<string>, batch: IMessageBatch, toolDetailsByCallId: ReadonlyMap<string, IToolDetails>): void {
		for (const [index, message] of batch.messages.entries()) {
			const content = message.parts?.map(formatMessagePart).filter(value => !!value).join('\n') ?? '';
			if (!content) {
				continue;
			}
			const toolDetails = message.role === 'tool'
				? message.parts?.map(part => part.id ? toolDetailsByCallId.get(part.id) : undefined).find(details => !!details)
				: undefined;
			const key = `${message.role}:${content}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			target.push({
				id: `${batch.span.span_id}:${index}:${message.role ?? 'message'}`,
				traceId: batch.span.trace_id,
				spanId: batch.span.span_id,
				role: message.role ?? 'message',
				toolName: toolDetails?.name,
				toolCallId: toolDetails?.callId,
				toolDescription: toolDetails?.description,
				toolInput: toolDetails?.input,
				toolOutput: toolDetails?.output ?? content,
				toolStatus: toolDetails?.status,
				toolDuration: toolDetails?.duration,
				content,
				timestamp: batch.timestamp,
			});
		}
	}
}

function formatMessagePart(part: IRawMessagePart): string {
	if (part.content !== undefined) {
		return formatMessageValue(part.content);
	}
	if (part.name) {
		return `${part.name}(${formatMessageValue(part.arguments)})`;
	}
	return formatMessageValue(part.response);
}

function formatMessageValue(value: unknown): string {
	if (value === undefined || value === null) {
		return '';
	}
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function sum(rows: readonly SpanRow[], value: (row: SpanRow) => number | null): number {
	return rows.reduce((total, row) => total + (value(row) ?? 0), 0);
}
