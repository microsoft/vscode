/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { AgentHostSdkSandboxEnabledSettingId, IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostCustomTerminalToolEnabledSettingId } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../../../platform/sandbox/common/settings.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { readAgentHostSandboxValues, SANDBOX_SETTING_KEYS } from '../common/sandboxSettingsReader.js';

/**
 * Workbench-side host-policy gates that affect which sandbox config the host
 * sends to the Agent Host. Changes to either of these settings invalidate
 * the cached "desired" config and trigger a re-push.
 */
const HOST_POLICY_SETTING_KEYS: readonly string[] = [
	AgentHostCustomTerminalToolEnabledSettingId,
	AgentHostSdkSandboxEnabledSettingId,
];

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
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key))
				|| HOST_POLICY_SETTING_KEYS.some(key => e.affectsConfiguration(key))) {
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
				this._scheduleInitialPush(info.connection);
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
		for (const info of this._connectionsService.connections) {
			if (info.connection) {
				this._tryPush(info.connection);
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
			this._desired = this._computeDesired();
		}
		return this._desired;
	}

	/**
	 * Compute the sandbox config to forward to the Agent Host.
	 *
	 *  - When the Agent Host's own terminal sandbox engine is enabled
	 *    (`chat.agentHost.customTerminalTool.enabled === true`), forward the
	 *    user's full `chat.agent.sandbox.*` policy verbatim. The engine reads
	 *    those values directly.
	 *
	 *  - Otherwise (the SDK runs the shell tool), gate on
	 *    `chat.agentHost.sdkSandbox.enabled`:
	 *      - `'off'` (the default) — forward an empty object so any
	 *        previously-pushed values are cleared and the SDK runs commands
	 *        unsandboxed.
	 *      - `'on'` / `'allowNetwork'` — forward the user's policy but
	 *        override both `enabled` and `enabled.windows` with the SDK
	 *        sandbox value. The SDK sandbox mode is independent of the
	 *        engine sandbox mode, so the user can run the SDK sandboxed
	 *        even when the engine sandbox is off.
	 */
	private _computeDesired(): Record<string, unknown> {
		const customTerminalToolEnabled = this._configurationService.getValue<boolean>(AgentHostCustomTerminalToolEnabledSettingId) === true;
		const values = readAgentHostSandboxValues(this._configurationService, this._logService);
		if (customTerminalToolEnabled) {
			return values;
		}
		const sdkSandbox = this._configurationService.getValue<AgentSandboxEnabledValue>(AgentHostSdkSandboxEnabledSettingId) ?? AgentSandboxEnabledValue.Off;
		if (sdkSandbox !== AgentSandboxEnabledValue.On && sdkSandbox !== AgentSandboxEnabledValue.AllowNetwork) {
			return {};
		}
		values[AgentHostSandboxKey.Enabled] = sdkSandbox;
		values[AgentHostSandboxKey.WindowsEnabled] = sdkSandbox;
		return values;
	}

	override dispose(): void {
		for (const listener of this._scheduled.values()) {
			listener.dispose();
		}
		this._scheduled.clear();
		super.dispose();
	}
}
