/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SandboxProfileAssignmentsTracker } from '../../../../../platform/agentHost/common/sandboxProfiles.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';

registerWorkbenchContribution2(SandboxProfileAssignmentsTracker.ID, SandboxProfileAssignmentsTracker, WorkbenchPhase.AfterRestored);
