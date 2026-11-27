/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { ToggleAgentsModeAction } from '../../browser/agentSessions/agentsModeActions.js';
import { AgentsModeContribution } from './agentsModeContribution.js';

registerWorkbenchContribution2(AgentsModeContribution.ID, AgentsModeContribution, WorkbenchPhase.BlockRestore);

registerAction2(ToggleAgentsModeAction);
