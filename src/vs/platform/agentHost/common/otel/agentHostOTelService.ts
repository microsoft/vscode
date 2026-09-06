/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryConfig } from '@github/copilot-sdk';
import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';


/**
 * Lean service that wires the @github/copilot-sdk telemetry hook to either:
 *
 *  - **External-only mode**: pass user-configured exporter settings straight through
 *    so the SDK's spawned CLI exports OTel data directly to the user's sink.
 *  - **DB mode** (`COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED=true`): point the SDK at a
 *    loopback OTLP/HTTP receiver, persist all spans into a local SQLite store, and
 *    optionally fan-out to a user-configured external sink as well.
 *
 * The interface lives in `common/` so consumers (DI registration, tests, callers
 * in other layers) can import it without pulling in the node-only concrete
 * implementation and its transitive native dependencies (`node:sqlite`).
 */
export const AgentHostOTelServiceNamespace = 'vscode.agent-host';
export const AgentHostOTelServiceName = 'vscode-agent-host';
export const AgentHostSessionSpanName = 'vscode.agent_host.session';
export const AgentHostSessionTitleSpanName = 'vscode.agent_host.session.title_changed';

export const AgentHostSessionTitleAttribute = 'vscode.agent_host.session.title';
export const AgentHostSessionUriAttribute = 'vscode.agent_host.session.uri';

export interface IAgentHostTraceContext {
	readonly traceId: string;
	readonly spanId: string;
	readonly traceparent: string;
	readonly tracestate?: string;
}

export interface IAgentHostNativeOTelConfig {
	/** Trace destination. In DB mode this is the Agent Host HTTP/JSON loopback. */
	readonly traces?: { readonly endpoint: string; readonly protocol: 'http/json' | 'http/protobuf' | 'grpc' };
	/** User-owned OTLP destination used directly by native SDK logs and metrics. */
	readonly external?: {
		readonly endpoint: string;
		readonly protocol: 'http/json' | 'http/protobuf' | 'grpc';
		readonly headers?: Readonly<Record<string, string>>;
	};
	readonly captureContent: boolean;
	readonly resourceAttributes: Readonly<Record<string, string>>;
}

export interface IAgentHostOTelService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the telemetry config to hand to `new CopilotClient({ telemetry })`,
	 * starting the loopback receiver + store on first call when in DB mode.
	 * Resolves to `undefined` when telemetry is disabled.
	 */
	getSdkTelemetryConfig(): Promise<TelemetryConfig | undefined>;

	/** Resolve provider-neutral native SDK destinations. Logs and metrics always
	 * use {@link IAgentHostNativeOTelConfig.external}; only traces use the DB loopback. */
	getNativeSdkTelemetryConfig(): Promise<IAgentHostNativeOTelConfig | undefined>;

	/** Return a stable W3C parent for a provider session and emit its anchor span. */
	getSessionTraceContext(conversationId: string, sessionUri: string): IAgentHostTraceContext | undefined;

	/** Release a permanent session's retained W3C context. Idle eviction must not call this. */
	releaseSessionTraceContext(sessionUri: string): void;

	/** Scope a provider SDK operation so callback-based propagation can read its parent. */
	withTraceContext<T>(context: IAgentHostTraceContext | undefined, fn: () => T): T;
	getCurrentTraceContext(): IAgentHostTraceContext | undefined;

	/**
	 * Path of the SQLite span store, or `undefined` when DB mode is off.
	 */
	getSpansDbPath(): URI | undefined;

	/**
	 * Emits a standalone metadata span carrying the latest title for an
	 * agent-host session, correlated to the provider's telemetry by its
	 * conversation id (e.g. the Copilot SDK conversation id, the Claude SDK
	 * session id, or the Codex agent host session id). No span is emitted when
	 * telemetry or content capture is disabled.
	 */
	emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void;

	/**
	 * Drain any in-flight outbound forwarding. Safe to call concurrently with
	 * ongoing ingestion.
	 */
	flush(): Promise<void>;
}

export const IAgentHostOTelService = createDecorator<IAgentHostOTelService>('agentHostOTelService');
