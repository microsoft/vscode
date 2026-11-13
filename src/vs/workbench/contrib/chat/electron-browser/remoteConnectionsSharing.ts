/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { getConnectionDiagnosticError } from '../../../../platform/agentHost/common/connectionDiagnostics.js';
import { ConnectionTelemetryErrorClassification, getConnectionTelemetryError, IConnectionTelemetryError, toConnectionTelemetryError } from '../../../../platform/agentHost/common/connectionTelemetry.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, GitHubEnvironmentSharingError, GitHubEnvironmentSharingFailureReason, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileSystemProviderErrorCode } from '../../../../platform/files/common/files.js';
import { INotificationService, NotificationMessage } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
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

/** Where the connection method is chosen: the Agents window title bar, the chat input, or the Remote Environments editor. */
export type RemoteConnectionsSource = 'titleBar' | 'chatInput' | 'remotesEditor';

/**
 * Why a choice did not change sharing as requested: `canceled` when sign-in was canceled, the failed step
 * (`settingsUpdate`, `stopDevTunnel`, `devTunnel`), why GitHub environment sharing could not be enabled, or `unknown`.
 */
export type RemoteConnectionsFailureReason = GitHubEnvironmentSharingFailureReason | 'canceled' | 'settingsUpdate' | 'stopDevTunnel' | 'devTunnel' | 'unknown';

/** Describes a reported failure with structured error metadata only, never with error messages. */
export interface IRemoteConnectionsToggleFailure extends IConnectionTelemetryError {
	readonly failureReason: RemoteConnectionsFailureReason;
	readonly fileErrorCode?: FileSystemProviderErrorCode;
}

/** The outcome of toggling sharing: `canceled` when sign-in was canceled, a failure when an error was reported, otherwise `completed`. */
export type RemoteConnectionsToggleResult = 'completed' | 'canceled' | IRemoteConnectionsToggleFailure;

export function getRemoteConnectionsToggleFailure(error: unknown, fallbackReason: RemoteConnectionsFailureReason): IRemoteConnectionsToggleFailure {
	if (error instanceof GitHubEnvironmentSharingError) {
		return {
			failureReason: error.reason,
			...getConnectionTelemetryError(error.diagnostic),
			...(error.fileErrorCode === undefined ? {} : { fileErrorCode: error.fileErrorCode }),
		};
	}
	return { failureReason: fallbackReason, ...getConnectionTelemetryError(getConnectionDiagnosticError(error)) };
}

const remoteConnectionsFailureReasons: Record<RemoteConnectionsFailureReason, true> = {
	unavailable: true, nonGitHubAccount: true, accountUnavailable: true, signInRequired: true, multipleAccounts: true, accountMismatch: true, signInFailed: true,
	fileSystemRoot: true, projectFolder: true, ownerMismatch: true, connection: true, canceled: true, settingsUpdate: true, stopDevTunnel: true, devTunnel: true, unknown: true,
};
const fileSystemProviderErrorCodes = new Set<unknown>(Object.values(FileSystemProviderErrorCode));

function isRemoteConnectionsFailureReason(value: unknown): value is RemoteConnectionsFailureReason {
	return typeof value === 'string' && Object.hasOwn(remoteConnectionsFailureReasons, value);
}

function isFileSystemProviderErrorCode(value: unknown): value is FileSystemProviderErrorCode {
	return fileSystemProviderErrorCodes.has(value);
}

/** Copies only allowlisted values from a failed toggle result, so telemetry never receives anything else the command returned. */
function toRemoteConnectionsToggleFailure(result: unknown): IRemoteConnectionsToggleFailure | undefined {
	if (typeof result !== 'object' || result === null) {
		return undefined;
	}
	const failure: { readonly failureReason?: unknown; readonly fileErrorCode?: unknown; readonly errorCategory?: unknown; readonly errorCode?: unknown; readonly statusCode?: unknown } = result;
	if (failure.failureReason === undefined) {
		return undefined;
	}
	return {
		failureReason: isRemoteConnectionsFailureReason(failure.failureReason) ? failure.failureReason : 'unknown',
		...toConnectionTelemetryError(failure),
		...(isFileSystemProviderErrorCode(failure.fileErrorCode) ? { fileErrorCode: failure.fileErrorCode } : {}),
	};
}

type RemoteConnectionsSelectionResult = 'applied' | 'unchanged' | 'unavailable' | 'disabled' | 'failed';

interface IRemoteConnectionsSelectionOutcome {
	readonly result: RemoteConnectionsSelectionResult;
	readonly failure?: IRemoteConnectionsToggleFailure;
}

type RemoteConnectionsSelectMethodEvent = IConnectionTelemetryError & {
	source: RemoteConnectionsSource;
	method: RemoteConnectionsMethod;
	previousMethod: RemoteConnectionsMethod;
	activeMethod: RemoteConnectionsMethod;
	result: RemoteConnectionsSelectionResult;
	gitHubEnvironments: GitHubEnvironmentsAvailability;
	failureReason?: RemoteConnectionsFailureReason;
	fileErrorCode?: FileSystemProviderErrorCode;
};

type RemoteConnectionsSelectMethodClassification = ConnectionTelemetryErrorClassification & {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the method was chosen: titleBar (Agents window), chatInput, or remotesEditor (This Computer section).' };
	method: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chosen connection method: off, devTunnel, or githubEnvironment.' };
	previousMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The connection method sharing or starting to share this computer before the choice, or off.' };
	activeMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The connection method sharing or starting to share this computer after the choice was applied, or off, e.g. when sign-in was canceled or failed.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the choice was applied, already in effect, unavailable, disabled by settings or policy, or failed with an error.' };
	gitHubEnvironments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether GitHub Environments could be chosen when the method was chosen: enabled, policyDisabled, or unavailable.' };
	failureReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted reason when the choice failed, e.g. signInRequired, fileSystemRoot, connection, settingsUpdate, or unknown; canceled when sign-in was canceled. Never error text.' };
	fileErrorCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted file system error code, e.g. NoPermissions or Unknown, when a file system root or project folder to share could not be read.' };
	owner: 'chrmarti';
	comment: 'Tracks how users choose how this computer is shared for remote connections, whether sharing is on afterwards, and why choices failed, to compare the entry points.';
};

export function getOffDetail(): string {
	return localize('remoteConnections.off.detail', "Don't allow connections from other devices through this app.");
}

export function getDevTunnelsDetail(): string {
	return localize('remoteConnections.devTunnel.detail', "Use agents and folders on this computer from VS Code or vscode.dev/agents. For full-editor access, use Remote Tunnels.");
}

export function getGitHubEnvironmentsDetail(availability: GitHubEnvironmentsAvailability): string {
	return availability === 'policyDisabled'
		? localize('remoteConnections.githubEnvironment.policyDisabled', "Disabled by your organization. Contact your administrator to enable GitHub Environments.")
		: localize('remoteConnections.githubEnvironment.detail', "Continue agent sessions across supported Copilot apps, VS Code, and vscode.dev/agents. Agents use folders and tools on this computer; features vary by app.");
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

	async select(method: RemoteConnectionsMethod, apply: () => Promise<void>): Promise<void> {
		const selection = ++this._latest;
		this._unresolved++;
		this._pendingMethod.set(method, undefined);
		try {
			await this._sequencer.queue(async () => {
				if (selection === this._latest) {
					await apply();
				}
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

	/**
	 * Applies the chosen method once the choices made before it in this window have been applied, unless a later choice
	 * supersedes it while it waits. A superseded choice is not applied and not logged.
	 */
	selectMethod(method: RemoteConnectionsMethod): Promise<void> {
		return this._selections.select(method, () => this._applySelection(method));
	}

	private async _applySelection(method: RemoteConnectionsMethod): Promise<void> {
		const previousMethod = await this._readActiveMethod();
		const gitHubEnvironments = this.gitHubEnvironmentsAvailability;
		let outcome: IRemoteConnectionsSelectionOutcome;
		try {
			outcome = await this._applyMethod(method, previousMethod !== 'off');
		} catch (error) {
			outcome = { result: 'failed', failure: getRemoteConnectionsToggleFailure(error, 'unknown') };
			this._notificationService.error(error);
		}
		const activeMethod = await this._readActiveMethod();
		// Logged in every arm of the This Computer experiment, so sharing changes can be compared across them.
		this._telemetryService.publicLog2<RemoteConnectionsSelectMethodEvent, RemoteConnectionsSelectMethodClassification>('remoteConnections.selectMethod', {
			source: this._source,
			method,
			previousMethod,
			activeMethod,
			result: outcome.result,
			gitHubEnvironments,
			...outcome.failure,
		});
	}

	/**
	 * Reads the {@link activeMethod} from the sharing services: the state source can lag behind a choice applied just
	 * before, and a toolbar can replace its view item, and with it the state source, while a choice waits or is applied.
	 */
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

	private async _applyMethod(method: RemoteConnectionsMethod, enabled: boolean): Promise<IRemoteConnectionsSelectionOutcome> {
		if (method === 'githubEnvironment' && !this._availabilityService.available.get()) {
			this._notificationService.error(new Error(localize('remoteConnections.githubEnvironment.unavailable', "GitHub Environments are currently unavailable.")));
			return { result: 'unavailable' };
		}
		if (method === 'githubEnvironment' && this._configurationService.getValue<boolean>(GitHubEnvironmentsEnabledSettingId) !== true) {
			this._notificationService.error(new Error(localize('remoteConnections.githubEnvironment.disabled', "GitHub Environments are disabled by your settings or your organization.")));
			return { result: 'disabled' };
		}
		if (method === 'off') {
			return enabled ? this._toggleSharing() : { result: 'unchanged' };
		}
		if (this.usesGitHubEnvironment !== isGitHubEnvironmentBackend(method)) {
			try {
				await this._configurationService.updateValue(AgentHostRemoteConnectionsSettingId, method, ConfigurationTarget.USER);
			} catch (error) {
				return this._fail(error, 'settingsUpdate');
			}
			try {
				await this._remoteTunnelService.stopTunnel();
			} catch (error) {
				return this._fail(error, 'stopDevTunnel');
			}
		} else if (enabled) {
			return { result: 'unchanged' };
		}
		return this._toggleSharing();
	}

	private async _toggleSharing(): Promise<IRemoteConnectionsSelectionOutcome> {
		const usesGitHubEnvironment = this.usesGitHubEnvironment;
		let toggleResult: unknown;
		try {
			toggleResult = await this._toggle();
		} catch (error) {
			return this._fail(error, usesGitHubEnvironment ? 'unknown' : 'devTunnel');
		}
		if (toggleResult === 'canceled') {
			return { result: 'applied', failure: { failureReason: 'canceled' } };
		}
		const failure = toRemoteConnectionsToggleFailure(toggleResult);
		return failure ? { result: 'failed', failure } : { result: 'applied' };
	}

	private _fail(error: NotificationMessage, reason: RemoteConnectionsFailureReason): IRemoteConnectionsSelectionOutcome {
		this._notificationService.error(error);
		return { result: 'failed', failure: getRemoteConnectionsToggleFailure(error, reason) };
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
