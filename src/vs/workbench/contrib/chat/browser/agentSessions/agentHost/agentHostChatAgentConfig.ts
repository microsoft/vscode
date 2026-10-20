/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import type { RootConfigState } from '../../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import type { SessionConfigState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/** The resolved config of an agent for a chat whose agent differs from its session's. */
export interface IAgentHostChatAgentConfig {
	/** The agent's resolved config; `undefined` while resolving or after a failure. */
	readonly config: SessionConfigState | undefined;
	/** Whether the agent's config is being resolved. */
	readonly resolving: boolean;
}

interface IEntry {
	/** The handshake and root config the entry was resolved against; a change of either invalidates it. */
	readonly initializeResult: InitializeResult | undefined;
	readonly rootConfig: RootConfigState | undefined;
	resolving: boolean;
	config: SessionConfigState | undefined;
}

const caches = new WeakMap<IAgentConnection, Map<string, IEntry>>();
const onDidChange = new Emitter<IAgentConnection>();

/** Fires with the connection whose cached agent configs changed (resolved, failed, or cleared). */
export const onDidChangeAgentHostChatAgentConfig: Event<IAgentConnection> = onDidChange.event;

/**
 * The config of `provider`'s agent, as `resolveSessionConfig` resolves it for
 * `workingDirectory`, for chats whose agent differs from their session's (the
 * protocol carries no schema on a chat). Resolved lazily on first read and
 * cached per connection, provider, and working directory; a reconnect (a new
 * `initializeResult`) or a root config change invalidates it, and the next
 * read resolves it again. Fires {@link onDidChangeAgentHostChatAgentConfig}
 * when a resolution settles. A failure is logged and reads as no config.
 */
export function getAgentHostChatAgentConfig(connection: IAgentConnection, provider: string, workingDirectory: URI | undefined, logService?: ILogService): IAgentHostChatAgentConfig {
	let cache = caches.get(connection);
	if (!cache) {
		cache = new Map();
		caches.set(connection, cache);
	}
	const key = `${provider}\n${workingDirectory?.toString() ?? ''}`;
	const initializeResult = connection.initializeResult.get();
	const root = connection.rootState.value;
	const rootConfig = root && !(root instanceof Error) ? root.config : undefined;
	let entry = cache.get(key);
	if (!entry || entry.initializeResult !== initializeResult || entry.rootConfig !== rootConfig) {
		const resolving: IEntry = { initializeResult, rootConfig, resolving: true, config: undefined };
		entry = resolving;
		cache.set(key, resolving);
		const entries = cache;
		connection.resolveSessionConfig({ provider, workingDirectory }).then(result => {
			if (entries.get(key) === resolving) {
				resolving.config = result;
				resolving.resolving = false;
				onDidChange.fire(connection);
			}
		}, error => {
			if (entries.get(key) === resolving) {
				logService?.warn(`[AgentHost] Failed to resolve the config of agent '${provider}' for a chat: ${error}`);
				resolving.resolving = false;
				onDidChange.fire(connection);
			}
		});
	}
	return { config: entry.config, resolving: entry.resolving };
}

/** Drops the agent configs cached for `connection`, e.g. when it reconnects. */
export function clearAgentHostChatAgentConfigs(connection: IAgentConnection): void {
	if (caches.delete(connection)) {
		onDidChange.fire(connection);
	}
}
