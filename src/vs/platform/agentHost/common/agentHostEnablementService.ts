/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../../base/common/platform.js';
import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';

/** @internal Only the enablement service may read this configuration value at runtime. */
const agentHostEnabledSettingId = 'chat.agentHost.enabled';

/** Context key set by {@link IAgentHostEnablementService}. Use in `when` clauses to gate UI on whether the agent host is enabled. */
export const AGENT_HOST_ENABLED_CONTEXT_KEY = new RawContextKey<boolean>('agentHostEnabled', false, { type: 'boolean', description: nls.localize('agentHostEnabled', "Whether the local agent host process is enabled.") });

export const IAgentHostEnablementService = createDecorator<IAgentHostEnablementService>('agentHostEnablementService');

export interface IAgentHostEnablementService {
	readonly _serviceBrand: undefined;
	/**
	 * Whether the local agent host process is enabled in this runtime.
	 * Returns `false` on web. This value is fixed at startup and never changes.
	 */
	readonly enabled: boolean;
}

// Register `chat.agentHost.enabled` and related settings.
// Intentionally kept in this file so the setting ID stays internal.
// Loaded by:
//   - `electronAgentHostStarter.ts` (main process, for default value awareness)
//   - `platform/agentHost/browser/agentHostEnablementService.ts` (renderer, via import)
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHost',
	title: nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		[agentHostEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.enabled', "When enabled, some agents run in a separate agent host process."),
			default: !isWeb && product.quality !== 'stable',
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'startup' },
		},
		'chat.agents.copilotCli.hideExtensionHost': {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agents.copilotCli.hideExtensionHost', "When enabled, hides the Extension Host Copilot CLI entry from the Agents window picker. Requires `#chat.agentHost.enabled#`.", agentHostEnabledSettingId),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		'chat.editor.preferCopilotHarness': {
			type: 'boolean',
			description: nls.localize('chat.editor.preferCopilotHarness', "When enabled, prefers the Agent Host Copilot CLI for new editor chat sessions. If the local harness is selected, it is replaced with Copilot once."),
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
		'chat.editor.copilotCli.hideExtensionHost': {
			type: 'boolean',
			description: nls.localize('chat.editor.copilotCli.hideExtensionHost', "When enabled, hides the Extension Host Copilot CLI entry from the editor window chat picker."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	}
});
