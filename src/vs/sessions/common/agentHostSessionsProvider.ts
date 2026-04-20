/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { IObservable } from '../../base/common/observable.js';
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

	// -- Dynamic Session Config --

	/** Fires when dynamic configuration for a session changes. */
	readonly onDidChangeSessionConfig: Event<string>;
	/** Returns the last resolved dynamic configuration for a session. */
	getSessionConfig(sessionId: string): IResolveSessionConfigResult | undefined;
	/** Sets one dynamic configuration property and re-resolves the schema. */
	setSessionConfigValue(sessionId: string, property: string, value: string): Promise<void>;
	/** Returns dynamic completions for a configuration property. */
	getSessionConfigCompletions(sessionId: string, property: string, query?: string): Promise<readonly ISessionConfigValueItem[]>;
	/** Returns the resolved config that should be sent to createSession. */
	getCreateSessionConfig(sessionId: string): Record<string, string> | undefined;
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
 * Shallow structural equality for resolved session configs. Returns true when
 * both inputs have the same value-key set with identical string values and
 * the same set of schema property keys with identical (by-identity) property
 * objects. Schema property objects are compared by identity since they
 * originate from the same protocol snapshot in the providers that use this
 * helper.
 */
export function resolvedConfigsEqual(a: IResolveSessionConfigResult, b: IResolveSessionConfigResult): boolean {
	const aValueKeys = Object.keys(a.values);
	const bValueKeys = Object.keys(b.values);
	if (aValueKeys.length !== bValueKeys.length) {
		return false;
	}
	for (const key of aValueKeys) {
		if (a.values[key] !== b.values[key]) {
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

/**
 * Builds a minimal session-mutable config schema from changed values.
 * Used when a restored session receives a ConfigChanged action before
 * the full schema has been hydrated.
 */
export function buildMutableConfigSchema(config: Record<string, string>): Record<string, { type: 'string'; title: string; sessionMutable: true; enum: string[] }> {
	const properties: Record<string, { type: 'string'; title: string; sessionMutable: true; enum: string[] }> = {};
	for (const key of Object.keys(config)) {
		properties[key] = {
			type: 'string',
			title: key,
			sessionMutable: true,
			enum: key === 'autoApprove' ? AUTO_APPROVE_ENUM : [config[key]],
		};
	}
	return properties;
}
