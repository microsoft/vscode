/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITunnelHostService } from '../../../../workbench/contrib/chat/common/tunnelHost.js';
import { WebTunnelHostService } from './webTunnelHostService.js';

registerSingleton(ITunnelHostService, WebTunnelHostService, InstantiationType.Delayed);
