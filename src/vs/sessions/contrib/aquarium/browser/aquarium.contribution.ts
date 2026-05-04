/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aquarium.css';
import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AquariumService, IAquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from './aquariumOverlay.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			description: localize('sessions.developerJoy.enabled', "Adds an easter egg to the Agents application."),
			tags: ['experimental'],
		},
	},
});

registerSingleton(IAquariumService, AquariumService, InstantiationType.Delayed);
