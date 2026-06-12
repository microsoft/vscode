/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../../base/common/platform.js';
import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';
import { AgentHostEnabledSettingId } from './agentService.js';

// `chat.agentHost.enabled` is read in the desktop main process
// (`src/vs/code/electron-main/app.ts`) to decide whether to spawn the agent
// host, and in the renderer for various gating decisions. The remote server
// does **not** consume this key — it spawns the agent host based on its own
// `--agent-host-port` / `--agent-host-path` CLI args — so this registration
// is intentionally not imported there.
//
// Side-effect imports of this file:
//   - `src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts`
//     (loaded transitively from `app.ts`).
//   - `src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`
//     (renderer registration for the settings UI).

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHost',
	title: nls.localize('chatAgentHostConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		[AgentHostEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.enabled', "When enabled, some agents run in a separate agent host process."),
			default: !isWeb && product.quality !== 'stable',
			tags: ['experimental', 'advanced'],
		},
		'chat.agents.copilotCli.hideExtensionHost': {
			type: 'boolean',
			description: nls.localize('chat.agents.copilotCli.hideExtensionHost', "When enabled, hides the Extension Host Copilot CLI entry from the Agents window picker."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		'chat.editor.defaultProvider': {
			type: 'string',
			enum: ['local', 'copilotEh', 'copilotAh'],
			enumDescriptions: [
				nls.localize('chat.editor.defaultProvider.local', "Use the built-in VS Code local chat harness"),
				nls.localize('chat.editor.defaultProvider.copilotEh', "Use the Extension Host Copilot CLI"),
				nls.localize('chat.editor.defaultProvider.copilotAh', "Use the Agent Host Copilot CLI"),
			],
			description: nls.localize('chat.editor.defaultProvider', "Controls which provider is used as the default for new editor chat sessions."),
			default: 'local',
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
