/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from '../../../../../../base/common/platform.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { LoggingAgentConnection } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../../../../../../workbench/contrib/terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/** Terminal settings whose change should re-resolve the agent host shell. */
const AGENT_HOST_SHELL_DEPENDENT_SETTINGS = [
	TerminalSettingId.AgentHostProfileLinux,
	TerminalSettingId.AgentHostProfileMacOs,
	TerminalSettingId.AgentHostProfileWindows,
	TerminalSettingId.DefaultProfileLinux,
	TerminalSettingId.DefaultProfileMacOs,
	TerminalSettingId.DefaultProfileWindows,
	TerminalSettingId.ProfilesLinux,
	TerminalSettingId.ProfilesMacOs,
	TerminalSettingId.ProfilesWindows,
];

/**
 * Registers local agent host terminal entries with
 * {@link IAgentHostTerminalService} so they appear in the terminal dropdown.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());
	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostEnabledSettingId)) {
				this._updateEnabled();
			}
		}));

		this._updateEnabled();
	}

	private _updateEnabled(): void {
		if (this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			if (!this._conditionalListeners.value) {
				const store = new DisposableStore();
				store.add(this._agentHostService.onAgentHostStart(() => this._reconcile()));
				store.add(this._configurationService.onDidChangeConfiguration(e => {
					if (AGENT_HOST_SHELL_DEPENDENT_SETTINGS.some(s => e.affectsConfiguration(s))) {
						this._pushDefaultShell();
					}
				}));
				store.add(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._pushDefaultShell()));
				// Retry the push when the host's root state hydrates or its schema
				// changes - the initial push from `_reconcile()` may have raced an
				// undefined `rootState.value`, in which case the schema gate below
				// in `_pushDefaultShell` returned early.
				store.add(this._agentHostService.rootState.onDidChange(() => this._pushDefaultShell()));
				this._conditionalListeners.value = store;
				this._reconcile();
			}
		} else {
			this._conditionalListeners.value = undefined;
			this._localEntry.value = undefined;
		}
	}

	private _reconcile(): void {
		if (!this._localEntry.value) {
			this._localEntry.value = this._agentHostTerminalService.registerEntry({
				name: localize('agentHostTerminal.local', "Local"),
				address: '__local__',
				getConnection: () => this._instantiationService.createInstance(
					LoggingAgentConnection,
					this._agentHostService,
					`agenthost.${this._agentHostService.clientId}`,
					localize('agentHostTerminal.channelLocal', "Agent Host Terminal (Local)"),
				),
			});
		}
		this._pushDefaultShell();
	}

	/**
	 * Resolve the agent host terminal profile (with `defaultProfile.<os>`
	 * fallback) and push the shell path into the agent host's root config so
	 * its host-managed shells inherit the user's preferred terminal binary.
	 *
	 * No-ops if the host's root-config schema doesn't advertise
	 * `AgentHostConfigKey.DefaultShell` - protects older / third-party
	 * agent hosts from receiving keys they don't understand. The push is
	 * retried automatically when `rootState` hydrates (see `_updateEnabled`).
	 *
	 * Local agent host only. Remote agent hosts (via
	 * `IRemoteAgentHostService.connections`) are intentionally not fanned out
	 * to: the resolved path is local-machine-shaped (e.g. a Windows path) and
	 * not necessarily valid on the remote machine. Remote operators should
	 * configure the shell server-side via the remote's `agent-host-config.json`.
	 * See https://github.com/microsoft/vscode/issues/313160 follow-ups.
	 */
	private async _pushDefaultShell(): Promise<void> {
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return;
		}
		if (!rootState.config?.schema.properties[AgentHostConfigKey.DefaultShell]) {
			return;
		}

		let profile;
		try {
			profile = await this._terminalProfileResolverService.getDefaultProfile({
				remoteAuthority: undefined,
				os: OS,
				allowAgentHostShell: true,
			});
		} catch {
			return;
		}

		if (!profile.path) {
			return;
		}

		this._agentHostService.dispatch({
			type: ActionType.RootConfigChanged,
			config: { [AgentHostConfigKey.DefaultShell]: profile.path },
		});
	}
}
