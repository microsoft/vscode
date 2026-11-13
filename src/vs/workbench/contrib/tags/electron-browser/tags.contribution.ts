/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { WorkspaceTags } from './workspaceTags.js';

// Register Workspace Tags Contribution
registerWorkbenchContribution2(WorkspaceTags.ID, WorkspaceTags, WorkbenchPhase.Eventually);
