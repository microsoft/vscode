/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { IObservable } from '../../base/common/observable.js';
import { equals } from '../../base/common/objects.js';
import { RemoteAgentHostConnectionStatus } from '../../platform/agentHost/common/remoteAgentHostService.js';
import { IResolveSessionConfigResult, ISessionConfigValueItem } from '../../platform/agentHost/common/state/protocol/commands.js';
import { ISessionsProvider } from '../services/sessions/common/sessionsProvider.js';

/**
 * Extended sessions provider for agent host providers (local and remote).
 * Adds remote connection properties and dynamic session configuration.
 */
export interface IAgentHostSessionsProvider extends ISessionsProvider {
	// -- Remote Connection (optional, used by remote agent host providers) --
	/** Connection status observable, present on remote providers. */
	readonly connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>;
	/** Remote address string, present on remote providers. */
	readonly remoteAddress?: string;
	/** Output channel ID for remote provider logs. */
	outputChannelId?: string;
	/**
	 * Establish (or re-establish) the connection for this host on demand.
	 * Tears down any existing connection first. Present on remote providers
	 * that manage their own transport (e.g. tunnel relay); providers that
	 * use the generic {@link IRemoteAgentHostService} reconnect flow may
	 * leave this undefined.
	 */
	connect?(): Promise<void>;
	/**
	 * Tear down the active connection for this host without forgetting the
	 * entry. A subsequent {@link connect} call should be able to re-establish
	 * it. Present on remote providers that manage their own transport.
	 */
	disconnect?(): Promise<void>;

	// -- Dynamic Session Config --

	/** Fires when dynamic configuration for a session changes. */
	readonly onDidChangeSessionConfig: Event<string>;
	/** Returns the last resolved dynamic configuration for a session. */
	getSessionConfig(sessionId: string): IResolveSessionConfigResult | undefined;
	/** Sets one dynamic configuration property and re-resolves the schema. */
	setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void>;
	/**
	 * Replaces the full set of running-session config values atomically.
	 *
	 * Dispatches a single `session/configChanged` action with replace
	 * semantics. Only user-editable properties (`sessionMutable: true` and
	 * not `readOnly`) are actually replaced from the caller-supplied values —
	 * for every other property the current value is carried through, so
	 * non-mutable / read-only properties (e.g. `isolation`, `branch`) can
	 * never be altered through this API even if included in the input.
	 * Unknown keys (no schema entry) are ignored.
	 *
	 * No-op for pre-creation (new) sessions — use {@link setSessionConfigValue}
	 * there since the schema is still being resolved.
	 */
	replaceSessionConfig(sessionId: string, values: Record<string, unknown>): Promise<void>;
	/** Returns dynamic completions for a configuration property. */
	getSessionConfigCompletions(sessionId: string, property: string, query?: string): Promise<readonly ISessionConfigValueItem[]>;
	/** Returns the resolved config that should be sent to createSession. */
	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined;
	/** Clears dynamic configuration state for an abandoned new session. */
	clearSessionConfig(sessionId: string): void;
}

const LOCAL_AGENT_HOST_PROVIDER_ID = 'local-agent-host';
const REMOTE_AGENT_HOST_PROVIDER_PREFIX = 'agenthost-';

/**
 * Checks whether a provider is an agent host provider based on its
 * reserved provider ID (`local-agent-host` or `agenthost-*` prefix).
 */
export function isAgentHostProvider(provider: ISessionsProvider): provider is IAgentHostSessionsProvider {
	return provider.id === LOCAL_AGENT_HOST_PROVIDER_ID || provider.id.startsWith(REMOTE_AGENT_HOST_PROVIDER_PREFIX);
}

/**
 * Structural equality for resolved session configs. Returns true when both
 * inputs have the same value-key set with deep-equal values and the same set
 * of schema property keys with identical (by-identity) property objects.
 * Schema property objects are compared by identity since they originate from
 * the same protocol snapshot in the providers that use this helper. Values
 * are deep-compared via {@link equals} so non-string entries (e.g. permission
 * objects) compare correctly.
 */
export function resolvedConfigsEqual(a: IResolveSessionConfigResult, b: IResolveSessionConfigResult): boolean {
	const aValueKeys = Object.keys(a.values);
	const bValueKeys = Object.keys(b.values);
	if (aValueKeys.length !== bValueKeys.length) {
		return false;
	}
	for (const key of aValueKeys) {
		if (!equals(a.values[key], b.values[key])) {
			return false;
		}
	}
	const aPropKeys = Object.keys(a.schema.properties);
	const bPropKeys = Object.keys(b.schema.properties);
	if (aPropKeys.length !== bPropKeys.length) {
		return false;
	}
	for (const key of aPropKeys) {
		if (a.schema.properties[key] !== b.schema.properties[key]) {
			return false;
		}
	}
	return true;
}

/** Known auto-approve config values. */
const AUTO_APPROVE_ENUM = ['default', 'autoApprove', 'autopilot'];

type MutableConfigSchemaItem =
	| { type: 'string'; title: string; sessionMutable: true; enum: string[] }
	| { type: 'number'; title: string; sessionMutable: true }
	| { type: 'boolean'; title: string; sessionMutable: true }
	| { type: 'array'; title: string; sessionMutable: true }
	| { type: 'object'; title: string; sessionMutable: true };

function buildMutableConfigSchemaItem(key: string, value: unknown): MutableConfigSchemaItem | undefined {
	if (typeof value === 'string') {
		return {
			type: 'string',
			title: key,
			sessionMutable: true,
			enum: key === 'autoApprove' ? AUTO_APPROVE_ENUM : [value],
		};
	}
	if (typeof value === 'number') {
		return { type: 'number', title: key, sessionMutable: true };
	}
	if (typeof value === 'boolean') {
		return { type: 'boolean', title: key, sessionMutable: true };
	}
	if (Array.isArray(value)) {
		return { type: 'array', title: key, sessionMutable: true };
	}
	if (value && typeof value === 'object') {
		return { type: 'object', title: key, sessionMutable: true };
	}
	return undefined;
}

/**
 * Builds a minimal session-mutable config schema from changed values.
 * Used when a restored session receives a ConfigChanged action before
 * the full schema has been hydrated. Properties whose value type isn't
 * representable in the config schema (e.g. `null`, `undefined`) are
 * omitted.
 */
export function buildMutableConfigSchema(config: Record<string, unknown>): Record<string, MutableConfigSchemaItem> {
	const properties: Record<string, MutableConfigSchemaItem> = {};
	for (const key of Object.keys(config)) {
		const property = buildMutableConfigSchemaItem(key, config[key]);
		if (property) {
			properties[key] = property;
		}
	}
	return properties;
}
