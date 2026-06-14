/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotChatAttr, CopilotCliSdkAttr, GenAiAttr, GenAiOperationName } from '../../../../platform/otel/common/genAiAttributes';
import { type ICompletedSpanData, type IOTelService, type ISpanEventRecord, SpanStatusCode } from '../../../../platform/otel/common/otelService';

/**
 * Hook event data stashed by copilotcliSession for bridge enrichment.
 */
export interface HookEventData {
	readonly hookType: string;
	readonly input?: string;
	readonly output?: string;
	readonly resultKind?: 'success' | 'error';
	readonly errorMessage?: string;
}

/**
 * Minimal type for the OTel SDK's ReadableSpan — avoids importing the full
 * @opentelemetry/sdk-trace-base package into the extension bundle.
 */
interface ReadableSpan {
	readonly name: string;
	readonly startTime: readonly [number, number]; // [seconds, nanoseconds]
	readonly endTime: readonly [number, number];
	readonly attributes: Readonly<Record<string, unknown>>;
	readonly events: readonly { readonly name: string; readonly time: readonly [number, number]; readonly attributes?: Readonly<Record<string, unknown>> }[];
	readonly status: { readonly code: number; readonly message?: string };
	/** OTel SDK v2: parent span context object (replaces v1's parentSpanId string) */
	readonly parentSpanContext?: { readonly traceId: string; readonly spanId: string };
	spanContext(): { readonly traceId: string; readonly spanId: string };
}

/**
 * Minimal SpanProcessor interface — matches the OTel SDK's SpanProcessor
 * without requiring the package as a dependency.
 */
export interface SpanProcessor {
	onStart(span: unknown, parentContext: unknown): void;
	onEnd(span: ReadableSpan): void;
	shutdown(): Promise<void>;
	forceFlush(): Promise<void>;
}

/** Convert OTel [seconds, nanoseconds] HrTime to epoch milliseconds. */
function hrTimeToMs(hrTime: readonly [number, number]): number {
	return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}

/** Flatten OTel attribute values to the types ICompletedSpanData accepts. */
function flattenAttributes(attrs: Readonly<Record<string, unknown>>): Record<string, string | number | boolean | string[]> {
	const result: Record<string, string | number | boolean | string[]> = {};
	for (const [key, value] of Object.entries(attrs)) {
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			result[key] = value;
		} else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
			result[key] = value as string[];
		} else if (value !== null && value !== undefined) {
			result[key] = String(value);
		}
	}
	return result;
}

/**
 * Bridge SpanProcessor that forwards completed spans from the Copilot CLI SDK's
 * OTel TracerProvider into the extension's IOTelService event stream.
 *
 * This allows SDK-native spans (invoke_agent, chat, execute_tool, subagent,
 * permission, hook, etc.) to appear in the Agent Debug Log panel without
 * creating duplicate synthetic spans in the extension.
 *
 * The processor injects `copilot_chat.chat_session_id` on each forwarded span
 * using a traceId → sessionId mapping maintained by the extension.
 */
export class CopilotCliBridgeSpanProcessor implements SpanProcessor {
	/**
	 * Maps OTel traceId → VS Code chat session ID.
	 * Populated when copilotcliSession.ts creates its root `invoke_agent copilotcli` span.
	 */
	private readonly _traceIdToSessionId = new Map<string, string>();
	private _disposed = false;

	/**
	 * Hook event data stashed by copilotcliSession for enriching SDK hook spans.
	 * Keyed by hookInvocationId. Input is stashed on hook.start, output on hook.end.
	 */
	private readonly _hookData = new Map<string, HookEventData>();

	/**
	 * SDK hook spans that arrived before hook.end data was stashed.
	 * Held until enrichment data arrives, then injected.
	 */
	private readonly _pendingHookSpans = new Map<string, ICompletedSpanData>();

	constructor(private readonly _otelService: IOTelService) { }

	/** Register a traceId → sessionId mapping for CHAT_SESSION_ID injection. */
	registerTrace(traceId: string, sessionId: string): void {
		this._traceIdToSessionId.set(traceId, sessionId);
	}

	/** Remove a traceId mapping (called when the session request completes). */
	unregisterTrace(traceId: string): void {
		this._traceIdToSessionId.delete(traceId);
	}

	/**
	 * Stash hook input data from a hook.start session event.
	 * Called by copilotcliSession before the SDK span ends.
	 */
	stashHookInput(hookInvocationId: string, hookType: string, input: string | undefined): void {
		this._hookData.set(hookInvocationId, { hookType, input });
	}

	/**
	 * Stash hook completion data from a hook.end session event.
	 * If the SDK span already arrived (held in _pendingHookSpans), enriches and injects it now.
	 */
	stashHookEnd(hookInvocationId: string, hookType: string, output: string | undefined, resultKind: 'success' | 'error', errorMessage: string | undefined): void {
		const existing = this._hookData.get(hookInvocationId);
		if (existing) {
			this._hookData.set(hookInvocationId, { ...existing, output, resultKind, errorMessage });
		} else {
			this._hookData.set(hookInvocationId, { hookType, output, resultKind, errorMessage });
		}

		// If the SDK span arrived before this data, inject it now
		const pendingSpan = this._pendingHookSpans.get(hookInvocationId);
		if (pendingSpan) {
			this._pendingHookSpans.delete(hookInvocationId);
			this._injectEnrichedHookSpan(pendingSpan, hookInvocationId);
		}
	}

	// SpanProcessor interface

	onStart(_span: unknown, _parentContext: unknown): void {
		// Nothing to do on start — we only care about completed spans.
	}

	onEnd(span: ReadableSpan): void {
		if (this._disposed) {
			return;
		}

		const ctx = span.spanContext();
		const sessionId = this._traceIdToSessionId.get(ctx.traceId);

		// Only forward spans that belong to a registered CLI session.
		// This prevents foreground agent spans or other sources from leaking
		// into the CLI session's debug panel bucket.
		if (!sessionId) {
			return;
		}

		const completedSpan = this._toCompletedSpan(span, sessionId);

		// SDK native hook spans: enrich with data from session events and
		// remap to execute_hook so the debug panel shows full details.
		const invocationId = span.attributes[CopilotCliSdkAttr.HOOK_INVOCATION_ID];
		if (span.name.startsWith('hook ') && span.attributes[CopilotCliSdkAttr.HOOK_TYPE] && typeof invocationId === 'string') {
			const hookEndData = this._hookData.get(invocationId);
			if (hookEndData?.resultKind) {
				// hook.end data already arrived — enrich and inject immediately
				this._injectEnrichedHookSpan(completedSpan, invocationId);
			} else {
				// hook.end data not yet available — hold the span until it arrives
				this._pendingHookSpans.set(invocationId, completedSpan);
			}
			return;
		}

		this._otelService.injectCompletedSpan(completedSpan);
	}

	private _injectEnrichedHookSpan(span: ICompletedSpanData, hookInvocationId: string): void {
		const data = this._hookData.get(hookInvocationId);
		this._hookData.delete(hookInvocationId);
		if (!data) {
			this._otelService.injectCompletedSpan(span);
			return;
		}

		const attrs = { ...span.attributes };
		attrs[GenAiAttr.OPERATION_NAME] = GenAiOperationName.EXECUTE_HOOK;
		attrs[CopilotChatAttr.HOOK_TYPE] = data.hookType;
		if (data.input) {
			attrs[CopilotChatAttr.HOOK_INPUT] = data.input;
		}
		if (data.output) {
			attrs[CopilotChatAttr.HOOK_OUTPUT] = data.output;
		}
		if (data.resultKind) {
			attrs[CopilotChatAttr.HOOK_RESULT_KIND] = data.resultKind;
		}

		const enrichedSpan: ICompletedSpanData = {
			...span,
			name: `execute_hook ${data.hookType}`,
			attributes: attrs,
			status: data.resultKind === 'error'
				? { code: SpanStatusCode.ERROR, message: data.errorMessage }
				: { code: SpanStatusCode.OK },
		};
		this._otelService.injectCompletedSpan(enrichedSpan);
	}

	private _toCompletedSpan(span: ReadableSpan, sessionId: string): ICompletedSpanData {
		const ctx = span.spanContext();
		const events: ISpanEventRecord[] = span.events.map(event => ({
			name: event.name,
			timestamp: hrTimeToMs(event.time),
			attributes: event.attributes ? flattenAttributes(event.attributes) : undefined,
		}));

		const baseAttributes = flattenAttributes(span.attributes);

		// Inject CHAT_SESSION_ID so the debug panel can bucket this span correctly
		if (sessionId && !baseAttributes[CopilotChatAttr.CHAT_SESSION_ID]) {
			baseAttributes[CopilotChatAttr.CHAT_SESSION_ID] = sessionId;
		}

		return {
			name: span.name,
			spanId: ctx.spanId,
			traceId: ctx.traceId,
			parentSpanId: span.parentSpanContext?.spanId,
			startTime: hrTimeToMs(span.startTime),
			endTime: hrTimeToMs(span.endTime),
			status: {
				code: span.status.code as SpanStatusCode,
				message: span.status.message,
			},
			attributes: baseAttributes,
			events,
		};
	}

	async shutdown(): Promise<void> {
		this._disposed = true;
		this._traceIdToSessionId.clear();
		this._hookData.clear();
		this._pendingHookSpans.clear();
	}

	async forceFlush(): Promise<void> {
		// No buffering — spans are forwarded synchronously on end.
	}
}
