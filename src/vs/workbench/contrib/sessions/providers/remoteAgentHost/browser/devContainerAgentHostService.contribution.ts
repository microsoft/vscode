/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IDevContainerAgentHostService } from '../../../common/devContainerAgentHostService.js';
import { DevContainerAgentHostService } from './devContainerAgentHostService.js';

// Of the Agents window and of editor windows, whose sessions providers create Dev Container sessions
registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
