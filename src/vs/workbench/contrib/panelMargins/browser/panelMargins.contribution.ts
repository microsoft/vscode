/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { PanelMarginsContribution } from './panelMargins.js';

// Panel Margins contribution
registerWorkbenchContribution2(PanelMarginsContribution.ID, PanelMarginsContribution, WorkbenchPhase.AfterRestored);

// Panel Margins configuration contribution
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.panel.margins.enabled': {
				type: 'boolean',
				default: false,
				description: localize('panelMarginsEnabled', "Controls whether panels have margins and rounded corners. When enabled, workbench panels will have 8px margins and border radius for a modern appearance.")
			}
		}
	});
