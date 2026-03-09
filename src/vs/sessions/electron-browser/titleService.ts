/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';
import { ITitleService } from '../../workbench/services/title/browser/titleService.js';
import { NativeTitleService } from './parts/titlebarPart.js';

registerSingleton(ITitleService, NativeTitleService, InstantiationType.Eager);
