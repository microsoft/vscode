/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, CustomizationMarketplaceChannelClient } from '../common/customizationMarketplaceIpc.js';
import { IAgentFinderMarketplaceService } from '../common/customizationMarketplaceService.js';

registerSharedProcessRemoteService(IAgentFinderMarketplaceService, CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, { channelClientCtor: CustomizationMarketplaceChannelClient });
