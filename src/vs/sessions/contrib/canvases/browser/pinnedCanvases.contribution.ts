/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IPinnedCanvasService } from './pinnedCanvases.js';
import { PinnedCanvasService } from './pinnedCanvasService.js';

// The sidebar lists pins on every platform; only windows that show canvases can add them.
registerSingleton(IPinnedCanvasService, PinnedCanvasService, InstantiationType.Delayed);
