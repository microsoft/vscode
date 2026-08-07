/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../base/common/observable.js';
import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';

/** Context key set by {@link IAgentHostEnablementService}. Use in `when` clauses to gate UI on whether the agent host is enabled. */
export const AGENT_HOST_ENABLED_CONTEXT_KEY = new RawContextKey<boolean>('agentHostEnabled', false, { type: 'boolean', description: nls.localize('agentHostEnabled', "Whether the local agent host process is enabled.") });

export const IAgentHostEnablementService = createDecorator<IAgentHostEnablementService>('agentHostEnablementService');

export interface IAgentHostEnablementService {
	readonly _serviceBrand: undefined;
	/**
	 * Whether Agent Host features are enabled in this runtime.
	 * This can transition from `false` to `true` when AI features are explicitly enabled.
	 */
	readonly enabled: IObservable<boolean>;
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHost',
	title: nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		'chat.editor.preferCopilotHarness': {
			type: 'boolean',
			description: nls.localize('chat.editor.preferCopilotHarness', "When enabled, prefers the Agent Host Copilot CLI for new editor chat sessions. If the local harness is selected, it is replaced with Copilot once."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		'chat.defaultToCopilotHarness': {
			type: 'boolean',
			description: nls.localize('chat.defaultToCopilotHarness', "When enabled, new editor and panel chat sessions default to the Agent Host Copilot CLI instead of the local harness."),
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
