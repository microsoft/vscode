/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ICustomizationMarketplaceService } from './customizationMarketplaceService.js';

export const IPlatformCustomizationMarketplaceService = createDecorator<ICustomizationMarketplaceService>('platformCustomizationMarketplaceService');
