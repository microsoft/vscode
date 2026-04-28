/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { localize } from '../../../../nls.js';

// Register TSCode specific configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'tscode.useIntegratedBrowserByDefault': {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				'tscode.useIntegratedBrowserByDefault',
				'When enabled, all HTTP/HTTPS links will open in the Integrated Browser by default instead of the external browser.'
			)
		}
	}
});

// Register TSCode default configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		// Show browser button in title bar by default
		'workbench.browser.showInTitleBar': true,

		// Open localhost links in integrated browser by default
		'workbench.browser.openLocalhostLinks': true,

		// Open all links in integrated browser by default
		'tscode.useIntegratedBrowserByDefault': true
	}
}]);
