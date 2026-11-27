/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { agentsModeEnabledConfiguration } from '../browser/agents/agentsModeWorkspaceService.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(agentsModeEnabledConfiguration);
