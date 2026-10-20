/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { RootConfigState } from '../../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import type { SessionConfigState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/** The resolved config of an agent for a chat whose agent differs from its session's. */
export interface IAgentHostChatAgentConfig {
	/** The agent's resolved config; `undefined` while resolving or after a failure. */
	readonly config: SessionConfigState | undefined;
	/** Whether the agent's config is being resolved. */
	readonly resolving: boolean;
}

export const IAgentHostChatAgentConfigService = createDecorator<IAgentHostChatAgentConfigService>('agentHostChatAgentConfigService');

/**
 * Resolves the config of the agent backing a chat whose agent differs from its
 * session's: the protocol carries no schema on a chat, so clients obtain that
 * agent's schema and values with `resolveSessionConfig` for its provider.
 */
export interface IAgentHostChatAgentConfigService {
	readonly _serviceBrand: undefined;

	/** Fires with the connection whose agent configs changed (a resolution settled, or they were cleared). */
	readonly onDidChange: Event<IAgentConnection>;

	/**
	 * The config of `provider`'s agent on `connection`, as `resolveSessionConfig`
	 * resolves it for `workingDirectory`. Resolved lazily on first read and cached
	 * per connection, provider, and working directory; a reconnect (a new
	 * `initializeResult`) or a root config change invalidates it, and the next
	 * read resolves it again. A failure is logged and reads as no config.
	 */
	getAgentConfig(connection: IAgentConnection, provider: string, workingDirectory: URI | undefined): IAgentHostChatAgentConfig;

	/** Drops the agent configs cached for `connection`, e.g. when it is replaced. */
	clear(connection: IAgentConnection): void;
}

interface IEntry {
	/** The handshake and root config the entry was resolved against; a change of either invalidates it. */
	readonly initializeResult: InitializeResult | undefined;
	readonly rootConfig: RootConfigState | undefined;
	resolving: boolean;
	config: SessionConfigState | undefined;
}

export class AgentHostChatAgentConfigService extends Disposable implements IAgentHostChatAgentConfigService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<IAgentConnection>());
	readonly onDidChange = this._onDidChange.event;

	/** Keyed weakly: a connection exposes no disposal event, so its entries go with it. */
	private readonly _caches = new WeakMap<IAgentConnection, Map<string, IEntry>>();

	constructor(@ILogService private readonly _logService: ILogService) {
		super();
	}

	getAgentConfig(connection: IAgentConnection, provider: string, workingDirectory: URI | undefined): IAgentHostChatAgentConfig {
		let cache = this._caches.get(connection);
		if (!cache) {
			cache = new Map();
			this._caches.set(connection, cache);
		}
		const key = `${provider}\n${workingDirectory?.toString() ?? ''}`;
		const initializeResult = connection.initializeResult.get();
		const root = connection.rootState.value;
		const rootConfig = root && !(root instanceof Error) ? root.config : undefined;
		let entry = cache.get(key);
		if (!entry || entry.initializeResult !== initializeResult || entry.rootConfig !== rootConfig) {
			entry = this._resolve(connection, cache, key, provider, workingDirectory, initializeResult, rootConfig);
		}
		return { config: entry.config, resolving: entry.resolving };
	}

	clear(connection: IAgentConnection): void {
		if (this._caches.delete(connection)) {
			this._onDidChange.fire(connection);
		}
	}

	private _resolve(connection: IAgentConnection, cache: Map<string, IEntry>, key: string, provider: string, workingDirectory: URI | undefined, initializeResult: InitializeResult | undefined, rootConfig: RootConfigState | undefined): IEntry {
		const entry: IEntry = { initializeResult, rootConfig, resolving: true, config: undefined };
		cache.set(key, entry);
		// A settled resolution applies only while its entry is current: a later invalidation replaced it.
		const isCurrent = () => this._caches.get(connection) === cache && cache.get(key) === entry;
		connection.resolveSessionConfig({ provider, workingDirectory }).then(result => {
			if (isCurrent()) {
				entry.config = result;
				entry.resolving = false;
				this._onDidChange.fire(connection);
			}
		}, error => {
			if (isCurrent()) {
				this._logService.warn(`[AgentHost] Failed to resolve the config of agent '${provider}' for a chat: ${error}`);
				entry.resolving = false;
				this._onDidChange.fire(connection);
			}
		});
		return entry;
	}
}

registerSingleton(IAgentHostChatAgentConfigService, AgentHostChatAgentConfigService, InstantiationType.Delayed);
