/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../workbench/contrib/sessions/common/sessionChangesStatsCache.js';

// The session services are implemented in modules that do not register themselves, so that a window loads them only
// when its entry point imports this module.
registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
