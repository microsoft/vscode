/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TraceSpan } from '../agents/AgentManager';
import { HookExecutionResult } from '../hooks/HookEngine';

/**
 * Span names for OpenTelemetry-compatible tracing.
 */
export type SpanName =
	| 'llm.call'
	| 'mcp.tool'
	| 'file.change'
	| 'hook.execute'
	| 'sandbox.exec'
	| 'agent.start'
	| 'agent.complete'
	| 'agent.fail'
	| 'review.check';

/**
 * An OpenTelemetry-compatible trace span for local export.
 */
export interface OtelSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: SpanName | string;
	startTimeUnixNano: number;
	endTimeUnixNano: number;
	attributes: Record<string, string | number | boolean>;
	status: 'OK' | 'ERROR' | 'UNSET';
}

/**
 * A complete trace session for export.
 */
export interface TraceSession {
	sessionId: string;
	startedAt: number;
	spans: OtelSpan[];
}

/**
 * Generates trace and span IDs.
 */
function generateId(length: number): string {
	const chars = '0123456789abcdef';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}

/**
 * Exports OpenTelemetry-compatible traces to local JSON files.
 * Traces are stored in .son-of-anton/traces/{sessionId}.json.
 */
export class TraceExporter {
	private readonly sessionId: string;
	private readonly traceId: string;
	private readonly spans: OtelSpan[] = [];
	private readonly startedAt: number;

	constructor() {
		this.sessionId = generateId(16);
		this.traceId = generateId(32);
		this.startedAt = Date.now();
	}

	/**
	 * Get the current session ID.
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Record an LLM call span.
	 */
	recordLlmCall(attributes: {
		model: string;
		inputTokens: number;
		outputTokens: number;
		cachedTokens: number;
		latencyMs: number;
		parentSpanId?: string;
	}): OtelSpan {
		return this.addSpan('llm.call', attributes.latencyMs, {
			model: attributes.model,
			inputTokens: attributes.inputTokens,
			outputTokens: attributes.outputTokens,
			cachedTokens: attributes.cachedTokens,
			latency: attributes.latencyMs,
		}, attributes.parentSpanId);
	}

	/**
	 * Record an MCP tool call span.
	 */
	recordMcpToolCall(attributes: {
		server: string;
		toolName: string;
		latencyMs: number;
		parentSpanId?: string;
	}): OtelSpan {
		return this.addSpan('mcp.tool', attributes.latencyMs, {
			server: attributes.server,
			toolName: attributes.toolName,
			latency: attributes.latencyMs,
		}, attributes.parentSpanId);
	}

	/**
	 * Record a file change span.
	 */
	recordFileChange(attributes: {
		path: string;
		changeType: 'create' | 'modify' | 'delete';
		linesChanged: number;
		parentSpanId?: string;
	}): OtelSpan {
		return this.addSpan('file.change', 0, {
			path: attributes.path,
			changeType: attributes.changeType,
			linesChanged: attributes.linesChanged,
		}, attributes.parentSpanId);
	}

	/**
	 * Record a hook execution span from a HookExecutionResult.
	 */
	recordHookExecution(result: HookExecutionResult): OtelSpan {
		return this.addSpan('hook.execute', result.durationMs, {
			hookName: result.hookName,
			trigger: result.trigger,
			agent: result.agent,
			blocking: result.blocking,
			result: result.success ? 'pass' : 'fail',
		});
	}

	/**
	 * Record a sandbox command execution span.
	 */
	recordSandboxExec(attributes: {
		command: string;
		exitCode: number;
		durationMs: number;
		parentSpanId?: string;
	}): OtelSpan {
		return this.addSpan('sandbox.exec', attributes.durationMs, {
			command: attributes.command,
			exitCode: attributes.exitCode,
			duration: attributes.durationMs,
		}, attributes.parentSpanId, attributes.exitCode === 0 ? 'OK' : 'ERROR');
	}

	/**
	 * Record an agent lifecycle span (start/complete/fail).
	 */
	recordAgentLifecycle(
		phase: 'start' | 'complete' | 'fail',
		attributes: {
			agentName: string;
			taskDescription: string;
			durationMs?: number;
			error?: string;
			parentSpanId?: string;
		},
	): OtelSpan {
		const name = `agent.${phase}` as SpanName;
		const status = phase === 'fail' ? 'ERROR' : 'OK';
		const attrs: Record<string, string | number | boolean> = {
			agentName: attributes.agentName,
			taskDescription: attributes.taskDescription,
		};
		if (attributes.error) {
			attrs['error'] = attributes.error;
		}
		return this.addSpan(name, attributes.durationMs ?? 0, attrs, attributes.parentSpanId, status);
	}

	/**
	 * Record a review check span.
	 */
	recordReviewCheck(attributes: {
		checkName: string;
		passed: boolean;
		details: string;
		parentSpanId?: string;
	}): OtelSpan {
		return this.addSpan('review.check', 0, {
			checkName: attributes.checkName,
			passed: attributes.passed,
			details: attributes.details,
		}, attributes.parentSpanId, attributes.passed ? 'OK' : 'ERROR');
	}

	/**
	 * Convert AgentManager TraceSpans to OtelSpans.
	 */
	importSpans(spans: TraceSpan[]): void {
		for (const span of spans) {
			const endTime = span.endTime ?? Date.now();
			const otelSpan: OtelSpan = {
				traceId: this.traceId,
				spanId: generateId(16),
				name: this.mapSpanType(span.type),
				startTimeUnixNano: span.startTime * 1_000_000,
				endTimeUnixNano: endTime * 1_000_000,
				attributes: span.attributes as Record<string, string | number | boolean>,
				status: 'OK',
			};
			this.spans.push(otelSpan);
		}
	}

	/**
	 * Get all recorded spans.
	 */
	getSpans(): ReadonlyArray<OtelSpan> {
		return this.spans;
	}

	/**
	 * Export the current trace session to a JSON file in the workspace.
	 */
	async exportToWorkspace(): Promise<vscode.Uri | undefined> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return undefined;
		}

		const session: TraceSession = {
			sessionId: this.sessionId,
			startedAt: this.startedAt,
			spans: this.spans,
		};

		const tracesDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			'.son-of-anton',
			'traces',
		);

		// Ensure directory exists
		try {
			await vscode.workspace.fs.createDirectory(tracesDir);
		} catch {
			// Directory may already exist
		}

		const fileUri = vscode.Uri.joinPath(tracesDir, `${this.sessionId}.json`);
		const content = Buffer.from(JSON.stringify(session, null, 2), 'utf-8');
		await vscode.workspace.fs.writeFile(fileUri, content);

		return fileUri;
	}

	/**
	 * Add a span to the trace.
	 */
	private addSpan(
		name: SpanName | string,
		durationMs: number,
		attributes: Record<string, string | number | boolean>,
		parentSpanId?: string,
		status: OtelSpan['status'] = 'OK',
	): OtelSpan {
		const now = Date.now();
		const span: OtelSpan = {
			traceId: this.traceId,
			spanId: generateId(16),
			parentSpanId,
			name,
			startTimeUnixNano: (now - durationMs) * 1_000_000,
			endTimeUnixNano: now * 1_000_000,
			attributes,
			status,
		};
		this.spans.push(span);
		return span;
	}

	/**
	 * Map AgentManager span types to OTel span names.
	 */
	private mapSpanType(type: string): string {
		switch (type) {
			case 'llm_call': return 'llm.call';
			case 'mcp_tool': return 'mcp.tool';
			case 'file_change': return 'file.change';
			case 'hook': return 'hook.execute';
			case 'lifecycle': return 'agent.start';
			default: return type;
		}
	}
}
