/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { LayoutController } from './layoutController.js';

registerWorkbenchContribution2(LayoutController.ID, LayoutController, WorkbenchPhase.BlockRestore);
