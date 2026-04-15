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
