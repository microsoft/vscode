/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { DebugService } from './debugService.js';
import { IDebugService } from '../common/debug.js';
import { IDebugVisualizerService, DebugVisualizerService } from '../common/debugVisualizers.js';

registerSingleton(IDebugService, DebugService, InstantiationType.Delayed);
registerSingleton(IDebugVisualizerService, DebugVisualizerService, InstantiationType.Delayed);
