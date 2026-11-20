/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSandboxConfigKey, sandboxSettingIdToAgentHostKey } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISandboxProfile, selectedSandboxProfile, watchSandboxProfiles } from '../../../../../platform/sandbox/common/sandboxProfiles.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { readAgentHostSandboxValues, SANDBOX_SETTING_KEYS } from '../common/sandboxSettingsReader.js';

/**
 * Forwards the workbench user's applicable sandbox setting values into every
 * connected agent host (local + remote) via `RootConfigChanged` actions.
 *
 * The forwarder is deliberately one-directional: it pushes only when
 *  - a connection comes online (initial push, deferred until the host
 *    advertises the sandbox schema), or
 *  - a sandbox-related workbench setting changes.
 *
 * It does NOT react to agent-host root-state changes after the initial
 * push, so concurrent edits coming from the host (or from another client
 * attached to the same host) do not trigger a push-back loop. Each push
 * is schema-guarded so older hosts that don't advertise the sandbox keys
 * are skipped silently.
 */
export class AgentHostSandboxForwarder extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostSandboxForwarder';

	/**
	 * Connections that have already had their initial push attempted
	 * (successfully or via a pending listener waiting for the sandbox
	 * schema). Used to avoid re-scheduling pushes for connections that
	 * are still present across `onDidChangeConnections` events.
	 */
	private readonly _scheduled = new Map<IAgentConnection, IDisposable>();

	private _desired: Record<string, unknown> | undefined;
	private readonly _lastProfile = new WeakMap<IAgentConnection, ISandboxProfile['settings'] | undefined>();

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		watchSandboxProfiles(this._storage, this._store, address => {
			for (const info of this._connectionsService.connections) {
				if (info.address && info.connection && (!address || address === info.address)) {
					const settings = selectedSandboxProfile(this._storage, info.address)?.settings;
					if (address || !equals(settings, this._lastProfile.get(info.connection))) {
						this._tryPush(info.connection, info.address);
					}
				}
			}
		});

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key))) {
				this._desired = undefined;
				this._pushToAllConnections();
			}
		}));

		this._register(this._connectionsService.onDidChangeConnections(() => {
			this._syncConnectionListeners();
		}));
		this._syncConnectionListeners();
	}

	private _syncConnectionListeners(): void {
		const live = new Set<IAgentConnection>();
		for (const info of this._connectionsService.connections) {
			if (!info.connection) {
				continue;
			}
			live.add(info.connection);
			if (!this._scheduled.has(info.connection)) {
				this._scheduleInitialPush(info.connection, info.address);
			}
		}
		for (const [connection, listener] of this._scheduled) {
			if (!live.has(connection)) {
				listener.dispose();
				this._scheduled.delete(connection);
			}
		}
	}

	/**
	 * Push immediately if the host is already advertising the sandbox
	 * schema; otherwise subscribe to `rootState.onDidChange` long enough
	 * to catch the schema and push exactly once, then unsubscribe.
	 */
	private _scheduleInitialPush(connection: IAgentConnection, address: string | undefined): void {
		if (this._tryPush(connection, address)) {
			this._scheduled.set(connection, Disposable.None);
			return;
		}
		const listener = connection.rootState.onDidChange(() => {
			if (this._tryPush(connection, address)) {
				this._scheduled.get(connection)?.dispose();
				this._scheduled.set(connection, Disposable.None);
			}
		});
		this._scheduled.set(connection, listener);
	}

	private _pushToAllConnections(): void {
		for (const info of this._connectionsService.connections) {
			if (info.connection) {
				this._tryPush(info.connection, info.address);
			}
		}
	}

	/**
	 * Attempt to dispatch the desired sandbox config to `connection`.
	 * Returns `true` once the host has advertised the sandbox schema
	 * (whether or not an actual dispatch was needed); `false` if the
	 * schema is not yet available and the caller should keep waiting.
	 */
	private _tryPush(connection: IAgentConnection, address: string | undefined): boolean {
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		const schemaProperties = rootState.config?.schema.properties;
		if (!schemaProperties?.[AgentHostSandboxConfigKey.Sandbox]) {
			return false;
		}
		const profile = address ? selectedSandboxProfile(this._storage, address) : undefined;
		this._lastProfile.set(connection, profile?.settings);
		const desired = { ...this._getDesired() };
		if (profile) {
			for (const [setting, key] of Object.entries(sandboxSettingIdToAgentHostKey)) {
				if (Object.hasOwn(profile.settings, setting) && this._configurationService.inspect(setting).policyValue === undefined) {
					desired[key] = profile.settings[setting];
				}
			}
		}
		const current = (rootState.config?.values?.[AgentHostSandboxConfigKey.Sandbox] as Record<string, unknown> | undefined) ?? {};
		if (!equals(current, desired)) {
			connection.dispatch(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: desired },
			});
		}
		return true;
	}

	private _getDesired(): Record<string, unknown> {
		if (this._desired === undefined) {
			this._desired = readAgentHostSandboxValues(this._configurationService, this._logService);
		}
		return this._desired;
	}

	override dispose(): void {
		for (const listener of this._scheduled.values()) {
			listener.dispose();
		}
		this._scheduled.clear();
		super.dispose();
	}
}
