/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, CustomizationMarketplaceChannelClient, IPublicCustomizationMarketplaceService } from '../common/customizationMarketplaceIpc.js';
registerSharedProcessRemoteService(IPublicCustomizationMarketplaceService, CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, { channelClientCtor: CustomizationMarketplaceChannelClient });
