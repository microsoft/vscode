/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { StealthShadowsContribution } from './stealthShadows.js';
import '../common/stealthShadowsConfiguration.js';

// Stealth Shadows contribution
registerWorkbenchContribution2(StealthShadowsContribution.ID, StealthShadowsContribution, WorkbenchPhase.AfterRestored);
