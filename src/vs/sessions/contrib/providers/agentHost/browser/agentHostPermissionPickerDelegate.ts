/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableSignal } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { createAgentHostSandboxToggle } from '../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostCustomTerminalToolEnabledSettingId } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, isSessionConfigWritable, readSessionApprovalLevel, writeSessionApprovalLevel } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { narrowClaudePermissionMode } from '../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { narrowCodexPermissionsPreset } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { disableGlobalAutoApproveForPermissionSelection, isAutoApprovePolicyRestricted } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { IPermissionLevelMeta, IPermissionPickerDelegate } from '../../copilotChatSessions/browser/permissionPicker.js';
import { getSessionConfigProvider, IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionConfigProvider, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentSandboxEnabledSettingValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from '../../../../../platform/sandbox/common/settings.js';
import { CopilotCLISessionType } from './baseAgentHostSessionsProvider.js';
import { IChatPhoneInputPresenter } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { isWellKnownAutoApproveSchema, isWellKnownModeSchema, shouldCombineModeAndPermissions } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';

const REQUIRED_PERMISSION_MODE_VALUE = 'default';
const REQUIRED_CODEX_APPROVALS_VALUE = 'default';

export { isWellKnownAutoApproveSchema, isWellKnownModeSchema };

/** Adapts the active session's advertised approval property to the shared permission picker. */
export class AgentHostPermissionPickerDelegate extends Disposable implements IPermissionPickerDelegate {

	/** Fires every time any agent-host provider's session config changes. */
	private readonly _configChangedSignal = observableSignal('agentHostPermissionPicker.configChanged');
	private readonly _providerSubscriptions = this._register(new DisposableMap<string>());

	readonly currentPermissionLevel: IObservable<ChatPermissionLevel>;
	readonly isApplicable: IObservable<boolean>;
	readonly isModePickerCombined: IObservable<boolean>;
	readonly isResolving: IObservable<boolean>;
	readonly managedSandboxEnforced: IObservable<boolean>;
	readonly managedSandboxAllowsBypass: IObservable<boolean>;
	readonly sandboxEnabled: IObservable<boolean | undefined>;
	readonly sandboxConfirmedEnabled: IObservable<boolean | undefined>;
	readonly sandboxDevContainer: IObservable<boolean>;
	readonly sandboxDevContainerSupported: IObservable<boolean | undefined>;
	readonly sandboxToggleSettingId: IObservable<string | undefined>;
	readonly sandboxToggleConfigurationKeys = [
		AgentHostCustomTerminalToolEnabledSettingId,
		AgentSandboxSettingId.AgentSandboxEnabled,
	];

	readonly getSandboxToggleProvider = (): string | undefined => this._session.get()?.sessionType;

	readonly isSandboxToggleApplicable = (): boolean => {
		const session = this._session.get();
		return session?.sessionType === CopilotCLISessionType.id
			&& !!this._getProvider(session.providerId)?.getSessionConfig(session.sessionId)?.schema.properties[SessionConfigKey.SandboxEnabled];
	};

	readonly getSandboxToggleSettingId = (): string | undefined => this.sandboxToggleSettingId.get();

	get availableLevels(): readonly ChatPermissionLevel[] {
		const session = this._session.get();
		if (!session) {
			return [ChatPermissionLevel.Default];
		}
		const provider = this._getProvider(session.providerId);
		const config = provider?.getSessionConfig(session.sessionId);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		const values = config && approvalProperty ? getAvailableSessionApprovalValues(approvalProperty, config.schema, config.values).map(value => readSessionApprovalLevel(approvalProperty, value)) : [];
		return [
			ChatPermissionLevel.Default,
			ChatPermissionLevel.Assisted,
			ChatPermissionLevel.AutoApprove,
		].filter(level => values.some(value => value === level));
	}

	/** Agent-host sessions seed their default approval level from this setting. */
	readonly defaultSettingKey = ChatConfiguration.DefaultConfiguration;
	readonly isPolicyRestricted = (): boolean => {
		const session = this._session.get();
		const config = session ? this._getProvider(session.providerId)?.getSessionConfig(session.sessionId) : undefined;
		return isAutoApprovePolicyRestricted(this._configurationService, config?.schema);
	};

	getPermissionLevelMeta(level: ChatPermissionLevel, meta: IPermissionLevelMeta): IPermissionLevelMeta {
		switch (level) {
			case ChatPermissionLevel.Default:
				return {
					...meta,
					label: localize('agentHostPermissionPicker.manual.label', "Manual permissions"),
					detail: localize('agentHostPermissionPicker.askWhenNeeded.detail', "Asks when approval settings don't apply"),
					icon: Codicon.key,
				};
			case ChatPermissionLevel.Assisted:
				return { ...meta, detail: localize('agentHostPermissionPicker.approveWhenSafe.detail', "Evaluates risk before running tools") };
			case ChatPermissionLevel.AutoApprove:
				return { ...meta, detail: localize('agentHostPermissionPicker.allowAll.detail', "Runs tool calls without asking") };
			case ChatPermissionLevel.Autopilot:
				return meta;
		}
	}

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatPhoneInputPresenter phoneInputPresenter: IChatPhoneInputPresenter,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		const isDevContainer = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			return !!session && this._getAgentHostProvider(session.providerId)?.isDevContainerRequested?.(session.sessionId) === true;
		});
		this.sandboxDevContainer = isDevContainer;
		this.sandboxDevContainerSupported = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			return session && this._getAgentHostProvider(session.providerId)?.getDevContainerSandboxSupported?.(session.sessionId);
		});
		const sandboxPolicy = derived(this, reader => {
			if (isDevContainer.read(reader)) {
				// The source host's policy does not describe the pending container session.
				return undefined;
			}
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			const policy = session && this._getAgentHostProvider(session.providerId)?.getSessionSandboxPolicy?.(session.sessionId);
			if (policy || isWeb || environmentService.remoteAuthority || session?.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID || session.sessionType !== CopilotCLISessionType.id) {
				return policy;
			}
			// Local drafts have no SDK policy until their first turn.
			return {
				enabled: agentHostEnablementService.managedSandboxEnforced.read(reader),
				allowBypass: agentHostEnablementService.managedSandboxAllowsBypass.read(reader),
			};
		});
		this.managedSandboxEnforced = derived(this, reader => {
			const policy = sandboxPolicy.read(reader);
			return policy?.enabled === true && !policy.failClosed;
		});
		this.managedSandboxAllowsBypass = derived(this, reader => sandboxPolicy.read(reader)?.allowBypass === true);

		this._watchProviders(this._sessionsProvidersService.getProviders());
		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerSubscriptions.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._configChangedSignal.trigger(undefined);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker)) {
				this._configChangedSignal.trigger(undefined);
			}
		}));

		this.currentPermissionLevel = derived(this, reader => this._readLevel(reader));
		this.sandboxConfirmedEnabled = derived(this, reader => {
			if (isDevContainer.read(reader)) {
				return undefined;
			}
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			return session && this._getAgentHostProvider(session.providerId)?.getSessionSandboxEnabled?.(session.sessionId);
		});
		this.sandboxEnabled = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			const provider = session && this._getProvider(session.providerId);
			const value = session && provider?.getSessionConfig(session.sessionId)?.values[SessionConfigKey.SandboxEnabled];
			return value === 'on' ? true : value === 'off' ? false : this.sandboxConfirmedEnabled.read(reader);
		});
		this.sandboxToggleSettingId = derived(this, reader => {
			this._configChangedSignal.read(reader);
			this._session.read(reader);
			return this.isSandboxToggleApplicable() ? AgentSandboxSettingId.AgentSandboxEnabled : undefined;
		});
		this.isModePickerCombined = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			const provider = session && this._getProvider(session.providerId);
			const config = session && provider?.getSessionConfig(session.sessionId);
			const approvalProperty = getSessionApprovalProperty(config?.schema);
			const isNewSession = !!session && provider?.getCreateSessionConfig(session.sessionId) !== undefined;
			return !phoneInputPresenter.enabled.read(reader)
				&& isSessionConfigWritable(config?.schema.properties[SessionConfigKey.Mode], isNewSession)
				&& isSessionConfigWritable(approvalProperty?.schema, isNewSession)
				&& shouldCombineModeAndPermissions(
					this._configurationService.getValue<boolean>(ChatConfiguration.ExperimentalModePermissionsPicker) === true,
					session?.sessionType === CopilotCLISessionType.id || approvalProperty?.key === 'approvalMode',
					config?.schema.properties[SessionConfigKey.Mode],
					approvalProperty?.schema,
				);
		});
		this.isApplicable = derived(this, reader => this._readIsWellKnown(reader) && !this.isModePickerCombined.read(reader));
		this.isResolving = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			const provider = this._getProvider(session.providerId);
			return provider?.isSessionConfigResolving(session.sessionId).read(reader) ?? false;
		});
	}

	getSandboxToggle() {
		if (!this.isSandboxToggleApplicable() || this.getSandboxToggleSettingId() === undefined) {
			return undefined;
		}
		return createAgentHostSandboxToggle(() => {
			const settingId = this.getSandboxToggleSettingId();
			return {
				provider: this.getSandboxToggleProvider(),
				sessionEnabled: this.sandboxEnabled.get(),
				confirmedEnabled: this.sandboxConfirmedEnabled.get(),
				globalEnabled: settingId !== undefined && isAgentSandboxEnabledValue(this._configurationService.getValue<AgentSandboxEnabledSettingValue>(settingId)),
				managedEnabled: this.managedSandboxEnforced.get(),
				allowsBypass: this.managedSandboxAllowsBypass.get(),
				devContainer: this.sandboxDevContainer.get(),
				devContainerSandboxSupported: this.sandboxDevContainerSupported.get(),
			};
		}, enabled => this.setSandboxEnabled(enabled));
	}

	setSandboxEnabled(enabled: boolean): void {
		const session = this._session.get();
		const provider = session && this._getProvider(session.providerId);
		if (!session || !provider || !this.isSandboxToggleApplicable()) {
			throw new Error('Sandbox configuration is unavailable for this session');
		}
		if (enabled && this.sandboxDevContainerSupported.get() === false) {
			throw new Error(localize('agentHostPermissionPicker.devContainerSandboxUnavailable', "Recreate the Dev Container with sandboxing enabled before enabling sandboxing for this session."));
		}
		const operation = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.SandboxEnabled, enabled ? 'on' : 'off');
		provider.trackSessionConfigOperation?.(session.sessionId, operation);
		void operation.catch(onUnexpectedError);
	}

	async setPermissionLevel(level: ChatPermissionLevel): Promise<void> {
		const session = this._session.get();
		if (!session) {
			return;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return;
		}
		// Defensive: ActionWidgetDropdown picks up Enter/Space on its
		// label even when `pointer-events: none` is set on the chip.
		if (provider.isSessionConfigResolving(session.sessionId).get()) {
			return;
		}
		if (!this.availableLevels.includes(level)) {
			return;
		}
		const config = provider.getSessionConfig(session.sessionId);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		const value = writeSessionApprovalLevel(approvalProperty, level);
		if (!approvalProperty || value === undefined || !isSessionConfigWritable(approvalProperty.schema, provider.getCreateSessionConfig(session.sessionId) !== undefined)) {
			throw new Error('Approval configuration is unavailable for this session');
		}
		await disableGlobalAutoApproveForPermissionSelection(this._configurationService, level);
		const operation = provider.setSessionConfigValue(session.sessionId, approvalProperty.key, value);
		provider.trackSessionConfigOperation?.(session.sessionId, operation);
		await operation.catch(onUnexpectedError);
	}

	getPermissionLevelHover(level: ChatPermissionLevel, _meta: IPermissionLevelMeta): string {
		const session = this._session.get();
		const config = session && this._getProvider(session.providerId)?.getSessionConfig(session.sessionId);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		if (config && approvalProperty?.key === 'approvalMode') {
			const requested = config.values[approvalProperty.key] ?? approvalProperty.schema.default;
			const effective = getEffectiveSessionApprovalValue(approvalProperty, config.schema, config.values);
			if (effective !== requested) {
				return localize('agentHostPermissionPicker.effectiveApprovalsHover', "Effective permissions: {0}. Requested permissions: {1}.", String(effective), String(requested));
			}
		}
		switch (level) {
			case ChatPermissionLevel.Default:
				return localize('agentHostPermissionPicker.defaultApprovalsHover', "Copilot asks before running tools unless your configured settings allow the tool.");
			case ChatPermissionLevel.AutoApprove:
				return localize('agentHostPermissionPicker.autoApproveHover', "Copilot runs all tools without asking for approval.");
			case ChatPermissionLevel.Assisted:
				return localize('agentHostPermissionPicker.assistedHover', "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval.");
			case ChatPermissionLevel.Autopilot:
				return localize('agentHostPermissionPicker.autopilotApprovalsHover', "Copilot runs tools without asking for approval and continues until the task is done.");
		}
	}

	private _readLevel(reader: IReader): ChatPermissionLevel {
		this._configChangedSignal.read(reader);
		const session = this._session.read(reader);
		if (!session) {
			return ChatPermissionLevel.Default;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return ChatPermissionLevel.Default;
		}
		const config = provider.getSessionConfig(session.sessionId);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		const value = config && approvalProperty ? readSessionApprovalLevel(approvalProperty, getEffectiveSessionApprovalValue(approvalProperty, config.schema, config.values)) : undefined;
		return isChatPermissionLevel(value) ? value : ChatPermissionLevel.Default;
	}

	private _readIsWellKnown(reader: IReader): boolean {
		this._configChangedSignal.read(reader);
		const session = this._session.read(reader);
		if (!session) {
			return false;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return false;
		}
		const approvalProperty = getSessionApprovalProperty(provider.getSessionConfig(session.sessionId)?.schema);
		return !!approvalProperty && isSessionConfigWritable(approvalProperty.schema, provider.getCreateSessionConfig(session.sessionId) !== undefined);
	}

	private _getProvider(providerId: string): ISessionConfigProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && getSessionConfigProvider(provider);
	}

	private _getAgentHostProvider(providerId: string): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && isAgentHostProvider(provider) ? provider : undefined;
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			const configProvider = getSessionConfigProvider(provider);
			if (!configProvider || this._providerSubscriptions.has(provider.id)) {
				continue;
			}
			const subscriptions = new DisposableStore();
			subscriptions.add(configProvider.onDidChangeSessionConfig(() => {
				this._configChangedSignal.trigger(undefined);
			}));
			this._providerSubscriptions.set(provider.id, subscriptions);
		}
	}
}

export function isWellKnownModeValue(schema: SessionConfigPropertySchema, value: string): boolean {
	return isWellKnownModeSchema(schema) && schema.enum!.some(candidate => String(candidate) === value);
}

/**
 * Returns `true` when a `permissionMode` session-config property uses the
 * Claude SDK's well-known permission-mode value set and includes `default`.
 */
export function isWellKnownClaudePermissionModeSchema(schema: SessionConfigPropertySchema): boolean {
	if (schema.type !== 'string' || !Array.isArray(schema.enum) || schema.enum.length === 0) {
		return false;
	}
	if (!schema.enum.includes(REQUIRED_PERMISSION_MODE_VALUE)) {
		return false;
	}
	return schema.enum.every(value => narrowClaudePermissionMode(value) !== undefined);
}

/**
 * Returns `true` when a `codex.permissionsPreset` session-config property uses
 * the Codex permissions-preset value set and includes `default`.
 *
 * Codex collapses its three security axes (sandbox × approval policy ×
 * approvals reviewer) into a single user-facing preset; this guard lets the
 * dedicated {@link AgentHostCodexApprovalsPicker} claim the property while the
 * generic per-property picker stands down.
 */
export function isWellKnownCodexApprovalsSchema(schema: SessionConfigPropertySchema): boolean {
	if (schema.type !== 'string' || !Array.isArray(schema.enum) || schema.enum.length === 0) {
		return false;
	}
	if (!schema.enum.includes(REQUIRED_CODEX_APPROVALS_VALUE)) {
		return false;
	}
	return schema.enum.every(value => narrowCodexPermissionsPreset(value) !== undefined);
}
