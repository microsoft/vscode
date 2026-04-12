/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IImageResizeService } from '../../../../platform/imageResize/common/imageResizeService.js';
import { ImageResizeService } from '../../../../platform/imageResize/browser/imageResizeService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

registerSingleton(IImageResizeService, ImageResizeService, InstantiationType.Delayed);
