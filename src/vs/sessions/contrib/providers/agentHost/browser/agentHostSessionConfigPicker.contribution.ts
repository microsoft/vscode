/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AgentHostSessionConfigPickerContribution, registerAgentHostSessionConfigPickerActions } from '../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostSessionConfigPicker.js';

registerAgentHostSessionConfigPickerActions();

registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
