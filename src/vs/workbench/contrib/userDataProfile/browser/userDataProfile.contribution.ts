/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { UserDataProfilesWorkbenchContribution } from './userDataProfile.js';
import './userDataProfileActions.js';

registerWorkbenchContribution2(UserDataProfilesWorkbenchContribution.ID, UserDataProfilesWorkbenchContribution, WorkbenchPhase.BlockRestore);
