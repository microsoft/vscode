/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IOTelDiagnosticsService } from '../../../../platform/otel/common/otelDiagnosticsService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { toToolSetVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatDebugEvent, IChatDebugService } from '../../../../workbench/contrib/chat/common/chatDebugService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';

const enum DiagnosticsToolKind {
	Session,
	Trace,
	Span,
	DebugEvents,
}

const toolDefinitions: Readonly<Record<DiagnosticsToolKind, IToolData>> = {
	[DiagnosticsToolKind.Session]: {
		id: 'workbench.agentDiagnostics.getSession',
		toolReferenceName: 'getSessionDiagnostics',
		canBeReferencedInPrompt: true,
		icon: Codicon.pulse,
		displayName: localize('agentDiagnostics.tool.session.displayName', "Get Session Diagnostics"),
		userDescription: localize('agentDiagnostics.tool.session.userDescription', "Read diagnostics for an agent session"),
		modelDescription: 'Read focused diagnostics for one Agent Host session identified by session URI. Use this to understand a session or turn through its summary, captured messages, traces, and activity. Do not use it for global telemetry or unrelated application logs. This tool is read-only.',
		source: ToolDataSource.Internal,
		when: ChatContextKeys.enabled,
		runsInWorkspace: false,
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				sessionUri: { type: 'string', description: 'Client-facing Agents session or chat URI.' },
			},
			required: ['sessionUri'],
		},
	},
	[DiagnosticsToolKind.Trace]: {
		id: 'workbench.agentDiagnostics.getTrace',
		toolReferenceName: 'getTraceDiagnostics',
		canBeReferencedInPrompt: true,
		icon: Codicon.pulse,
		displayName: localize('agentDiagnostics.tool.trace.displayName', "Get Trace Diagnostics"),
		userDescription: localize('agentDiagnostics.tool.trace.userDescription', "Read a diagnostic trace and its spans"),
		modelDescription: 'Read one OpenTelemetry trace and all of its spans by trace ID. Use this to investigate timing, errors, model calls, or tool calls inside a known trace. Do not use it to search for an unknown trace; call Get Session Diagnostics first. This tool is read-only.',
		source: ToolDataSource.Internal,
		when: ChatContextKeys.enabled,
		runsInWorkspace: false,
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				traceId: { type: 'string', description: 'OpenTelemetry trace ID.' },
			},
			required: ['traceId'],
		},
	},
	[DiagnosticsToolKind.Span]: {
		id: 'workbench.agentDiagnostics.getSpan',
		toolReferenceName: 'getSpanDiagnostics',
		canBeReferencedInPrompt: true,
		icon: Codicon.pulse,
		displayName: localize('agentDiagnostics.tool.span.displayName', "Get Span Diagnostics"),
		userDescription: localize('agentDiagnostics.tool.span.userDescription', "Read one diagnostic span"),
		modelDescription: 'Read one OpenTelemetry span by trace ID and span ID, including attributes and events. Use this for a known suspicious model, tool, or host operation. Do not use it without both IDs; call Get Trace Diagnostics first when only the trace is known. This tool is read-only.',
		source: ToolDataSource.Internal,
		when: ChatContextKeys.enabled,
		runsInWorkspace: false,
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				traceId: { type: 'string', description: 'OpenTelemetry trace ID containing the span.' },
				spanId: { type: 'string', description: 'OpenTelemetry span ID.' },
			},
			required: ['traceId', 'spanId'],
		},
	},
	[DiagnosticsToolKind.DebugEvents]: {
		id: 'workbench.agentDiagnostics.getDebugEvents',
		toolReferenceName: 'getAgentDebugEvents',
		canBeReferencedInPrompt: true,
		icon: Codicon.debug,
		displayName: localize('agentDiagnostics.tool.debugEvents.displayName', "Get Agent Debug Events"),
		userDescription: localize('agentDiagnostics.tool.debugEvents.userDescription', "Read Agent Debug events for a chat"),
		modelDescription: 'Read Agent Debug events for one Agents chat URI, optionally narrowed to event IDs. Use this to inspect captured prompts, model turns, tool calls, responses, and customization activity. Do not use it for OpenTelemetry span attributes; use the trace or span diagnostics tools instead. This tool is read-only.',
		source: ToolDataSource.Internal,
		when: ChatContextKeys.enabled,
		runsInWorkspace: false,
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				chatUri: { type: 'string', description: 'Client-facing Agents chat URI.' },
				eventIds: { type: 'array', items: { type: 'string' }, description: 'Optional Agent Debug event IDs to return.' },
			},
			required: ['chatUri'],
		},
	},
};

class AgentDiagnosticsTool implements IToolImpl {

	constructor(
		private readonly kind: DiagnosticsToolKind,
		private readonly otelDiagnosticsService: IOTelDiagnosticsService,
		private readonly chatDebugService: IChatDebugService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		switch (this.kind) {
			case DiagnosticsToolKind.Session:
				return { invocationMessage: localize('agentDiagnostics.tool.session.invocation', "Reading session diagnostics"), pastTenseMessage: localize('agentDiagnostics.tool.session.complete', "Read session diagnostics") };
			case DiagnosticsToolKind.Trace:
				return { invocationMessage: localize('agentDiagnostics.tool.trace.invocation', "Reading trace diagnostics"), pastTenseMessage: localize('agentDiagnostics.tool.trace.complete', "Read trace diagnostics") };
			case DiagnosticsToolKind.Span:
				return { invocationMessage: localize('agentDiagnostics.tool.span.invocation', "Reading span diagnostics"), pastTenseMessage: localize('agentDiagnostics.tool.span.complete', "Read span diagnostics") };
			case DiagnosticsToolKind.DebugEvents:
				return { invocationMessage: localize('agentDiagnostics.tool.debugEvents.invocation', "Reading Agent Debug events"), pastTenseMessage: localize('agentDiagnostics.tool.debugEvents.complete', "Read Agent Debug events") };
		}
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		switch (this.kind) {
			case DiagnosticsToolKind.Session:
				return this.getSession(invocation);
			case DiagnosticsToolKind.Trace:
				return this.getTrace(invocation);
			case DiagnosticsToolKind.Span:
				return this.getSpan(invocation);
			case DiagnosticsToolKind.DebugEvents:
				return this.getDebugEvents(invocation);
		}
	}

	private async getSession(invocation: IToolInvocation): Promise<IToolResult> {
		const sessionUri = requiredString(invocation, 'sessionUri');
		const [summary, messages, traces, activity] = await Promise.all([
			this.otelDiagnosticsService.getSessionSummary(sessionUri),
			this.otelDiagnosticsService.getSessionMessages(sessionUri),
			this.otelDiagnosticsService.getSessionTraces(sessionUri),
			this.otelDiagnosticsService.getSessionLogs(sessionUri),
		]);
		return toolResult({ summary, messages, traces, activity });
	}

	private async getTrace(invocation: IToolInvocation): Promise<IToolResult> {
		return toolResult(await this.otelDiagnosticsService.getTraceDetails(requiredString(invocation, 'traceId')));
	}

	private async getSpan(invocation: IToolInvocation): Promise<IToolResult> {
		const traceId = requiredString(invocation, 'traceId');
		const spanId = requiredString(invocation, 'spanId');
		const trace = await this.otelDiagnosticsService.getTraceDetails(traceId);
		return toolResult(trace?.spans.find(span => span.spanId === spanId));
	}

	private async getDebugEvents(invocation: IToolInvocation): Promise<IToolResult> {
		const chatResource = URI.parse(requiredString(invocation, 'chatUri'));
		await this.chatDebugService.invokeProviders(chatResource);
		const eventIds = optionalStringArray(invocation, 'eventIds');
		const events = this.chatDebugService.getEvents(chatResource).filter(event => !eventIds || eventIds.includes(event.id ?? ''));
		const details = await Promise.all(events.map(async event => event.id ? this.chatDebugService.resolveEvent(event.id) : undefined));
		return toolResult(events.map((event, index) => ({
			...serializeDebugEvent(event),
			details: details[index],
		})));
	}
}

export class AgentDiagnosticsToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.agentDiagnosticsTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IOTelDiagnosticsService otelDiagnosticsService: IOTelDiagnosticsService,
		@IChatDebugService chatDebugService: IChatDebugService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();
		const toolSet = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'agentDiagnostics', 'agentDiagnostics', {
			icon: Codicon.pulse,
			description: localize('agentDiagnostics.toolSet.description', "Agent Diagnostics"),
			detail: localize('agentDiagnostics.toolSet.detail', "Read focused agent sessions, traces, spans, and Agent Debug events"),
		}));
		for (const kind of [DiagnosticsToolKind.Session, DiagnosticsToolKind.Trace, DiagnosticsToolKind.Span, DiagnosticsToolKind.DebugEvents]) {
			const data = toolDefinitions[kind];
			const tool = new AgentDiagnosticsTool(kind, otelDiagnosticsService, chatDebugService);
			this._register(toolsService.registerTool(data, tool));
			this._register(toolSet.addTool(data));
		}
		this._register(contextPickService.registerChatContextItem({
			type: 'valuePick',
			label: localize('agentDiagnostics.contextPicker.label', "Agent Diagnostics Tools"),
			icon: Codicon.pulse,
			ordinal: -450,
			asAttachment: async () => toToolSetVariableEntry(toolSet),
		}));
	}
}

function requiredString(invocation: IToolInvocation, key: string): string {
	const value = invocation.parameters[key];
	if (typeof value !== 'string' || !value) {
		throw new Error(`Missing required parameter '${key}'.`);
	}
	return value;
}

function optionalStringArray(invocation: IToolInvocation, key: string): readonly string[] | undefined {
	const value = invocation.parameters[key];
	return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined;
}

function toolResult(value: object | readonly object[] | undefined): IToolResult {
	return { content: [{ kind: 'text', value: JSON.stringify(value ?? null, undefined, 2) }] };
}

function serializeDebugEvent(event: IChatDebugEvent): object {
	return {
		...event,
		sessionResource: event.sessionResource.toString(),
		created: event.created.toISOString(),
	};
}
