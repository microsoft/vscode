/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../../../workbench/contrib/sessions/common/sessionActivityBarActivityService.js';

registerSingleton(ISessionActivityBarActivityService, SessionActivityBarActivityService, InstantiationType.Delayed);
