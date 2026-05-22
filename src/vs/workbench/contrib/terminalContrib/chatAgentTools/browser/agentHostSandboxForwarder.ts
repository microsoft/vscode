/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { IAgentConnection, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentHostSandboxConfigKey } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { readAgentHostSandboxValues, SANDBOX_SETTING_KEYS } from '../common/sandboxSettingsReader.js';

/**
 * Forwards the workbench user's sandbox setting values into every connected
 * agent host (local + remote) via `RootConfigChanged` actions, so the
 * agent-host terminal sandbox engine can mirror the user's preferences.
 *
 * Each push is schema-guarded against the receiving host's published root
 * config schema, so older hosts that don't advertise the sandbox keys
 * gracefully ignore them. Per-key value comparison against
 * `rootState.config.values` suppresses no-op dispatches.
 *
 * The forwarder reacts to:
 *  - workbench `IConfigurationService.onDidChangeConfiguration` for any
 *    sandbox-related key (modern or deprecated)
 *  - `IAgentHostService.rootState.onDidChange` / per-remote rootState
 *    hydration (covers the initial push race where state arrives after
 *    construction)
 *  - `IRemoteAgentHostService.onDidChangeConnections` (new remotes get an
 *    initial push as soon as they connect)
 */
export class AgentHostSandboxForwarder extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostSandboxForwarder';

	private readonly _remoteListeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IAgentHostService private readonly _localAgentHostService: IAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key))) {
				this._pushToAllConnections();
			}
		}));

		this._register(this._localAgentHostService.rootState.onDidChange(() => {
			this._pushToConnection(this._localAgentHostService);
		}));

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._refreshRemoteListeners();
			this._pushToAllConnections();
		}));
		this._refreshRemoteListeners();

		this._pushToAllConnections();
	}

	private _refreshRemoteListeners(): void {
		const store = new DisposableStore();
		for (const info of this._remoteAgentHostService.connections) {
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (connection) {
				store.add(connection.rootState.onDidChange(() => this._pushToConnection(connection)));
			}
		}
		this._remoteListeners.value = store;
	}

	private _pushToAllConnections(): void {
		this._pushToConnection(this._localAgentHostService);
		for (const info of this._remoteAgentHostService.connections) {
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (connection) {
				this._pushToConnection(connection);
			}
		}
	}

	private _pushToConnection(connection: IAgentConnection): void {
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return;
		}
		const schemaProperties = rootState.config?.schema.properties;
		if (!schemaProperties?.[AgentHostSandboxConfigKey.Sandbox]) {
			// Older hosts that don't advertise the `sandbox` config key —
			// skip silently.
			return;
		}
		const desired = readAgentHostSandboxValues(this._configurationService, this._logService);
		if (typeof desired.enabled === 'object') {
			delete desired.enabled; // Work around nested enabled.windows setting.
		}
		const current = (rootState.config?.values?.[AgentHostSandboxConfigKey.Sandbox] as Record<string, unknown> | undefined) ?? {};
		if (equals(current, desired)) {
			return;
		}
		connection.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostSandboxConfigKey.Sandbox]: desired },
		});
	}
}
