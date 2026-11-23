/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { CustomViewService } from './customViewService.js';

registerSingleton(ICustomViewService, CustomViewService, InstantiationType.Delayed);
