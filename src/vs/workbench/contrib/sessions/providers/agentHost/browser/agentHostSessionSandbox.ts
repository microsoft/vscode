/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { getAgentHostSandboxToggleState } from '../../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { getSessionApprovalProperty, isSessionConfigWritable } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSandboxEnabledSettingValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from '../../../../../../platform/sandbox/common/settings.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { getSessionConfigProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';

/** The session-specific inputs shared by the permissions picker and its composer indicator. */
export class AgentHostSessionSandbox {
	readonly state: IObservable<Parameters<typeof getAgentHostSandboxToggleState>[0] & { readonly hasPermissionPicker: boolean }>;
	readonly checked: IObservable<boolean>;

	constructor(
		session: ISession | undefined,
		chat: URI | undefined,
		provider: ISessionsProvider | undefined,
		@IConfigurationService configurationService: IConfigurationService,
		@IAgentHostEnablementService enablementService: IAgentHostEnablementService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		const configProvider = provider && getSessionConfigProvider(provider);
		const agentHost = provider && isAgentHostProvider(provider) ? provider : undefined;
		const configChanged = observableSignalFromEvent(this, configProvider ? Event.filter(configProvider.onDidChangeSessionConfig, id => id === session?.sessionId) : Event.None);
		const settingChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled)));
		this.state = derived(this, reader => {
			configChanged.read(reader);
			const config = session && chat && configProvider?.getSessionConfig(session.sessionId, chat);
			const approvalProperty = getSessionApprovalProperty(config?.schema);
			const hasPermissionPicker = !!session && !!approvalProperty && isSessionConfigWritable(approvalProperty.schema, configProvider?.getCreateSessionConfig(session.sessionId) !== undefined);
			const applicable = session?.sessionType === COPILOT_CLI_AGENT_PROVIDER_ID && !!config?.schema.properties[SessionConfigKey.SandboxEnabled];
			const inDevContainer = !!session && agentHost?.isDevContainerRequested?.(session.sessionId) === true;
			const policy = session && !inDevContainer ? agentHost?.getSessionSandboxPolicy?.(session.sessionId) : undefined;
			// Local drafts have no SDK policy until their first turn; container drafts must not inherit the source host's policy.
			const useLocalPolicy = !policy && !inDevContainer && !isWeb && !environmentService.remoteAuthority && session?.providerId === LOCAL_AGENT_HOST_PROVIDER_ID && session.sessionType === COPILOT_CLI_AGENT_PROVIDER_ID;
			const confirmedEnabled = session && chat && !inDevContainer ? agentHost?.getSessionSandboxEnabled?.(session.sessionId, chat) : undefined;
			const value = config?.values[SessionConfigKey.SandboxEnabled];
			settingChanged.read(reader);
			return {
				provider: applicable ? session.sessionType : undefined,
				hasPermissionPicker,
				sessionEnabled: value === 'on' ? true : value === 'off' ? false : confirmedEnabled,
				confirmedEnabled,
				applyFailed: !!session && !!chat && agentHost?.hasSessionSandboxChangeError?.(session.sessionId, chat) === true,
				rejectedSelection: !!session && !!chat && agentHost?.hasSessionSandboxRejectedSelection?.(session.sessionId, chat) === true,
				devContainer: inDevContainer,
				devContainerSandboxSupported: session && agentHost?.getDevContainerSandboxSupported?.(session.sessionId),
				globalEnabled: applicable && isAgentSandboxEnabledValue(configurationService.getValue<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxEnabled)),
				managedEnabled: useLocalPolicy ? enablementService.managedSandboxEnforced.read(reader) : policy?.enabled === true && !policy.failClosed,
				allowsBypass: useLocalPolicy ? enablementService.managedSandboxAllowsBypass.read(reader) : policy?.allowBypass === true,
			};
		});
		this.checked = this.state.map(state => state.hasPermissionPicker && getAgentHostSandboxToggleState(state)?.checked === true);
	}
}
