/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'workbench',
	order: 7,
	type: 'object',
	properties: {
		'workbench.depth': {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('workbench.depth', "Enables UI Depth with shadow-based visual layering and depth effects. This creates a more three-dimensional, layered appearance in the interface.")
		}
	}
});
