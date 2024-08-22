/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { Registry } from '../../../../platform/registry/common/platform';
import { externalUriOpenersConfigurationNode } from './configuration';
import { ExternalUriOpenerService, IExternalUriOpenerService } from './externalUriOpenerService';

registerSingleton(IExternalUriOpenerService, ExternalUriOpenerService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration(externalUriOpenersConfigurationNode);
