/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../base/common/policy.js';
import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'policy',
	order: 100,
	title: localize('policyConfigurationTitle', "Policy"),
	type: 'object',
	properties: {
		'policy.adminContact.email': {
			type: 'string',
			default: '',
			scope: ConfigurationScope.APPLICATION,
			description: localize('adminContactEmail', "Contact email address for the administrator managing this installation. This information is shown to users when they encounter settings managed by system policy."),
			included: false,
			policy: {
				name: 'AdminContactEmail',
				category: PolicyCategory.General,
				minimumVersion: '1.107',
				localization: {
					description: {
						key: 'adminContactEmail',
						value: localize('adminContactEmail', "Contact email address for the administrator managing this installation. This information is shown to users when they encounter settings managed by system policy."),
					}
				}
			}
		},
		'policy.adminContact.url': {
			type: 'string',
			default: '',
			scope: ConfigurationScope.APPLICATION,
			description: localize('adminContactUrl', "Contact URL or website for the administrator managing this installation. This information is shown to users when they encounter settings managed by system policy."),
			included: false,
			policy: {
				name: 'AdminContactUrl',
				category: PolicyCategory.General,
				minimumVersion: '1.107',
				localization: {
					description: {
						key: 'adminContactUrl',
						value: localize('adminContactUrl', "Contact URL or website for the administrator managing this installation. This information is shown to users when they encounter settings managed by system policy."),
					}
				}
			}
		}
	}
});
