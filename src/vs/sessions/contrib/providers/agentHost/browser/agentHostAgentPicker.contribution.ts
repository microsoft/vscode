/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AgentHostAgentPickerAction, AgentHostAgentPickerContribution, AgentHostAgentPickerKeybindingContext, OPEN_AGENT_HOST_AGENT_PICKER_COMMAND_ID, openActiveAgentHostAgentPicker } from '../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostAgentPicker.js';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: OPEN_AGENT_HOST_AGENT_PICKER_COMMAND_ID,
	weight: KeybindingWeight.EditorContrib + 1,
	when: AgentHostAgentPickerKeybindingContext,
	primary: KeyMod.CtrlCmd | KeyCode.Period,
	handler: () => openActiveAgentHostAgentPicker(),
});

registerAction2(AgentHostAgentPickerAction);

registerWorkbenchContribution2(AgentHostAgentPickerContribution.ID, AgentHostAgentPickerContribution, WorkbenchPhase.AfterRestored);
