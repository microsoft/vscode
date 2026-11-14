/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { delimiter, isAbsolute } from '../../../../../../base/common/path.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { AgentHostCustomTerminalToolEnabledSettingId, CopilotCliConfigKey } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { EnvironmentVariableMutatorType, type IEnvironmentVariableMutator } from '../../../../../../platform/terminal/common/environmentVariable.js';
import { IEnvironmentVariableService } from '../../../../../../workbench/contrib/terminal/common/environmentVariable.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../../../../../../workbench/contrib/terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
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
 * Gated on Agent Host runtime availability.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());
	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _forwarder: AgentHostRootConfigForwarder;
	private readonly _isRemoteWindow: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		const defaultShellKey: IForwardedRootConfigKey = {
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
		};
		const keys: readonly IForwardedRootConfigKey[] = [
			...(environmentService.remoteAuthority ? [] : [defaultShellKey]),
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
				key: AgentHostConfigKey.GithubEnterpriseUri,
				computeValue: async () => {
					// Account initialization must not reset another window's shared enterprise endpoint.
					await this._defaultAccountService.getDefaultAccount();
					const provider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
					return provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('')?.replace(/\/+$/, '') : '';
				},
				registerTriggers: (store, push) => {
					store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => push()));
				},
			},
		];
		this._forwarder = this._register(new AgentHostRootConfigForwarder(keys, this._agentHostService));
		this._isRemoteWindow = !!environmentService.remoteAuthority;

		this._register(autorun(reader => this._updateEnabled(this._agentHostEnablementService.enabled.read(reader))));
	}

	private _updateEnabled(enabled: boolean): void {
		if (enabled) {
			if (!this._conditionalListeners.value) {
				const store = new DisposableStore();
				// The forwarder registers its own agent-host-start listener to re-push
				// keys; this one keeps the terminal dropdown entry alive across restarts.
				store.add(this._agentHostService.onAgentHostStart(() => this._registerLocalEntry()));
				if (!this._isRemoteWindow) {
					// The connection re-sends the latest value after (re)connecting.
					store.add(this._environmentVariableService.onDidChangeCollections(() => this._contributeAgentTerminalPath()));
					this._contributeAgentTerminalPath();
				}
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
				name: localize('agentHostTerminal.local', "This Computer"),
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

	/**
	 * Collects the global `PATH` prepend/append mutators of local extensions
	 * that opted into agent terminals (`terminalAgentEnvironment` proposal),
	 * as absolute directories in the order terminals would apply them.
	 *
	 * Each extension's collection is filtered before combining, so another
	 * extension replacing `PATH` (which agent terminals ignore) cannot hide
	 * opted-in entries.
	 */
	private _contributeAgentTerminalPath(): void {
		const eligible: IEnvironmentVariableMutator[] = [];
		for (const collection of this._environmentVariableService.collections.values()) {
			// Only the local extension host's directories exist on the agent host's machine.
			if (collection.remoteAuthority !== null) {
				continue;
			}
			for (const mutator of collection.map.values()) {
				const isPath = OS === OperatingSystem.Windows ? mutator.variable.toUpperCase() === 'PATH' : mutator.variable === 'PATH';
				const isPathEdit = mutator.type === EnvironmentVariableMutatorType.Prepend || mutator.type === EnvironmentVariableMutatorType.Append;
				if (isPath && isPathEdit && !mutator.scope?.workspaceFolder && mutator.options?.applyToAgentTerminals) {
					eligible.push(mutator);
				}
			}
		}
		// Terminals apply mutators in reverse contribution order (see MergedEnvironmentVariableCollection).
		let prepend: string[] = [];
		let append: string[] = [];
		for (const mutator of eligible.reverse()) {
			const directories = mutator.value.split(delimiter).filter(directory => directory && isAbsolute(directory));
			if (mutator.type === EnvironmentVariableMutatorType.Prepend) {
				prepend = [...directories, ...prepend];
			} else {
				append = [...append, ...directories];
			}
		}
		this._agentHostService.setAgentTerminalPath?.({ prepend, append });
	}
}
