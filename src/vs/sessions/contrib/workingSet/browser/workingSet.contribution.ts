/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionWorkingSetController } from './workingSet.js';

registerWorkbenchContribution2(SessionWorkingSetController.ID, SessionWorkingSetController, WorkbenchPhase.AfterRestored);
