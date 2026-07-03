/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { BlockedSessionsService, IBlockedSessionsService } from './blockedSessionsService.js';

// The blocked-sessions UI is surfaced by the sessions titlebar widget
// (see `contrib/sessions/browser/sessionsTitleBarWidget.ts`), which consumes this
// service. Here we only register the detection service itself.
registerSingleton(IBlockedSessionsService, BlockedSessionsService, InstantiationType.Delayed);
