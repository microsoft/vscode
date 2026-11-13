/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { FolderLocationWorkingSetsContribution } from './folderLocationWorkingSets.js';

// Registered from the workbench entry point only: the Agents window keeps its own per-session editor sets.
registerWorkbenchContribution2(FolderLocationWorkingSetsContribution.ID, FolderLocationWorkingSetsContribution, WorkbenchPhase.AfterRestored);
