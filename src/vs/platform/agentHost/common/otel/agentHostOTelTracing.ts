/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostGenAiAttr, AgentHostGenAiOperationName, AgentHostOTelAttr } from './agentHostOTelAttributes.js';
import type { AgentHostTraceContext } from './agentHostTraceContext.js';
import { AgentHostSpanStatusCode, type AgentHostSpanAttributes, type IAgentHostOTelService, type IAgentHostSpanHandle } from './agentHostOTelService.js';

export interface AgentHostVerboseOperation {
	readonly name: string;
	readonly operation: string;
	readonly attributes?: AgentHostSpanAttributes;
}

export interface AgentHostSdkOperation extends AgentHostVerboseOperation {
	readonly call: string;
	readonly reason: string;
}

function verboseOperation(name: string, operation: string, attributes?: AgentHostSpanAttributes): AgentHostVerboseOperation {
	return { name, operation, attributes };
}

function sdkOperation(call: string, reason: string): AgentHostSdkOperation {
	return {
		name: `vscode_agent_host.sdk.${call}`,
		operation: `sdk.${call}`,
		call,
		reason,
	};
}

export const AgentHostVerboseTrace = {
	ChatInvoke: verboseOperation('chat.agent_host.invoke', 'chat.invoke', { [AgentHostGenAiAttr.OPERATION_NAME]: AgentHostGenAiOperationName.CHAT }),
	ChatTurn: verboseOperation('chat.agent_host.turn', 'chat.turn', { [AgentHostGenAiAttr.OPERATION_NAME]: AgentHostGenAiOperationName.CHAT }),
	ListSessions: verboseOperation('vscode_agent_host.list_sessions', 'list_sessions'),
	ListSessionProviders: verboseOperation('vscode_agent_host.list_sessions.providers', 'list_sessions.providers'),
	SessionMetadataOverlay: verboseOperation('vscode_agent_host.db.session_metadata_overlay', 'db.session_metadata_overlay'),
	CreateSession: verboseOperation('vscode_agent_host.create_session', 'create_session'),
	PersistConfigValues: verboseOperation('vscode_agent_host.db.persist_config_values', 'db.persist_config_values'),
	ResolveCreatedSessionConfig: verboseOperation('vscode_agent_host.resolve_created_session_config', 'resolve_created_session_config'),
	CopilotListSessions: verboseOperation('vscode_agent_host.copilot.list_sessions', 'copilot.list_sessions'),
	CopilotGetSessionMetadata: verboseOperation('vscode_agent_host.copilot.get_session_metadata', 'copilot.get_session_metadata'),
	CopilotListModels: verboseOperation('vscode_agent_host.copilot.list_models', 'copilot.list_models'),
	MaterializeProvisional: verboseOperation('vscode_agent_host.materialize_provisional', 'materialize_provisional'),
	StoreSessionMetadata: verboseOperation('vscode_agent_host.db.store_session_metadata', 'db.store_session_metadata'),
	ReadSessionMetadata: verboseOperation('vscode_agent_host.db.read_session_metadata', 'db.read_session_metadata'),
	ReadStoredSessionMetadata: verboseOperation('vscode_agent_host.db.read_stored_session_metadata', 'db.read_stored_session_metadata'),
	ReadStoredSessionMetadataBatch: verboseOperation('vscode_agent_host.db.read_stored_session_metadata_batch', 'db.read_stored_session_metadata_batch'),
} as const;

export const AgentHostSdkTrace = {
	ClientStart: sdkOperation('client.start', 'ensure_client'),
	ClientStopAuthenticationChanged: sdkOperation('client.stop', 'authentication_changed_during_start'),
	ClientListSessions: sdkOperation('client.list_sessions', 'provider_list_sessions'),
	ClientGetSessionMetadata: sdkOperation('client.get_session_metadata', 'provider_get_session_metadata'),
	ClientListModels: sdkOperation('client.list_models', 'provider_list_models'),
	ClientForkSession: sdkOperation('client.rpc.sessions.fork', 'fork_session'),
	ClientCreateSessionForMaterialization: sdkOperation('client.create_session', 'materialize_provisional'),
	ClientGetSessionMetadataForResume: sdkOperation('client.get_session_metadata', 'resume_session_metadata_lookup'),
	ClientResumeSession: sdkOperation('client.resume_session', 'resume_cached_session'),
	ClientCreateSessionForResumeFallback: sdkOperation('client.create_session', 'resume_fallback_after_empty_session'),
	SessionSendUserTurn: sdkOperation('session.send', 'user_turn'),
	SessionApplyMode: sdkOperation('session.rpc.mode.set', 'apply_chat_mode'),
	SessionSendSteering: sdkOperation('session.send', 'steering_message'),
	SessionGetMessages: sdkOperation('session.get_messages', 'read_session_history'),
	SessionGetSubagentMessages: sdkOperation('session.get_messages', 'read_subagent_history'),
	SessionAbort: sdkOperation('session.abort', 'cancel_turn'),
	SessionDestroy: sdkOperation('session.destroy', 'dispose_session'),
	SessionSetModel: sdkOperation('session.set_model', 'change_model'),
	SessionReadPlan: sdkOperation('session.rpc.plan.read', 'exit_plan_mode_request'),
	SessionTruncateHistory: sdkOperation('session.rpc.history.truncate', 'truncate_session_history'),
} as const;

export interface AgentHostOTelTracerContext {
	readonly provider?: string;
	readonly sessionId?: string | (() => string | undefined);
	readonly turnId?: string | (() => string | undefined);
	readonly parentTraceContext?: () => AgentHostTraceContext | undefined;
}

export class AgentHostOTelTracer {

	constructor(
		private readonly _otelService: IAgentHostOTelService,
		private readonly _context: AgentHostOTelTracerContext = {},
	) { }

	startVerbose(operation: AgentHostVerboseOperation, attributes: AgentHostSpanAttributes = {}, parentSpan?: IAgentHostSpanHandle): IAgentHostSpanHandle | undefined {
		if (!this._otelService.config.enabled || !this._otelService.config.verboseTracing) {
			return undefined;
		}
		return this._otelService.startSpan(operation.name, {
			parentTraceContext: parentSpan?.getSpanContext() ?? this._context.parentTraceContext?.(),
			attributes: {
				[AgentHostOTelAttr.VERBOSE]: true,
				[AgentHostOTelAttr.OPERATION]: operation.operation,
				...operation.attributes,
				...this._baseAttributes(),
				...attributes,
			},
		});
	}

	async traceVerbose<T>(operation: AgentHostVerboseOperation, fn: (span: IAgentHostSpanHandle | undefined) => Promise<T>, attributes: AgentHostSpanAttributes = {}, parentSpan?: IAgentHostSpanHandle, options: { readonly setOkStatus?: boolean } = {}): Promise<T> {
		const span = this.startVerbose(operation, attributes, parentSpan);
		try {
			const result = await fn(span);
			if (options.setOkStatus !== false) {
				span?.setStatus(AgentHostSpanStatusCode.OK);
			}
			return result;
		} catch (error) {
			span?.recordException(error);
			throw error;
		} finally {
			span?.end();
		}
	}

	async traceActiveVerbose<T>(operation: AgentHostVerboseOperation, fn: (span: IAgentHostSpanHandle | undefined) => Promise<T>, attributes: AgentHostSpanAttributes = {}, parentSpan?: IAgentHostSpanHandle): Promise<T> {
		if (!this._otelService.config.enabled || !this._otelService.config.verboseTracing) {
			return fn(undefined);
		}
		return this._otelService.startActiveSpan(operation.name, {
			parentTraceContext: parentSpan?.getSpanContext() ?? this._context.parentTraceContext?.(),
			attributes: {
				[AgentHostOTelAttr.VERBOSE]: true,
				[AgentHostOTelAttr.OPERATION]: operation.operation,
				...operation.attributes,
				...this._baseAttributes(),
				...attributes,
			},
		}, fn);
	}

	traceSdkCall<T>(operation: AgentHostSdkOperation, fn: () => Promise<T>, attributes: AgentHostSpanAttributes = {}, parentSpan?: IAgentHostSpanHandle): Promise<T> {
		return this.traceVerbose(operation, () => fn(), {
			[AgentHostOTelAttr.SDK_CALL]: operation.call,
			[AgentHostOTelAttr.SDK_REASON]: operation.reason,
			...attributes,
		}, parentSpan);
	}

	private _baseAttributes(): AgentHostSpanAttributes {
		return {
			...(this._context.provider ? { [AgentHostOTelAttr.PROVIDER]: this._context.provider } : {}),
			...this._attribute(AgentHostOTelAttr.SESSION_ID, this._context.sessionId),
			...this._attribute(AgentHostOTelAttr.TURN_ID, this._context.turnId),
		};
	}

	private _attribute(key: string, value: string | (() => string | undefined) | undefined): AgentHostSpanAttributes {
		const resolved = typeof value === 'function' ? value() : value;
		return resolved !== undefined ? { [key]: resolved } : {};
	}
}
