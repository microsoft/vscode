/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindow.css';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IChatWindowService } from './chatWindow.js';
import { ChatWindowService } from './chatWindowService.js';
import './chatWindowLayoutActions.js';

registerSingleton(IChatWindowService, ChatWindowService, InstantiationType.Delayed);
