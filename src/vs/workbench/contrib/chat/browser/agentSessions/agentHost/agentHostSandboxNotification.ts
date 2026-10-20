/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, equals } from '../../../../../../base/common/arrays.js';
import { getErrorMessage } from '../../../../../../base/common/errors.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { isAgentHostSandboxDisablingBlocked } from '../../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { readAgentSandboxCertificate } from '../../../../../../platform/agentHost/common/meta/agentSandboxCertificate.js';
import { readAgentSandboxDiagnostics, readAgentSandboxLocalNetworkRequired } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { readSessionSandboxPolicy } from '../../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { isSessionConfigWritable, validateChatPickerConfigWrite } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState, StateComponents, type SessionConfigState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { dispatchAgentHostConfigChange, getAgentHostBackendChat, getAgentHostChatConfig, readAgentHostChatSandboxState } from './applyAgentHostSessionConfig.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

type CertificateOperation = 'install' | 'rotate' | 'remove';

const OPEN_SETTINGS_COMMAND = 'workbench.action.openSettings';

export class AgentHostSandboxNotification extends Disposable {
	/** Retains dismissals across chat recreation for the lifetime of the window's notification service. */
	private static readonly _dismissedSessions = new WeakMap<IChatInputNotificationService, ResourceSet>();
	private static readonly _dismissedCertificateScopes = new WeakMap<IChatInputNotificationService, Set<string>>();
	private static readonly _instances = new WeakMap<IChatInputNotificationService, ResourceMap<AgentHostSandboxNotification>>();

	static hasCertificateController(sessionResource: URI, notificationService: IChatInputNotificationService): boolean {
		return this._instances.get(notificationService)?.has(sessionResource) ?? false;
	}

	/** Reuses the live chat's consent flow. Returns false when no live controller is available. */
	static async tryRunCertificateOperation(sessionResource: URI, notificationService: IChatInputNotificationService, operation: CertificateOperation): Promise<boolean> {
		const instance = this._instances.get(notificationService)?.get(sessionResource);
		if (!instance) {
			return false;
		}
		await instance._runCertificateOperation(operation);
		return true;
	}

	private readonly _id: string;
	private readonly _certificateId: string;
	private readonly _dismissedSessions: ResourceSet;
	private readonly _dismissedCertificateScopes: Set<string>;
	private _certificateScope: string | undefined;
	private _certificateInputUri: URI | undefined;
	private _certificateCanInstall = false;
	private _certificateBusy = false;
	private _certificateOperation: CertificateOperation | undefined;
	private readonly _installCommandId = `_chat.installSandboxCertificate.${generateUuid()}`;
	private _reasons: readonly string[] | undefined;
	private _localNetworkMessage: string | undefined;
	private readonly _disableCommandId = `_chat.disableSandboxing.${generateUuid()}`;
	private _canDisable = false;

	constructor(
		private readonly _sessionResource: URI,
		private readonly _subscription: IAgentSubscription<SessionState>,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly _enablementService: IAgentHostEnablementService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
		this._id = `agentHost.sandboxUnsupported.${_sessionResource.toString()}`;
		this._certificateId = `agentHost.sandboxCertificate.${_sessionResource.toString()}`;
		let dismissedSessions = AgentHostSandboxNotification._dismissedSessions.get(this._notificationService);
		if (!dismissedSessions) {
			dismissedSessions = new ResourceSet();
			AgentHostSandboxNotification._dismissedSessions.set(this._notificationService, dismissedSessions);
		}
		this._dismissedSessions = dismissedSessions;
		let dismissedCertificateScopes = AgentHostSandboxNotification._dismissedCertificateScopes.get(this._notificationService);
		if (!dismissedCertificateScopes) {
			dismissedCertificateScopes = new Set();
			AgentHostSandboxNotification._dismissedCertificateScopes.set(this._notificationService, dismissedCertificateScopes);
		}
		this._dismissedCertificateScopes = dismissedCertificateScopes;
		let instances = AgentHostSandboxNotification._instances.get(this._notificationService);
		if (!instances) {
			instances = new ResourceMap();
			AgentHostSandboxNotification._instances.set(this._notificationService, instances);
		}
		instances.set(this._sessionResource, this);
		this._register(toDisposable(() => {
			if (instances.get(this._sessionResource) === this) {
				instances.delete(this._sessionResource);
			}
		}));
		this._register(CommandsRegistry.registerCommand(this._installCommandId, () => this._runCertificateOperation('install')));
		this._register(CommandsRegistry.registerCommand(this._disableCommandId, async () => {
			if (!this._canDisableSandboxing(this._subscription.value)) {
				throw new Error(localize('agentHost.sandboxDisableUnavailable', "Sandboxing cannot be disabled in settings for this session. It may be required by your organization."));
			}
			this._disableSessionSandboxing();
			await this._configurationService.updateValue(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
		}));
		this._register(_subscription.onDidChange(state => this._update(state)));
		this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._updateCertificate(this._subscription.value)));
		this._register(this._chatWidgetService.onDidChangeWidgetVisibility(() => this._updateCertificate(this._subscription.value)));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => this._updateCertificate(this._subscription.value)));
		if (_subscription.onDidError) {
			this._register(_subscription.onDidError(error => this._update(error)));
		}
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled)) {
				this._update(this._subscription.value);
			}
		}));
		this._register(autorun(reader => {
			this._enablementService.managedSandboxEnforced.read(reader);
			this._enablementService.managedSandboxAllowsBypass.read(reader);
			const connection = this._connectionsService.resolveSessionResource(this._sessionResource)?.connection;
			if (connection?.installSandboxCertificate) {
				connection.sandboxCertificateInstallationSupported?.read(reader);
			}
			if (connection?.rotateSandboxCertificate) {
				connection.sandboxCertificateRotationSupported?.read(reader);
			}
			this._update(this._subscription.value);
		}));
	}

	private _disableSessionSandboxing(): void {
		const state = this._subscription.value;
		if (!state || state instanceof Error) {
			throw new Error(localize('agentHost.sandboxSessionUnavailable', "Could not disable sandboxing because the session is unavailable."));
		}
		const { chat, config } = this._readChat(state);
		const value = config?.values[SessionConfigKey.SandboxEnabled] ?? config?.schema.properties[SessionConfigKey.SandboxEnabled]?.default;
		if (value !== AgentSandboxEnabledValue.On && readAgentHostChatSandboxState(state, chat)?.enabled !== true) {
			return;
		}
		const resolution = this._connectionsService.resolveSessionResource(this._sessionResource);
		if (!resolution || !config) {
			throw new Error(localize('agentHost.sandboxSessionConfigUnavailable', "Could not disable sandboxing because the session connection or configuration is unavailable."));
		}
		if (!isSessionConfigWritable(config.schema.properties[SessionConfigKey.SandboxEnabled], false)) {
			throw new Error(localize('agentHost.sandboxSessionReadOnly', "Sandboxing cannot be changed for this session."));
		}
		validateChatPickerConfigWrite(config.schema, config.values, SessionConfigKey.SandboxEnabled, AgentSandboxEnabledValue.Off, false);
		// Turns off this chat's sandboxing, which is its own when the host lets a chat set it.
		dispatchAgentHostConfigChange(resolution.connection, resolution.backendSession, chat, state, { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.Off });
	}

	/** This notification's chat in its session's catalog, and that chat's effective config. */
	private _readChat(state: SessionState): { readonly chat: string | undefined; readonly config: SessionConfigState | undefined } {
		const chat = getAgentHostBackendChat(this._sessionResource, state);
		const connection = this._connectionsService.resolveSessionResource(this._sessionResource)?.connection;
		return { chat, config: getAgentHostChatConfig(state, chat, chat => connection?.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(chat))?.value) };
	}

	private _canDisableSandboxing(state: SessionState | Error | undefined): boolean {
		if (!state || state instanceof Error) {
			return false;
		}
		const policy = readSessionSandboxPolicy(state);
		const connection = this._connectionsService.resolveSessionResource(this._sessionResource)?.connection;
		const useLocalPolicy = !policy && !isWeb && !this._environmentService.remoteAuthority
			&& connection === this._agentHostService;
		const { chat, config } = this._readChat(state);
		const value = config?.values[SessionConfigKey.SandboxEnabled] ?? config?.schema.properties[SessionConfigKey.SandboxEnabled]?.default;
		const confirmedEnabled = readAgentHostChatSandboxState(state, chat)?.enabled;
		return !isAgentHostSandboxDisablingBlocked({
			sessionEnabled: value === AgentSandboxEnabledValue.On ? true : value === AgentSandboxEnabledValue.Off ? false : confirmedEnabled,
			confirmedEnabled,
			managedEnabled: policy ? policy.enabled && !policy.failClosed : useLocalPolicy && this._enablementService.managedSandboxEnforced.get(),
			allowsBypass: policy ? policy.allowBypass === true : useLocalPolicy && this._enablementService.managedSandboxAllowsBypass.get(),
		})
			&& this._configurationService.inspect(AgentSandboxSettingId.AgentSandboxEnabled).policyValue === undefined;
	}

	/** Shows optional certificate guidance only in the focused chat, independently of dependency warnings. */
	private _updateCertificate(state: SessionState | Error | undefined, force = false): void {
		let scope: string | undefined;
		let inputUri: URI | undefined;
		let canInstall = false;
		const widget = this._chatWidgetService.lastFocusedWidget;
		if (state && !(state instanceof Error) && !this._chatEntitlementService.sentiment.hidden
			&& widget?.visible && isEqual(widget.viewModel?.sessionResource, this._sessionResource)) {
			const chat = getAgentHostBackendChat(this._sessionResource, state);
			const certificate = chat !== undefined ? readAgentSandboxCertificate(state, chat) : undefined;
			const resolution = this._connectionsService.resolveSessionResource(this._sessionResource);
			if (certificate && ((certificate.state === 'notInstalled' && certificate.canInstall) || (this._certificateOperation !== undefined && certificate.state === 'installed')) && resolution
				&& readAgentHostChatSandboxState(state, chat)?.enabled !== false) {
				const key = JSON.stringify([resolution.connectionAuthority, certificate.scopeId]);
				if (!this._dismissedCertificateScopes.has(key) || this._certificateBusy) {
					scope = key;
					inputUri = widget.input.inputUri;
					canInstall = !!resolution.connection.installSandboxCertificate
						&& resolution.connection.sandboxCertificateInstallationSupported?.get() === true;
				}
			}
		}
		if (!force && this._certificateScope === scope && isEqual(this._certificateInputUri, inputUri) && this._certificateCanInstall === canInstall) {
			return;
		}
		this._certificateScope = scope;
		this._certificateInputUri = inputUri;
		this._certificateCanInstall = canInstall;
		if (!scope) {
			this._notificationService.deleteNotification(this._certificateId);
			return;
		}
		const description = new MarkdownString('', { isTrusted: { enabledCommands: canInstall && !this._certificateBusy ? [this._installCommandId] : [] } });
		description.appendText(this._certificateOperation === 'remove'
			? localize('agentHost.sandboxCertificateRemovingDetail', "Removing trust from the agent host's operating system trust store. The stored certificate authority is kept.")
			: this._certificateOperation === 'rotate'
				? localize('agentHost.sandboxCertificateRotatingDetail', "Replacing the certificate authority and establishing operating system trust. Running sandboxed tools may need to restart.")
				: localize('agentHost.sandboxCertificateMissingDetail', "Some tools running in this session's sandbox may need a trusted certificate on the agent host."));
		if (canInstall && !this._certificateBusy) {
			description.appendText(' ');
			description.appendLink(createCommandUri(this._installCommandId).toString(), localize('agentHost.installSandboxCertificate', "Install"), localize('agentHost.installSandboxCertificateTooltip', "Install the sandbox certificate on this chat's agent host"));
		}
		this._notificationService.setNotification({
			id: this._certificateId,
			inputUri,
			severity: ChatInputNotificationSeverity.Info,
			message: this._certificateOperation === 'remove'
				? localize('agentHost.sandboxCertificateRemoving', "Removing sandbox certificate trust")
				: this._certificateOperation === 'rotate'
					? localize('agentHost.sandboxCertificateRotating', "Rotating sandbox certificate")
					: this._certificateOperation === 'install'
						? localize('agentHost.sandboxCertificateInstalling', "Installing sandbox certificate")
						: localize('agentHost.sandboxCertificateMissing', "Sandbox trusted CA is not installed"),
			description,
			actions: [],
			...(this._certificateOperation ? { progress: {} } : {}),
			dismissible: true,
			onDismiss: () => {
				this._dismissedCertificateScopes.add(scope);
				this._updateCertificate(this._subscription.value);
			},
			autoDismissOnMessage: false,
			sessionResources: [this._sessionResource],
		});
	}

	/** Confirms the host trust-store change, then revalidates the original chat and runtime before sending it. */
	private async _runCertificateOperation(operation: CertificateOperation): Promise<void> {
		if (this._certificateBusy) {
			return;
		}
		this._certificateBusy = true;
		this._updateCertificate(this._subscription.value, true);
		try {
			const state = this._subscription.value;
			const chat = state && !(state instanceof Error) ? getAgentHostBackendChat(this._sessionResource, state) : undefined;
			const certificate = state && !(state instanceof Error) && chat !== undefined ? readAgentSandboxCertificate(state, chat) : undefined;
			if (operation === 'install' && !this._chatEntitlementService.sentiment.hidden && certificate?.state === 'installed' && !certificate.requiresRotation) {
				await this._dialogService.info(localize('agentHost.sandboxCertificate.alreadyInstalled', "The sandbox certificate is already trusted for this chat."));
				return;
			}
			const target = this._certificateTarget(operation);
			const hostName = this._connectionsService.connections.find(host => host.connection === target.connection)?.name
				?? this._environmentService.remoteAuthority
				?? (target.connection === this._agentHostService ? localize('agentHost.sandboxCertificate.localHost', "This Computer") : target.authority);
			const confirmation = await this._dialogService.confirm({
				type: 'warning',
				message: operation === 'install'
					? localize('agentHost.sandboxCertificate.confirm', "Install the sandbox certificate on {0}?", hostName)
					: operation === 'rotate'
						? localize('agentHost.sandboxCertificate.confirmRotate', "Rotate the sandbox certificate on {0}?", hostName)
						: localize('agentHost.sandboxCertificate.confirmRemove', "Remove sandbox certificate trust on {0}?", hostName),
				detail: operation === 'install'
					? localize('agentHost.sandboxCertificate.confirmDetail', "Adds the sandbox CA to this host's OS trust store, replacing it if needed. Running tools may need to restart.")
					: operation === 'rotate'
						? localize('agentHost.sandboxCertificate.confirmRotateDetail', "Replaces the shared sandbox CA and private key and trusts the new CA. Running tools may need to restart.")
						: localize('agentHost.sandboxCertificate.confirmRemoveDetail', "Removes OS trust for the shared sandbox CA but keeps its certificate and private key. Tools relying on OS trust may stop working."),
				primaryButton: operation === 'install'
					? localize('agentHost.sandboxCertificate.confirmInstall', "&&Install")
					: operation === 'rotate'
						? localize('agentHost.sandboxCertificate.rotate', "&&Rotate")
						: localize('agentHost.sandboxCertificate.remove', "&&Remove"),
			});
			if (!confirmation.confirmed || this._store.isDisposed) {
				return;
			}
			const current = this._certificateTarget(operation);
			if (current.connection !== target.connection || current.chat !== target.chat || current.scopeId !== target.scopeId) {
				throw new Error(localize('agentHost.sandboxCertificate.targetChanged', "The certificate target changed. Review the target and try again."));
			}
			this._certificateOperation = operation;
			this._updateCertificate(this._subscription.value, true);
			await current.run();
			if (operation === 'remove') {
				await this._dialogService.info(localize('agentHost.sandboxCertificate.removed', "The sandbox certificate was removed from OS trust. The stored certificate authority was kept."));
			} else if (operation === 'rotate') {
				await this._dialogService.info(localize('agentHost.sandboxCertificate.rotated', "The sandbox certificate was rotated and trusted. Running sandboxed tools may need to restart."));
			}
		} catch (error) {
			await this._dialogService.error(operation === 'install'
				? localize('agentHost.sandboxCertificate.installFailed', "Could not install the sandbox certificate")
				: operation === 'rotate'
					? localize('agentHost.sandboxCertificate.rotateFailed', "Could not rotate the sandbox certificate")
					: localize('agentHost.sandboxCertificate.removeFailed', "Could not remove sandbox certificate trust"), getErrorMessage(error));
		} finally {
			this._certificateBusy = false;
			this._certificateOperation = undefined;
			if (!this._store.isDisposed) {
				this._updateCertificate(this._subscription.value, true);
			}
		}
	}

	private _certificateTarget(operation: CertificateOperation) {
		const state = this._subscription.value;
		const chat = state && !(state instanceof Error) ? getAgentHostBackendChat(this._sessionResource, state) : undefined;
		const certificate = chat !== undefined && state && !(state instanceof Error) ? readAgentSandboxCertificate(state, chat) : undefined;
		const resolution = this._connectionsService.resolveSessionResource(this._sessionResource);
		const method = operation === 'install' ? 'installSandboxCertificate' : operation === 'rotate' ? 'rotateSandboxCertificate' : 'removeSandboxCertificate';
		const supported = operation === 'install'
			? resolution?.connection.sandboxCertificateInstallationSupported
			: operation === 'rotate'
				? resolution?.connection.sandboxCertificateRotationSupported
				: resolution?.connection.sandboxCertificateRemovalSupported;
		if (!chat || !certificate || (certificate.state !== 'notInstalled' && certificate.state !== 'installed')
			|| this._chatEntitlementService.sentiment.hidden || !resolution?.connection[method]
			|| supported?.get() !== true || !state || state instanceof Error
			|| (operation !== 'remove' && (!certificate.canInstall || readAgentHostChatSandboxState(state, chat)?.enabled === false))
			|| (operation === 'rotate' && certificate.state !== 'installed')) {
			if (operation === 'remove') {
				throw new Error(localize('agentHost.sandboxCertificate.removalUnavailable', "Sandbox certificate removal is no longer available for this chat. Make sure the chat has certificate status and the host supports removal."));
			}
			if (operation === 'rotate') {
				throw new Error(localize('agentHost.sandboxCertificate.rotationUnavailable', "Sandbox certificate rotation is no longer available for this chat. Make sure the certificate is installed and the host supports rotation."));
			}
			throw new Error(localize('agentHost.sandboxCertificate.unavailable', "Sandbox certificate installation is no longer available for this chat."));
		}
		const connection = resolution.connection;
		return {
			connection, chat, scopeId: certificate.scopeId, authority: resolution.connectionAuthority,
			run: () => connection[method]!(chat, certificate.scopeId),
		};
	}
	private _update(state: SessionState | Error | undefined): void {
		this._updateCertificate(state);
		if (this._dismissedSessions.has(this._sessionResource)) {
			return;
		}
		const diagnostics = state && !(state instanceof Error) ? readAgentSandboxDiagnostics(state) : undefined;
		const reasons = diagnostics ? distinct(diagnostics) : undefined;
		const localNetworkLink = new MarkdownString().appendLink(
			createCommandUri(OPEN_SETTINGS_COMMAND, `@id:${AgentSandboxSettingId.AgentSandboxAllowLocalNetwork}`).toString(),
			localize('agentHost.allowLocalNetworkAccess', "Allow"),
		).value;
		const localNetworkMessage = !reasons && state && !(state instanceof Error) && readAgentSandboxLocalNetworkRequired(state)
			? readSessionSandboxPolicy(state)?.allowLocalNetwork === false
				? localize('agentHost.sandboxLocalNetworkManaged', "Your organization disables local network access, which some sandboxing features need. {0}", localNetworkLink)
				: localize('agentHost.sandboxLocalNetworkRequired', "Sandboxing requires access to local network. {0}", localNetworkLink)
			: undefined;
		const canDisable = this._canDisableSandboxing(state);
		if (equals(this._reasons ?? [], reasons ?? []) && this._canDisable === canDisable && this._localNetworkMessage === localNetworkMessage) {
			return;
		}
		this._reasons = reasons;
		this._canDisable = canDisable;
		this._localNetworkMessage = localNetworkMessage;
		if (!reasons && !localNetworkMessage) {
			this._notificationService.deleteNotification(this._id);
			return;
		}
		const description = new MarkdownString('', { isTrusted: { enabledCommands: localNetworkMessage ? [OPEN_SETTINGS_COMMAND] : canDisable ? [this._disableCommandId] : [] } });
		if (localNetworkMessage) {
			description.appendMarkdown(localNetworkMessage);
		} else if (reasons) {
			description.appendText(reasons[0]);
			description.appendText(' ');
			description.appendLink('https://aka.ms/vscode-sandboxing-troubleshoot', localize('agentHost.sandboxTroubleshooting', "Troubleshooting Guide"));
			if (canDisable) {
				description.appendText(' | ');
				description.appendLink(
					createCommandUri(this._disableCommandId).toString(),
					localize('agentHost.disableSandboxing', "Disable Sandboxing"),
					localize('agentHost.disableSandboxingDetail', "Disable sandboxing for this session and in settings. Terminal commands may run without sandbox restrictions. Organization policy still applies."),
				);
			}
		}
		this._notificationService.setNotification({
			id: this._id,
			severity: localNetworkMessage ? ChatInputNotificationSeverity.Info : ChatInputNotificationSeverity.Warning,
			message: localNetworkMessage
				? description
				: localize('agentHost.sandboxMayNotWorkAsExpected', "Sandboxing might not work as expected"),
			description: localNetworkMessage ? undefined : description,
			actions: [],
			dismissible: true,
			onDismiss: () => {
				this._dismissedSessions.add(this._sessionResource);
				this._notificationService.deleteNotification(this._id);
			},
			autoDismissOnMessage: false,
			sessionResources: [this._sessionResource],
		});
	}

	override dispose(): void {
		this._notificationService.deleteNotification(this._certificateId);
		this._notificationService.deleteNotification(this._id);
		super.dispose();
	}
}
