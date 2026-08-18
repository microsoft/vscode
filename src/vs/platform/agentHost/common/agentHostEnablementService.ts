/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../base/common/observable.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';

/** Context key set by {@link IAgentHostEnablementService}. Use in `when` clauses to gate Agent Host UI. */
export const AGENT_HOST_ENABLED_CONTEXT_KEY = new RawContextKey<boolean>('agentHostEnabled', false, { type: 'boolean', description: nls.localize('agentHostEnabled', "Whether Agent Host features are available and AI features are enabled in this window.") });

export const IAgentHostEnablementService = createDecorator<IAgentHostEnablementService>('agentHostEnablementService');

export interface IAgentHostEnablementService {
	readonly _serviceBrand: undefined;
	/**
	 * Whether Agent Host features are available and AI features are enabled in this window.
	 */
	readonly enabled: IObservable<boolean>;
	/**
	 * Whether an enterprise has mandated the Copilot SDK sandbox floor through managed settings
	 * (`sandbox.enabled`). The runtime owns composing and enforcing that floor; VS Code reads it
	 * only to retire the legacy local harness for governed users, since the sandbox is implemented
	 * by the Agent Host.
	 *
	 * A user- or workspace-level sandbox opt-in is not an enterprise decision and does not set
	 * this. Existing local chat sessions keep working; only the harness used for *new* chats is
	 * affected, and virtual workspaces are exempt.
	 */
	readonly managedSandboxEnforced: IObservable<boolean>;
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHost',
	title: nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		'chat.editor.preferCopilotHarness': {
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
		'chat.defaultToCopilotHarness': {
			type: 'boolean',
			description: nls.localize('chat.defaultToCopilotHarness', "When enabled, new editor and panel chat sessions default to the Agent Host Copilot SDK instead of the local harness."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		'chat.editor.localAgent.enabled': {
			type: 'boolean',
			description: nls.localize('chat.editor.localAgent.enabled', "When enabled, shows the VS Code local chat harness in the chat picker. This setting is ignored in virtual workspaces, where the local chat harness is always available."),
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	}
});
