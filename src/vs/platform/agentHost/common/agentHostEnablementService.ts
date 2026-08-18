/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../base/common/observable.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import * as nls from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
import { AgentSandboxEnabledSettingValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from '../../sandbox/common/settings.js';

/** Context key set by {@link IAgentHostEnablementService}. Use in `when` clauses to gate Agent Host UI. */
export const AGENT_HOST_ENABLED_CONTEXT_KEY = new RawContextKey<boolean>('agentHostEnabled', false, { type: 'boolean', description: nls.localize('agentHostEnabled', "Whether Agent Host features are available and AI features are enabled in this window.") });

export const IAgentHostEnablementService = createDecorator<IAgentHostEnablementService>('agentHostEnablementService');

export interface IAgentHostEnablementService {
	readonly _serviceBrand: undefined;
	/**
	 * Whether Agent Host features are available and AI features are enabled in this window.
	 */
	readonly enabled: IObservable<boolean>;
}

/**
 * How a managed (policy-controlled) agent sandbox affects the chat harness selection.
 *
 * An administrator who turns the agent sandbox on through managed settings is declaring that these
 * users are governed. Sandboxing is being built out on the Agent Host, so those users are moved off
 * the legacy local harness instead of being left on a harness that is going away.
 */
export interface IManagedSandboxHarnessEnforcement {
	/**
	 * Whether the harness selection is forced because the agent sandbox is turned on by policy.
	 * When true, the legacy local harness is hidden and new chats default to the Agent Host
	 * Copilot SDK, regardless of `chat.editor.localAgent.enabled`, `chat.defaultToCopilotHarness`
	 * and `chat.editor.preferCopilotHarness`.
	 */
	readonly enforced: boolean;
	/** The policy value of `chat.agent.sandbox.enabled`, or `undefined` when it is not managed. */
	readonly sandboxPolicyValue: AgentSandboxEnabledSettingValue | undefined;
	/** The policy value of `chat.agent.sandbox.enabledWindows`, or `undefined` when it is not managed. */
	readonly windowsSandboxPolicyValue: AgentSandboxEnabledSettingValue | undefined;
}

/**
 * Resolves whether the agent sandbox is turned on by managed settings (enterprise policy). A user
 * or workspace opt-in to the sandbox deliberately does *not* count: only an administrator-enforced
 * sandbox retires the legacy local harness.
 *
 * Sandbox enablement is split per platform (`chat.agent.sandbox.enabled` covers macOS and Linux,
 * `chat.agent.sandbox.enabledWindows` covers Windows). Either one being managed on is treated as
 * the governance signal, so a fleet-wide policy behaves the same on every machine in that fleet.
 *
 * Existing local chat sessions keep working; only the harness used for *new* chats is affected.
 */
export function getManagedSandboxHarnessEnforcement(configurationService: IConfigurationService): IManagedSandboxHarnessEnforcement {
	const sandboxPolicyValue = configurationService.inspect<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxEnabled).policyValue;
	const windowsSandboxPolicyValue = configurationService.inspect<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxWindowsEnabled).policyValue;
	return {
		enforced: isAgentSandboxEnabledValue(sandboxPolicyValue) || isAgentSandboxEnabledValue(windowsSandboxPolicyValue),
		sandboxPolicyValue,
		windowsSandboxPolicyValue
	};
}

/** Shorthand for {@link getManagedSandboxHarnessEnforcement}'s `enforced` flag. */
export function isCopilotHarnessForcedByManagedSandbox(configurationService: IConfigurationService): boolean {
	return getManagedSandboxHarnessEnforcement(configurationService).enforced;
}

/** Setting that replaces the local harness with the Agent Host Copilot SDK for new editor chats. */
export const ChatEditorPreferCopilotHarnessSettingId = 'chat.editor.preferCopilotHarness';
/** Setting that makes new editor and panel chats default to the Agent Host Copilot SDK. */
export const ChatDefaultToCopilotHarnessSettingId = 'chat.defaultToCopilotHarness';
/** Setting that shows the legacy local chat harness in the chat pickers. */
export const ChatEditorLocalAgentEnabledSettingId = 'chat.editor.localAgent.enabled';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHost',
	title: nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		[ChatEditorPreferCopilotHarnessSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.editor.preferCopilotHarness', "When enabled, uses the Agent Host Copilot SDK whenever the local harness would otherwise be selected for a new editor chat session. Claude and Codex selections are unaffected."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			policy: {
				name: 'ChatEditorPreferCopilotHarness',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.134',
				localization: {
					description: {
						key: 'chat.editor.preferCopilotHarness.policy',
						value: nls.localize('chat.editor.preferCopilotHarness.policy', "Configure whether VS Code uses the Agent Host Copilot SDK instead of the local harness for new editor chat sessions."),
					},
				},
			},
		},
		[ChatDefaultToCopilotHarnessSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.defaultToCopilotHarness', "When enabled, new editor and panel chat sessions default to the Agent Host Copilot SDK instead of the local harness. Outside virtual workspaces, this behavior is also implied when the agent sandbox is enabled by policy."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		[ChatEditorLocalAgentEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.editor.localAgent.enabled', "When enabled, shows the VS Code local chat harness in the chat picker. Virtual workspaces ignore this setting and always keep the local chat harness available. Outside virtual workspaces, the local chat harness is always hidden when the agent sandbox is enabled by policy."),
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	}
});
