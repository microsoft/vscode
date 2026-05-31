/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
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

	constructor(
		@IAgentHostService private readonly _localAgentHostService: IAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key))) {
				this._desired = undefined;
				this._pushToAllConnections();
			}
		}));

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._syncConnectionListeners();
		}));
		this._syncConnectionListeners();
	}

	private _syncConnectionListeners(): void {
		const live = new Set<IAgentConnection>();
		const ensureScheduled = (connection: IAgentConnection) => {
			live.add(connection);
			if (!this._scheduled.has(connection)) {
				this._scheduleInitialPush(connection);
			}
		};
		ensureScheduled(this._localAgentHostService);
		for (const info of this._remoteAgentHostService.connections) {
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (connection) {
				ensureScheduled(connection);
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
	private _scheduleInitialPush(connection: IAgentConnection): void {
		if (this._tryPush(connection)) {
			this._scheduled.set(connection, Disposable.None);
			return;
		}
		const listener = connection.rootState.onDidChange(() => {
			if (this._tryPush(connection)) {
				this._scheduled.get(connection)?.dispose();
				this._scheduled.set(connection, Disposable.None);
			}
		});
		this._scheduled.set(connection, listener);
	}

	private _pushToAllConnections(): void {
		this._tryPush(this._localAgentHostService);
		for (const info of this._remoteAgentHostService.connections) {
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (connection) {
				this._tryPush(connection);
			}
		}
	}

	/**
	 * Attempt to dispatch the desired sandbox config to `connection`.
	 * Returns `true` once the host has advertised the sandbox schema
	 * (whether or not an actual dispatch was needed); `false` if the
	 * schema is not yet available and the caller should keep waiting.
	 */
	private _tryPush(connection: IAgentConnection): boolean {
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		const schemaProperties = rootState.config?.schema.properties;
		if (!schemaProperties?.[AgentHostSandboxConfigKey.Sandbox]) {
			return false;
		}
		const desired = this._getDesired();
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
