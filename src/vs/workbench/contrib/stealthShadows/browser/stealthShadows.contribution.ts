/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { StealthShadowsContribution } from './stealthShadows.js';

// Stealth Shadows contribution
registerWorkbenchContribution2(StealthShadowsContribution.ID, StealthShadowsContribution, WorkbenchPhase.AfterRestored);

// Stealth Shadows configuration contribution
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.stealthShadows.enabled': {
				type: 'boolean',
				default: false,
				description: localize('stealthShadowsEnabled', "Controls whether stealth shadows are enabled. When enabled, UI elements use soft shadows instead of borders for visual hierarchy.")
			}
		}
	});
