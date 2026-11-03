/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { promptToRenameRemoteTunnel } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

export const TUNNEL_ACCESS_DOCS_URL = 'https://aka.ms/vscode-agent-tunnel-access';

export interface IRemoteTunnelAccessState {
	readonly isSharing: boolean;
	readonly isConnecting: boolean;
	readonly tunnelName: string | undefined;
}

export function getRemoteTunnelAccessState(mode: TunnelMode, status: TunnelStatus): IRemoteTunnelAccessState {
	return {
		isSharing: status.type === 'connected',
		isConnecting: status.type === 'connecting' || (mode.active && status.type === 'uninitialized'),
		tunnelName: status.type === 'connected' ? status.info.tunnelName : undefined,
	};
}

/** How this computer is shared for remote connections. */
export type RemoteConnectionsMethod = 'off' | 'devTunnel' | 'githubEnvironment';

/** Whether GitHub Environments can be chosen, is shown disabled by organization policy, or is not offered. */
export type GitHubEnvironmentsAvailability = 'enabled' | 'policyDisabled' | 'unavailable';

export function getOffDetail(): string {
	return localize('remoteConnections.off.detail', "Only accessible from this machine.");
}

export function getDevTunnelsDetail(): string {
	return localize('remoteConnections.devTunnel.detail', "Access workspaces and agents on this machine from VS Code or vscode.dev/agents.");
}

export function getGitHubEnvironmentsDetail(availability: GitHubEnvironmentsAvailability): string {
	return availability === 'policyDisabled'
		? localize('remoteConnections.githubEnvironment.policyDisabled', "Disabled by your organization. Contact your administrator to enable GitHub Environments.")
		: localize('remoteConnections.githubEnvironment.detail', "Access agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot.");
}

export interface IRemoteConnectionsStateSource {
	readonly onDidChangeState: Event<void>;
	getState(): IRemoteTunnelAccessState;
}

/**
 * Tracks whether this application shares this computer through its configured connection method.
 */
export class RemoteConnectionsState extends Disposable implements IRemoteConnectionsStateSource {

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	readonly onDidChangeState = this._onDidChangeState.event;
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	private _status: TunnelStatus = { type: 'uninitialized' };
	private _hasReceivedMode = false;
	private _hasReceivedStatus = false;

	constructor(
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMissionControlSharingService private readonly _missionControlSharingService: IMissionControlSharingService,
	) {
		super();

		this._register(autorun(reader => {
			this._missionControlSharingService.state.read(reader);
			this._onDidChangeState.fire();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				this._onDidChangeState.fire();
			}
		}));
		this._register(this._remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedStatus = true;
			this._status = status;
			this._onDidChangeState.fire();
		}));
		this._register(this._remoteTunnelService.onDidChangeMode(mode => {
			this._hasReceivedMode = true;
			this._mode = mode;
			this._onDidChangeState.fire();
		}));
		void this._loadState();
	}

	get usesGitHubEnvironment(): boolean {
		return isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	getState(): IRemoteTunnelAccessState {
		if (this.usesGitHubEnvironment) {
			const state = this._missionControlSharingService.state.get();
			return { isSharing: state === 'enabled', isConnecting: state === 'connecting', tunnelName: undefined };
		}
		return getRemoteTunnelAccessState(this._mode, this._status);
	}

	private async _loadState(): Promise<void> {
		const [mode, status] = await Promise.all([
			this._remoteTunnelService.getMode(),
			this._remoteTunnelService.getTunnelStatus(),
		]);
		if (this._store.isDisposed) {
			return;
		}
		if (!this._hasReceivedMode) {
			this._mode = mode;
		}
		if (!this._hasReceivedStatus) {
			this._status = status;
		}
		this._onDidChangeState.fire();
	}
}

/**
 * Chooses how this computer is shared and names it for other clients. Shared by the
 * Remote Connections menu and the Remote Environments editor.
 */
export class RemoteConnectionsSharing extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when the sharing state, the connection method, its availability, or this computer's sharing names change. */
	readonly onDidChange = this._onDidChange.event;
	private _environmentName: string | undefined;
	private _tunnelName: string | undefined;
	private _namesLoaded = false;
	private _nameRequest = 0;

	constructor(
		private readonly _state: IRemoteConnectionsStateSource,
		private readonly _toggle: () => Promise<unknown>,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IMissionControlSharingService private readonly _missionControlSharingService: IMissionControlSharingService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IMissionControlAvailabilityService private readonly _availabilityService: IMissionControlAvailabilityService,
	) {
		super();

		this._register(this._state.onDidChangeState(() => this._onDidChange.fire()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIGURATION_KEY_HOST_NAME)) {
				void this._loadNames();
			} else if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId) || e.affectsConfiguration(GitHubEnvironmentsEnabledSettingId)) {
				this._onDidChange.fire();
			}
		}));
		this._register(autorun(reader => {
			this._availabilityService.available.read(reader);
			this._onDidChange.fire();
		}));
		this._register(autorun(reader => {
			this._missionControlSharingService.environmentName.read(reader);
			void this._loadNames();
		}));
	}

	get usesGitHubEnvironment(): boolean {
		return isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	getState(): IRemoteTunnelAccessState {
		return this._state.getState();
	}

	/** The method that is sharing or starting to share this computer, or `off`. */
	get activeMethod(): RemoteConnectionsMethod {
		const state = this.getState();
		return !state.isSharing && !state.isConnecting ? 'off' : this.usesGitHubEnvironment ? 'githubEnvironment' : 'devTunnel';
	}

	/** The name other clients see for this computer with the configured connection method. */
	get name(): string | undefined {
		return this.usesGitHubEnvironment ? this._environmentName : this.getState().tunnelName ?? this._tunnelName;
	}

	get namesLoaded(): boolean {
		return this._namesLoaded;
	}

	get gitHubEnvironmentsAvailability(): GitHubEnvironmentsAvailability {
		if (!this._availabilityService.available.get()) {
			return 'unavailable';
		}
		if (this._configurationService.inspect<boolean>(GitHubEnvironmentsEnabledSettingId).policyValue === false) {
			return 'policyDisabled';
		}
		return this._configurationService.getValue<boolean>(GitHubEnvironmentsEnabledSettingId) === true ? 'enabled' : 'unavailable';
	}

	async selectMethod(method: RemoteConnectionsMethod): Promise<void> {
		const state = this.getState();
		const enabled = state.isSharing || state.isConnecting;
		try {
			if (method === 'githubEnvironment' && !this._availabilityService.available.get()) {
				throw new Error(localize('remoteConnections.githubEnvironment.unavailable', "GitHub Environments are currently unavailable."));
			}
			if (method === 'githubEnvironment' && this._configurationService.getValue<boolean>(GitHubEnvironmentsEnabledSettingId) !== true) {
				throw new Error(localize('remoteConnections.githubEnvironment.disabled', "GitHub Environments are disabled by your settings or your organization."));
			}
			if (method === 'off') {
				if (enabled) {
					await this._toggle();
				}
				return;
			}
			if (this.usesGitHubEnvironment !== isGitHubEnvironmentBackend(method)) {
				await this._configurationService.updateValue(AgentHostRemoteConnectionsSettingId, method, ConfigurationTarget.USER);
				await this._remoteTunnelService.stopTunnel();
			} else if (enabled) {
				return;
			}
			await this._toggle();
		} catch (error) {
			this._notificationService.error(error);
		}
	}

	async rename(): Promise<void> {
		const currentName = this.name;
		if (!currentName || this.getState().isConnecting) {
			return;
		}
		try {
			if (this.usesGitHubEnvironment) {
				const name = await this._quickInputService.input({
					title: localize('remoteConnections.rename', "Rename Remote Environment"),
					prompt: localize('remoteConnections.renamePrompt', "Enter the name shown for this environment on other clients."),
					value: currentName,
					validateInput: async value => !value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value)
						? localize('remoteConnections.invalidName', "Enter an environment name without control characters.")
						: undefined,
				});
				if (name !== undefined && name.trim() !== currentName && !this._store.isDisposed && this.usesGitHubEnvironment) {
					await this._missionControlSharingService.setEnvironmentName(name);
				}
			} else {
				await promptToRenameRemoteTunnel(this._quickInputService, this._configurationService, currentName);
			}
			await this._loadNames();
		} catch (error) {
			this._notificationService.error(error);
		}
	}

	private async _loadNames(): Promise<void> {
		const request = ++this._nameRequest;
		try {
			const [environmentName, tunnelName] = await Promise.all([
				this._agentHostService.getMissionControlEnvironmentName?.(),
				this._remoteTunnelService.getTunnelName(),
			]);
			if (!this._store.isDisposed && request === this._nameRequest) {
				this._environmentName = this._missionControlSharingService.environmentName.get() ?? environmentName;
				this._tunnelName = tunnelName;
				this._namesLoaded = true;
				this._onDidChange.fire();
			}
		} catch (error) {
			if (!this._store.isDisposed && request === this._nameRequest) {
				this._namesLoaded = true;
				this._onDidChange.fire();
				this._notificationService.error(error);
			}
		}
	}
}
