/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork — agent-aware terminal selector (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';

/**
 * Self-registering contribution for the agent-aware terminal selector.
 *
 * This module is pulled into the terminal module graph by a single one-line
 * import in `terminal.contribution.ts` (the only other sanctioned upstream edit
 * besides the seam — see SEAM_MANIFEST.md). It registers the experimental flag
 * that gates the whole feature. With the flag off (the default) the stock
 * `TerminalTabbedView` is created and behavior is byte-identical to upstream.
 */

export const TerminalAgentTabsSettingId = 'terminal.integrated.agentTabs.enabled';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'terminal',
	order: 100,
	title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		[TerminalAgentTabsSettingId]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize(
				'terminal.integrated.agentTabs.enabled',
				"Replaces the terminal tab list with an agent-aware selector that lists agent (chat tool-session) terminals alongside regular terminals. Experimental."
			),
		},
	},
});
