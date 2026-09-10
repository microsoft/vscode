/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY } from '../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'extensions',
	properties: {
		[EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			description: localize('extensions.experimental.enableAgentsWindowCapability', "When enabled, extensions can declare whether they support running in the Agents window."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			agentsWindow: { default: false }
		},
	},
});
