/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentVariableService } from './environmentVariableService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEnvironmentVariableService } from './environmentVariable.js';

registerSingleton(IEnvironmentVariableService, EnvironmentVariableService, InstantiationType.Delayed);
