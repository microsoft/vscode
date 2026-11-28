/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentsModeService, NullAgentsModeService } from '../common/agentsMode.js';

// Web windows and the Agents window can't switch into Agents mode. The desktop editor window's main creates its service.
registerSingleton(IAgentsModeService, NullAgentsModeService, InstantiationType.Delayed);
