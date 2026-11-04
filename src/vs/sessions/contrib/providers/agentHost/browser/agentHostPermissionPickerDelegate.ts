/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable, IReader, observableSignal, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { createAgentHostSandboxToggle } from '../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostCustomTerminalToolEnabledSettingId } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, isSessionConfigWritable, getWithheldSessionApprovalValues, readSessionApprovalLevel, writeSessionApprovalLevel } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { narrowClaudePermissionMode } from '../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { narrowCodexPermissionsPreset } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { disableGlobalAutoApproveForPermissionSelection, isApprovalLevelDisabledByKnownPolicy, isAutoApprovePolicyRestricted } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { IPermissionLevelMeta, IPermissionPickerDelegate } from '../../copilotChatSessions/browser/permissionPicker.js';
import { getSessionConfigProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionConfigProvider, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { AgentHostSessionSandbox } from './agentHostSessionSandbox.js';
import { CopilotCLISessionType } from './baseAgentHostSessionsProvider.js';
import { IChatPhoneInputPresenter } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { equalsUnavailablePermissionLevels, isWellKnownAutoApproveSchema, isWellKnownModeSchema, IUnavailablePermissionLevel, shouldCombineModeAndPermissions } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';

const REQUIRED_PERMISSION_MODE_VALUE = 'default';
const REQUIRED_CODEX_APPROVALS_VALUE = 'default';

export { isWellKnownAutoApproveSchema, isWellKnownModeSchema };

/** Adapts the active session's advertised approval property to the shared permission picker. */
export class AgentHostPermissionPickerDelegate extends Disposable implements IPermissionPickerDelegate {

	/** Fires every time any agent-host provider's session config changes. */
	private readonly _configChangedSignal = observableSignal('agentHostPermissionPicker.configChanged');
	private readonly _providerSubscriptions = this._register(new DisposableMap<string>());

	readonly currentPermissionLevel: IObservable<ChatPermissionLevel>;
	/** Supported levels the host's availability report withholds; shown disabled and never selectable. */
	readonly unavailableLevels: IObservable<readonly IUnavailablePermissionLevel[]>;
	readonly isApplicable: IObservable<boolean>;
	readonly isModePickerCombined: IObservable<boolean>;
	readonly isResolving: IObservable<boolean>;
	readonly managedSandboxEnforced: IObservable<boolean>;
	readonly managedSandboxAllowsBypass: IObservable<boolean>;
	readonly sandboxEnabled: IObservable<boolean | undefined>;
	readonly sandboxConfirmedEnabled: IObservable<boolean | undefined>;
	readonly sandboxApplyFailed: IObservable<boolean>;
	readonly sandboxSelectionRejected: IObservable<boolean>;
	readonly sandboxDevContainer: IObservable<boolean>;
	readonly sandboxDevContainerSupported: IObservable<boolean | undefined>;
	private readonly _sandboxState: AgentHostSessionSandbox['state'];
	readonly sandboxToggleSettingId: IObservable<string | undefined>;
	readonly sandboxToggleConfigurationKeys = [
		AgentHostCustomTerminalToolEnabledSettingId,
		AgentSandboxSettingId.AgentSandboxEnabled,
	];

	readonly getSandboxToggleProvider = (): string | undefined => this._session.get()?.sessionType;

	readonly isSandboxToggleApplicable = (): boolean => this.sandboxToggleSettingId.get() !== undefined;

	readonly getSandboxToggleSettingId = (): string | undefined => this.sandboxToggleSettingId.get();

	get availableLevels(): readonly ChatPermissionLevel[] {
		const session = this._session.get();
		if (!session) {
			return [ChatPermissionLevel.Default];
		}
		const provider = this._getProvider(session.providerId);
		const config = provider?.getSessionConfig(session.sessionId, session.activeChat.get().resource);
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
		const config = session ? this._getProvider(session.providerId)?.getSessionConfig(session.sessionId, session.activeChat.get().resource) : undefined;
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
		@IManagedSettingsService managedSettingsService: IManagedSettingsService,
	) {
		super();
		const providersChanged = observableSignalFromEvent(this, this._sessionsProvidersService.onDidChangeProviders);
		this._sandboxState = derived(this, reader => {
			providersChanged.read(reader);
			const session = this._session.read(reader);
			return new AgentHostSessionSandbox(session, session?.activeChat.read(reader).resource, session && this._sessionsProvidersService.getProvider(session.providerId), this._configurationService, agentHostEnablementService, environmentService).state;
		}).flatten();
		this.managedSandboxEnforced = this._sandboxState.map(state => state.managedEnabled);
		this.managedSandboxAllowsBypass = this._sandboxState.map(state => state.allowsBypass);
		this.sandboxDevContainer = this._sandboxState.map(state => state.devContainer === true);
		this.sandboxDevContainerSupported = this._sandboxState.map(state => state.devContainerSandboxSupported);
		this.sandboxConfirmedEnabled = this._sandboxState.map(state => state.confirmedEnabled);
		this.sandboxEnabled = this._sandboxState.map(state => state.sessionEnabled);
		this.sandboxApplyFailed = this._sandboxState.map(state => state.applyFailed === true);
		this.sandboxSelectionRejected = this._sandboxState.map(state => state.rejectedSelection === true);
		this.sandboxToggleSettingId = this._sandboxState.map(state => state.provider ? AgentSandboxSettingId.AgentSandboxEnabled : undefined);

		this._watchProviders(this._sessionsProvidersService.getProviders({ includeSessionBackends: true }));
		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerSubscriptions.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._configChangedSignal.trigger(undefined);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker) || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
				this._configChangedSignal.trigger(undefined);
			}
		}));

		this.currentPermissionLevel = derived(this, reader => this._readLevel(reader));
		const managedSettingsChanged = observableSignalFromEvent(this, managedSettingsService.onDidChangeManagedSettings);
		this.unavailableLevels = derivedOpts({ owner: this, equalsFn: equalsUnavailablePermissionLevels }, reader => {
			this._configChangedSignal.read(reader);
			managedSettingsChanged.read(reader);
			const session = this._session.read(reader);
			const config = session && this._getProvider(session.providerId)?.getSessionConfig(session.sessionId, session.activeChat.read(reader).resource);
			const approvalProperty = getSessionApprovalProperty(config?.schema);
			const values = config && approvalProperty ? getWithheldSessionApprovalValues(approvalProperty, config.schema, config.values).map(value => readSessionApprovalLevel(approvalProperty, value)) : [];
			const useLocalPolicy = !this.sandboxDevContainer.read(reader) && !isWeb && !environmentService.remoteAuthority
				&& session?.providerId === LOCAL_AGENT_HOST_PROVIDER_ID && session.sessionType === CopilotCLISessionType.id;
			return [ChatPermissionLevel.Assisted, ChatPermissionLevel.AutoApprove]
				.filter(level => values.some(value => value === level))
				.map(level => ({ level, byPolicy: useLocalPolicy && isApprovalLevelDisabledByKnownPolicy(level, this._configurationService, managedSettingsService) }));
		});
		this.isModePickerCombined = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			const provider = session && this._getProvider(session.providerId);
			const config = session && provider?.getSessionConfig(session.sessionId, session.activeChat.read(reader).resource);
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
		this.isApplicable = derived(this, reader => this._sandboxState.read(reader).hasPermissionPicker && !this.isModePickerCombined.read(reader));
		this.isResolving = derived(this, reader => {
			this._configChangedSignal.read(reader);
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			const provider = this._getProvider(session.providerId);
			return provider?.isSessionConfigResolving(session.sessionId, session.activeChat.read(reader).resource).read(reader) ?? false;
		});
	}

	getSandboxToggle() {
		return createAgentHostSandboxToggle(() => this._sandboxState.get(), enabled => this.setSandboxEnabled(enabled));
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
		const operation = provider.setSessionConfigValue(session.sessionId, session.activeChat.get().resource, SessionConfigKey.SandboxEnabled, enabled ? 'on' : 'off');
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
		if (provider.isSessionConfigResolving(session.sessionId, session.activeChat.get().resource).get()) {
			return;
		}
		if (!this.availableLevels.includes(level)) {
			return;
		}
		const config = provider.getSessionConfig(session.sessionId, session.activeChat.get().resource);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		const value = writeSessionApprovalLevel(approvalProperty, level);
		if (!approvalProperty || value === undefined || !isSessionConfigWritable(approvalProperty.schema, provider.getCreateSessionConfig(session.sessionId) !== undefined)) {
			throw new Error('Approval configuration is unavailable for this session');
		}
		await disableGlobalAutoApproveForPermissionSelection(this._configurationService, level);
		const operation = provider.setSessionConfigValue(session.sessionId, session.activeChat.get().resource, approvalProperty.key, value);
		provider.trackSessionConfigOperation?.(session.sessionId, operation);
		await operation.catch(onUnexpectedError);
	}

	getPermissionLevelHover(level: ChatPermissionLevel, _meta: IPermissionLevelMeta): string {
		const session = this._session.get();
		const config = session && this._getProvider(session.providerId)?.getSessionConfig(session.sessionId, session.activeChat.get().resource);
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
		const config = provider.getSessionConfig(session.sessionId, session.activeChat.read(reader).resource);
		const approvalProperty = getSessionApprovalProperty(config?.schema);
		const value = config && approvalProperty ? readSessionApprovalLevel(approvalProperty, getEffectiveSessionApprovalValue(approvalProperty, config.schema, config.values)) : undefined;
		return isChatPermissionLevel(value) ? value : ChatPermissionLevel.Default;
	}

	private _getProvider(providerId: string): ISessionConfigProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && getSessionConfigProvider(provider);
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
