/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, equals } from '../../../../../../base/common/arrays.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { isAgentHostSandboxDisablingBlocked } from '../../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { readAgentSandboxDiagnostics } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { readSessionSandboxPolicy } from '../../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { readSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { isSessionConfigWritable, validateSessionConfigWrite } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

export class AgentHostSandboxNotification extends Disposable {
	/** Retains dismissals across chat recreation for the lifetime of the window's notification service. */
	private static readonly _dismissedSessions = new WeakMap<IChatInputNotificationService, ResourceSet>();
	private readonly _id: string;
	private readonly _dismissedSessions: ResourceSet;
	private _reasons: readonly string[] | undefined;
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
	) {
		super();
		this._id = `agentHost.sandboxUnsupported.${_sessionResource.toString()}`;
		let dismissedSessions = AgentHostSandboxNotification._dismissedSessions.get(this._notificationService);
		if (!dismissedSessions) {
			dismissedSessions = new ResourceSet();
			AgentHostSandboxNotification._dismissedSessions.set(this._notificationService, dismissedSessions);
		}
		this._dismissedSessions = dismissedSessions;
		this._register(CommandsRegistry.registerCommand(this._disableCommandId, async () => {
			if (!this._canDisableSandboxing(this._subscription.value)) {
				throw new Error(localize('agentHost.sandboxDisableUnavailable', "Sandboxing cannot be disabled in settings for this session. It may be required by your organization."));
			}
			this._disableSessionSandboxing();
			await this._configurationService.updateValue(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
		}));
		this._register(_subscription.onDidChange(state => this._update(state)));
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
			this._update(this._subscription.value);
		}));
	}

	private _disableSessionSandboxing(): void {
		const state = this._subscription.value;
		if (!state || state instanceof Error) {
			throw new Error(localize('agentHost.sandboxSessionUnavailable', "Could not disable sandboxing because the session is unavailable."));
		}
		const config = state.config;
		const value = config?.values[SessionConfigKey.SandboxEnabled] ?? config?.schema.properties[SessionConfigKey.SandboxEnabled]?.default;
		if (value !== AgentSandboxEnabledValue.On && readSessionSandboxState(state)?.enabled !== true) {
			return;
		}
		const resolution = this._connectionsService.resolveSessionResource(this._sessionResource);
		if (!resolution || !config) {
			throw new Error(localize('agentHost.sandboxSessionConfigUnavailable', "Could not disable sandboxing because the session connection or configuration is unavailable."));
		}
		if (!isSessionConfigWritable(config.schema.properties[SessionConfigKey.SandboxEnabled], false)) {
			throw new Error(localize('agentHost.sandboxSessionReadOnly', "Sandboxing cannot be changed for this session."));
		}
		validateSessionConfigWrite(config.schema, config.values, SessionConfigKey.SandboxEnabled, AgentSandboxEnabledValue.Off, false);
		resolution.connection.dispatch(resolution.backendSession.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.Off },
		});
	}

	private _canDisableSandboxing(state: SessionState | Error | undefined): boolean {
		if (!state || state instanceof Error) {
			return false;
		}
		const policy = readSessionSandboxPolicy(state);
		const connection = this._connectionsService.resolveSessionResource(this._sessionResource)?.connection;
		const useLocalPolicy = !policy && !isWeb && !this._environmentService.remoteAuthority
			&& connection === this._agentHostService;
		const value = state.config?.values[SessionConfigKey.SandboxEnabled] ?? state.config?.schema.properties[SessionConfigKey.SandboxEnabled]?.default;
		const confirmedEnabled = readSessionSandboxState(state)?.enabled;
		return !isAgentHostSandboxDisablingBlocked({
			sessionEnabled: value === AgentSandboxEnabledValue.On ? true : value === AgentSandboxEnabledValue.Off ? false : confirmedEnabled,
			confirmedEnabled,
			managedEnabled: policy ? policy.enabled && !policy.failClosed : useLocalPolicy && this._enablementService.managedSandboxEnforced.get(),
			allowsBypass: policy ? policy.allowBypass === true : useLocalPolicy && this._enablementService.managedSandboxAllowsBypass.get(),
		})
			&& this._configurationService.inspect(AgentSandboxSettingId.AgentSandboxEnabled).policyValue === undefined;
	}

	private _update(state: SessionState | Error | undefined): void {
		if (this._dismissedSessions.has(this._sessionResource)) {
			return;
		}
		const diagnostics = state && !(state instanceof Error) ? readAgentSandboxDiagnostics(state) : undefined;
		const reasons = diagnostics ? distinct(diagnostics) : undefined;
		const canDisable = this._canDisableSandboxing(state);
		if (equals(this._reasons ?? [], reasons ?? []) && this._canDisable === canDisable) {
			return;
		}
		this._reasons = reasons;
		this._canDisable = canDisable;
		if (!reasons) {
			this._notificationService.deleteNotification(this._id);
			return;
		}
		const description = new MarkdownString('', { isTrusted: { enabledCommands: canDisable ? [this._disableCommandId] : [] } });
		description.appendText(reasons[0]);
		description.appendText(' ');
		// Use the OS-support page until the sandbox troubleshooting guide is available.
		description.appendLink('https://aka.ms/ghcp-sandbox-os-support', localize('agentHost.sandboxTroubleshooting', "Troubleshooting Guide"));
		if (canDisable) {
			description.appendText(' | ');
			description.appendLink(
				createCommandUri(this._disableCommandId).toString(),
				localize('agentHost.disableSandboxing', "Disable Sandboxing"),
				localize('agentHost.disableSandboxingDetail', "Disable sandboxing for this session and in settings. Terminal commands may run without sandbox restrictions. Organization policy still applies."),
			);
		}
		this._notificationService.setNotification({
			id: this._id,
			severity: ChatInputNotificationSeverity.Warning,
			message: localize('agentHost.sandboxMayNotWorkAsExpected', "Sandboxing might not work as expected"),
			description,
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
		this._notificationService.deleteNotification(this._id);
		super.dispose();
	}
}
