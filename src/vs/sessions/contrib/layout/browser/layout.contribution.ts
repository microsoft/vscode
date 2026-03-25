/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionLayoutController } from './sessionLayoutController.js';

registerWorkbenchContribution2(SessionLayoutController.ID, SessionLayoutController, WorkbenchPhase.BlockRestore);
