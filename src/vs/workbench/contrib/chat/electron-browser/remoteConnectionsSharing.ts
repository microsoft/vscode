/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { promptToRenameRemoteTunnel, validateRemoteTunnelName } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

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

export function validateSharingName(method: Exclude<RemoteConnectionsMethod, 'off'>, name: string): string | undefined {
	if (!name.trim()) {
		return localize('remoteConnections.nameRequired', "Enter a sharing name.");
	}
	if (/[\r\n\x00-\x1f\x7f]/.test(name)) {
		return localize('remoteConnections.invalidName', "Enter a sharing name without control characters.");
	}
	return method === 'devTunnel' ? validateRemoteTunnelName(name) : undefined;
}

/** Whether GitHub Environments can be chosen, is shown disabled by organization policy, or is not offered. */
export type GitHubEnvironmentsAvailability = 'enabled' | 'policyDisabled' | 'unavailable';

/** Where the connection method is chosen: the Agents window title bar, the chat input, or the Remote Environments editor. */
export type RemoteConnectionsSource = 'titleBar' | 'chatInput' | 'remotesEditor';

/** The outcome of toggling sharing: `failed` when an error was reported, otherwise `completed`, even when sharing stays off, e.g. because sign-in was canceled. */
export type RemoteConnectionsToggleResult = 'completed' | 'failed';

type RemoteConnectionsSelectionResult = 'applied' | 'unchanged' | 'unavailable' | 'disabled' | 'failed';

type RemoteConnectionsSelectMethodEvent = {
	source: RemoteConnectionsSource;
	method: RemoteConnectionsMethod;
	previousMethod: RemoteConnectionsMethod;
	activeMethod: RemoteConnectionsMethod;
	result: RemoteConnectionsSelectionResult;
	gitHubEnvironments: GitHubEnvironmentsAvailability;
};

type RemoteConnectionsSelectMethodClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the method was chosen: titleBar (Agents window), chatInput, or remotesEditor (This Computer section).' };
	method: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chosen connection method: off, devTunnel, or githubEnvironment.' };
	previousMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The connection method sharing or starting to share this computer before the choice, or off.' };
	activeMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The connection method sharing or starting to share this computer after the choice was applied, or off, e.g. when sign-in was canceled or failed.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the choice was applied, already in effect, unavailable, disabled by settings or policy, or failed with an error.' };
	gitHubEnvironments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether GitHub Environments could be chosen when the method was chosen: enabled, policyDisabled, or unavailable.' };
	owner: 'chrmarti';
	comment: 'Tracks how users choose how this computer is shared for remote connections and whether sharing is on afterwards, to compare the entry points.';
};

export const gitHubEnvironmentSharingClients = localize('remoteConnections.githubEnvironment.clients', "Connect from VS Code, the browser-based Agents window, or supported Copilot clients");
export const gitHubEnvironmentSharingDiscovery = localize('remoteConnections.githubEnvironment.discovery', "Make this computer discoverable through your GitHub account");
export const devTunnelSharingClients = localize('remoteConnections.devTunnel.clients', "Connect from VS Code or the browser-based Agents window");

export function getOffDetail(): string {
	return localize('remoteConnections.off.detail', "Other devices can't connect to this computer. Agent tasks keep running here.");
}

export function getDevTunnelsDetail(): string {
	return localize('remoteConnections.devTunnel.detail', "{0}.", devTunnelSharingClients);
}

export function getGitHubEnvironmentsDetail(availability: GitHubEnvironmentsAvailability): string {
	return availability === 'policyDisabled'
		? localize('remoteConnections.githubEnvironment.policyDisabled', "Sharing through GitHub Environments is disabled by your organization. Contact your administrator to enable it.")
		: localize('remoteConnections.githubEnvironment.detail', "{0}. {1}.", gitHubEnvironmentSharingClients, gitHubEnvironmentSharingDiscovery);
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
 * Applies the connection methods chosen in a window one at a time, so each choice acts on the state the
 * previous one left rather than a transitional one, and skips choices superseded while they waited, so
 * the last choice wins.
 */
class RemoteConnectionsSelections {

	private readonly _sequencer = new Sequencer();
	private _latest = 0;
	private _unresolved = 0;
	private readonly _pendingMethod = observableValue<RemoteConnectionsMethod | undefined>(this, undefined);
	/** The method chosen last while choices are being applied, otherwise `undefined`. */
	readonly pendingMethod: IObservable<RemoteConnectionsMethod | undefined> = this._pendingMethod;

	async select(method: RemoteConnectionsMethod, apply: () => Promise<string | undefined>): Promise<string | undefined> {
		const selection = ++this._latest;
		this._unresolved++;
		this._pendingMethod.set(method, undefined);
		try {
			return await this._sequencer.queue(async () => {
				if (selection === this._latest) {
					return apply();
				}
				return undefined;
			});
		} finally {
			if (--this._unresolved === 0) {
				this._pendingMethod.set(undefined, undefined);
			}
		}
	}
}

// Keyed by a window-scoped service, so the Remote Connections menus and the Remote Environments editor of a window share one.
const selectionsByWindow = new WeakMap<IRemoteTunnelService, RemoteConnectionsSelections>();

function getSelections(remoteTunnelService: IRemoteTunnelService): RemoteConnectionsSelections {
	let selections = selectionsByWindow.get(remoteTunnelService);
	if (!selections) {
		selections = new RemoteConnectionsSelections();
		selectionsByWindow.set(remoteTunnelService, selections);
	}
	return selections;
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
	private readonly _selections: RemoteConnectionsSelections;

	/**
	 * @param _toggle Toggles sharing with the configured connection method and resolves to its {@link RemoteConnectionsToggleResult}.
	 */
	constructor(
		private readonly _state: IRemoteConnectionsStateSource,
		private readonly _toggle: () => Promise<unknown>,
		private readonly _source: RemoteConnectionsSource,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IMissionControlSharingService private readonly _missionControlSharingService: IMissionControlSharingService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IMissionControlAvailabilityService private readonly _availabilityService: IMissionControlAvailabilityService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._selections = getSelections(this._remoteTunnelService);
		this._register(autorun(reader => {
			this._selections.pendingMethod.read(reader);
			this._onDidChange.fire();
		}));
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

	/** The method chosen last in this window while choices are being applied, so it can be shown instead of the transitional {@link activeMethod}. */
	get pendingMethod(): RemoteConnectionsMethod | undefined {
		return this._selections.pendingMethod.get();
	}

	/** The name other clients see for this computer with the configured connection method. */
	get name(): string | undefined {
		return this.usesGitHubEnvironment ? this._environmentName : this.getState().tunnelName ?? this._tunnelName;
	}

	getNameForMethod(method: Exclude<RemoteConnectionsMethod, 'off'>): string | undefined {
		return method === 'githubEnvironment' ? this._environmentName : this._tunnelName;
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

	/** Applies choices in order, skipping superseded choices that haven't started. */
	selectMethod(method: RemoteConnectionsMethod, name?: string): Promise<string | undefined> {
		return this._selections.select(method, () => this._applySelection(method, name));
	}

	private async _applySelection(method: RemoteConnectionsMethod, name?: string): Promise<string | undefined> {
		const previousMethod = await this._readActiveMethod();
		const gitHubEnvironments = this.gitHubEnvironmentsAvailability;
		let result: RemoteConnectionsSelectionResult;
		let errorMessage: string | undefined;
		try {
			result = await this._applyMethod(method, previousMethod !== 'off', name);
		} catch (error) {
			result = 'failed';
			this._notificationService.error(error);
			errorMessage = toErrorMessage(error);
		}
		const activeMethod = await this._readActiveMethod();
		// Logged in every arm of the This Computer experiment, so sharing changes can be compared across them.
		this._telemetryService.publicLog2<RemoteConnectionsSelectMethodEvent, RemoteConnectionsSelectMethodClassification>('remoteConnections.selectMethod', {
			source: this._source,
			method,
			previousMethod,
			activeMethod,
			result,
			gitHubEnvironments,
		});
		return errorMessage ?? (result === 'failed' || result === 'disabled' || result === 'unavailable'
			? localize('remoteConnections.setupFailed', "Couldn't change sharing. Check your settings and try again.") : undefined);
	}

	/** Reads sharing services directly because the state source can lag or be replaced while a choice waits. */
	private async _readActiveMethod(): Promise<RemoteConnectionsMethod> {
		if (this.usesGitHubEnvironment) {
			return this._missionControlSharingService.state.get() === 'disabled' ? 'off' : 'githubEnvironment';
		}
		try {
			const [mode, status] = await Promise.all([
				this._remoteTunnelService.getMode(),
				this._remoteTunnelService.getTunnelStatus(),
			]);
			const state = getRemoteTunnelAccessState(mode, status);
			return state.isSharing || state.isConnecting ? 'devTunnel' : 'off';
		} catch {
			return this.activeMethod;
		}
	}

	private async _applyMethod(method: RemoteConnectionsMethod, enabled: boolean, name?: string): Promise<RemoteConnectionsSelectionResult> {
		if (method === 'githubEnvironment' && !this._availabilityService.available.get()) {
			this._notificationService.error(new Error(localize('remoteConnections.githubEnvironment.unavailable', "GitHub Environments are currently unavailable.")));
			return 'unavailable';
		}
		if (method === 'githubEnvironment' && this._configurationService.getValue<boolean>(GitHubEnvironmentsEnabledSettingId) !== true) {
			this._notificationService.error(new Error(localize('remoteConnections.githubEnvironment.disabled', "Sharing through GitHub Environments is disabled by your settings or your organization.")));
			return 'disabled';
		}
		if (method === 'off') {
			return enabled ? this._toggleSharing() : 'unchanged';
		}
		if (name !== undefined) {
			const validation = validateSharingName(method, name);
			if (validation) {
				throw new Error(validation);
			}
			if (method === 'githubEnvironment') {
				await this._missionControlSharingService.setEnvironmentName(name);
			} else {
				await this._configurationService.updateValue(CONFIGURATION_KEY_HOST_NAME, name, ConfigurationTarget.USER);
			}
		}
		if (this.usesGitHubEnvironment !== isGitHubEnvironmentBackend(method)) {
			await this._configurationService.updateValue(AgentHostRemoteConnectionsSettingId, method, ConfigurationTarget.USER);
			await this._remoteTunnelService.stopTunnel();
		} else if (enabled) {
			return 'unchanged';
		}
		return this._toggleSharing();
	}

	private async _toggleSharing(): Promise<RemoteConnectionsSelectionResult> {
		return (await this._toggle()) === 'failed' ? 'failed' : 'applied';
	}

	async rename(): Promise<void> {
		const currentName = this.name;
		if (!currentName || this.getState().isConnecting) {
			return;
		}
		try {
			if (this.usesGitHubEnvironment) {
				const name = await this._quickInputService.input({
					title: localize('remoteConnections.rename', "Change Sharing Name"),
					prompt: localize('remoteConnections.renamePrompt', "Enter the sharing name other devices will see."),
					value: currentName,
					validateInput: async value => validateSharingName('githubEnvironment', value),
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
