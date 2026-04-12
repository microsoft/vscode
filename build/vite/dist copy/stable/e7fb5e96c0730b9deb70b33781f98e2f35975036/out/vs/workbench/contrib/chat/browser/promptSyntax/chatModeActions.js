/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ChatViewId } from '../chat.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
class ConfigAgentActionImpl extends Action2 {
    async run(accessor) {
        const instaService = accessor.get(IInstantiationService);
        const openerService = accessor.get(IOpenerService);
        const pickers = instaService.createInstance(PromptFilePickers);
        const placeholder = localize('configure.agent.prompts.placeholder', "Select the custom agents to open and configure visibility in the agent picker");
        const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.agent, optionEdit: false, optionVisibility: true });
        if (result !== undefined) {
            await openerService.open(result.promptFile);
        }
    }
}
// Separate action `Configure Custom Agents` link in the agent picker.
const PICKER_CONFIGURE_AGENTS_ACTION_ID = 'workbench.action.chat.picker.customagents';
function createPickerConfigureAgentsActionConfig(disabled) {
    const config = {
        id: disabled ? PICKER_CONFIGURE_AGENTS_ACTION_ID + '.disabled' : PICKER_CONFIGURE_AGENTS_ACTION_ID,
        title: localize2('select-agent', "Configure Custom Agents..."),
        tooltip: disabled ? localize('managedByOrganization', "Managed by your organization") : undefined,
        icon: disabled ? Codicon.lock : undefined,
        category: CHAT_CATEGORY,
        f1: false,
        precondition: disabled ? ContextKeyExpr.false() : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate(),
        menu: {
            id: MenuId.ChatModePicker,
            when: disabled ? ChatContextKeys.Modes.agentModeDisabledByPolicy : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate(),
        },
    };
    return config;
}
class PickerConfigAgentAction extends ConfigAgentActionImpl {
    constructor() { super(createPickerConfigureAgentsActionConfig(false)); }
}
class PickerConfigAgentActionDisabled extends ConfigAgentActionImpl {
    constructor() { super(createPickerConfigureAgentsActionConfig(true)); }
}
/**
 * Action ID for the `Configure Custom Agents` action.
 */
const CONFIGURE_AGENTS_ACTION_ID = 'workbench.action.chat.configure.customagents';
function createManageAgentsActionConfig(disabled) {
    const base = {
        id: disabled ? CONFIGURE_AGENTS_ACTION_ID + '.disabled' : CONFIGURE_AGENTS_ACTION_ID,
        title: localize2('configure-agents', "Configure Custom Agents..."),
        shortTitle: localize('configure-agents.short', "Custom Agents"),
        icon: disabled ? Codicon.lock : Codicon.bookmark,
        f1: !disabled,
        precondition: disabled ? ContextKeyExpr.false() : ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.Modes.agentModeDisabledByPolicy.negate()),
        category: CHAT_CATEGORY,
        menu: [
            {
                id: CHAT_CONFIG_MENU_ID,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId), disabled ? ChatContextKeys.Modes.agentModeDisabledByPolicy : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate()),
                order: 10,
                group: '0_level'
            }
        ]
    };
    return disabled ? { ...base, tooltip: localize('managedByOrganization', "Managed by your organization") } : base;
}
class ManageAgentsAction extends ConfigAgentActionImpl {
    constructor() { super(createManageAgentsActionConfig(false)); }
}
class ManageAgentsActionDisabled extends ConfigAgentActionImpl {
    constructor() { super(createManageAgentsActionConfig(true)); }
}
/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export function registerAgentActions() {
    registerAction2(ManageAgentsAction);
    registerAction2(ManageAgentsActionDisabled);
    registerAction2(PickerConfigAgentAction);
    registerAction2(PickerConfigAgentActionDisabled);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9jaGF0TW9kZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN4QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRWpGLE1BQWUscUJBQXNCLFNBQVEsT0FBTztJQUNuQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25ELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUN6RCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxD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