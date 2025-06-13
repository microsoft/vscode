/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { InvalidPolicyBannerContribution } from './invalidPolicy.js';

registerWorkbenchContribution2(InvalidPolicyBannerContribution.ID, InvalidPolicyBannerContribution, WorkbenchPhase.AfterRestored);
