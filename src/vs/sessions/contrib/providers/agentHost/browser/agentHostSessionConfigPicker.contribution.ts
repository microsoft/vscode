/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AgentHostSessionConfigPickerContribution, NewSessionApprovePickerAction, NewSessionCodexApprovalsPickerAction, NewSessionModePickerAction, NewSessionPermissionModePickerAction, RunningSessionCodexApprovalsPickerAction, RunningSessionConfigPickerAction, RunningSessionModePickerAction, RunningSessionPermissionModePickerAction } from '../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostSessionConfigPicker.js';

registerAction2(NewSessionApprovePickerAction);
registerAction2(NewSessionPermissionModePickerAction);
registerAction2(NewSessionCodexApprovalsPickerAction);
registerAction2(NewSessionModePickerAction);
registerAction2(RunningSessionConfigPickerAction);
registerAction2(RunningSessionPermissionModePickerAction);
registerAction2(RunningSessionCodexApprovalsPickerAction);
registerAction2(RunningSessionModePickerAction);

registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
