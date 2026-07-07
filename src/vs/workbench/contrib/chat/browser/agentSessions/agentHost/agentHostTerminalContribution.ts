/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from '../../../../../../base/common/platform.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { AgentHostCustomTerminalToolEnabledSettingId, CopilotCliConfigKey } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../../../../../../workbench/contrib/terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { AgentHostRootConfigForwarder, type IForwardedRootConfigKey } from './agentHostRootConfigForwarder.js';

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
 * {@link IAgentHostTerminalService} so they appear in the terminal dropdown,
 * and forwards the terminal-related agent-host root-config keys (the resolved
 * default shell and the custom-terminal-tool toggle) via the shared
 * {@link AgentHostRootConfigForwarder} (also used by
 * `AgentHostCopilotCliSettingsContribution`).
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());
	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _forwarder: AgentHostRootConfigForwarder;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();

		const keys: readonly IForwardedRootConfigKey[] = [
			{
				key: AgentHostConfigKey.DefaultShell,
				computeValue: () => this._resolveDefaultShell(),
				registerTriggers: (store, push) => {
					store.add(this._configurationService.onDidChangeConfiguration(e => {
						if (AGENT_HOST_SHELL_DEPENDENT_SETTINGS.some(s => e.affectsConfiguration(s))) {
							push();
						}
					}));
					store.add(this._terminalProfileService.onDidChangeAvailableProfiles(() => push()));
				},
			},
			{
				key: CopilotCliConfigKey.EnableCustomTerminalTool,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostCustomTerminalToolEnabledSettingId) === true,
				registerTriggers: (store, push) => {
					store.add(this._configurationService.onDidChangeConfiguration(e => {
						if (e.affectsConfiguration(AgentHostCustomTerminalToolEnabledSettingId)) {
							push();
						}
					}));
				},
			},
			{
				// Mirror the connected GitHub Enterprise host to the agent host so its
				// GitHub resources / CAPI calls target the enterprise instance. Sourced
				// from the account service — the authoritative "am I signed in to GHE"
				// state — rather than reading the setting directly. Push `''` (not
				// `undefined`) for github.com: the push pipeline skips `undefined`,
				// which would strand a stale host on the agent host.
				key: AgentHostConfigKey.GithubEnterpriseUri,
				computeValue: () => {
					const provider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
					// `resolveGitHubUrl('')` yields the GitHub Enterprise base (e.g.
					// `https://acme.ghe.com/`) when signed in via a GHE provider.
					return provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('').replace(/\/+$/, '') : '';
				},
				registerTriggers: (store, push) => {
					store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => push()));
				},
			},
		];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, this._agentHostService));

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
				// The forwarder registers its own agent-host-start listener to re-push
				// keys; this one keeps the terminal dropdown entry alive across restarts.
				store.add(this._agentHostService.onAgentHostStart(() => this._registerLocalEntry()));
				this._conditionalListeners.value = store;
				this._registerLocalEntry();
				this._forwarder.start();
			}
		} else {
			this._conditionalListeners.value = undefined;
			this._localEntry.value = undefined;
			this._forwarder.stop();
		}
	}

	private _registerLocalEntry(): void {
		if (!this._localEntry.value) {
			this._localEntry.value = this._agentHostTerminalService.registerEntry({
				name: localize('agentHostTerminal.local', "Local"),
				address: '__local__',
				getConnection: () => this._agentHostService,
			});
		}
	}

	/**
	 * Resolve the agent host terminal profile (with `defaultProfile.<os>`
	 * fallback) so its host-managed shells inherit the user's preferred terminal
	 * binary. Returns `undefined` when no usable path can be resolved.
	 */
	private async _resolveDefaultShell(): Promise<string | undefined> {
		let profile;
		try {
			profile = await this._terminalProfileResolverService.getDefaultProfile({
				remoteAuthority: undefined,
				os: OS,
				allowAgentHostShell: true,
			});
		} catch {
			return undefined;
		}
		return profile.path || undefined;
	}
}
