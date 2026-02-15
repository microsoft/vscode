/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'network',
	order: 14,
	title: localize('networkConfigurationTitle', "Network"),
	type: 'object',
	properties: {
		'network.respectMeteredConnections': {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('respectMeteredConnections', "When enabled, automatic updates and downloads will be postponed when on a metered network connection (such as mobile data or tethering)."),
			tags: ['usesOnlineServices']
		}
	}
});
