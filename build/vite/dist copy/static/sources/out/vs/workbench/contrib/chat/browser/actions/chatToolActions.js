/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatModeKind } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { ToolsScope } from '../widget/input/chatSelectedTools.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { showToolsPicker } from './chatToolPicker.js';
export const AcceptToolConfirmationActionId = 'workbench.action.chat.acceptTool';
export const SkipToolConfirmationActionId = 'workbench.action.chat.skipTool';
export const AcceptToolPostConfirmationActionId = 'workbench.action.chat.acceptToolPostExecution';
export const SkipToolPostConfirmationActionId = 'workbench.action.chat.skipToolPostExecution';
class ToolConfirmationAction extends Action2 {
    run(accessor, context) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = context?.sessionResource
            ? chatWidgetService.getWidgetBySessionResource(context.sessionResource)
            : chatWidgetService.lastFocusedWidget;
        const lastItem = widget?.viewModel?.getItems().at(-1);
        if (!isResponseVM(lastItem)) {
            return;
        }
        for (const item of lastItem.model.response.value) {
            const state = item.kind === 'toolInvocation' ? item.state.get() : undefined;
            if (state?.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state?.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                state.confirm(this.getReason());
                break;
            }
        }
        // Return focus to the chat input, in case it was in the tool confirmation editor
        widget?.focusInput();
    }
}
class AcceptToolConfirmation extends ToolConfirmationAction {
    constructor() {
        super({
            id: AcceptToolConfirmationActionId,
            title: localize2('chat.accept', "Accept"),
            f1: false,
            category: CHAT_CATEGORY,
            keybinding: {
                when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasToolConfirmation),
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                // Override chatEditor.action.accept
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
            },
        });
    }
    getReason() {
        return { type: 4 /* ToolConfirmKind.UserAction */ };
    }
}
class SkipToolConfirmation extends ToolConfirmationAction {
    constructor() {
        super({
            id: SkipToolConfirmationActionId,
            title: localize2('chat.skip', "Skip"),
            f1: false,
            category: CHAT_CATEGORY,
            keybinding: {
                when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasToolConfirmation),
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */ | 512 /* KeyMod.Alt */,
                // Override chatEditor.action.accept
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
            },
        });
    }
    getReason() {
        return { type: 5 /* ToolConfirmKind.Skipped */ };
    }
}
export class ConfigureToolsAction extends Action2 {
    static { this.ID = 'workbench.action.chat.configureTools'; }
    constructor() {
        super({
            id: ConfigureToolsAction.ID,
            title: localize('label', "Configure Tools..."),
            icon: Codicon.settings,
            f1: false,
            category: CHAT_CATEGORY,
            precondition: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
            menu: [{
                    when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.lockedToCodingAgent.negate()),
                    id: MenuId.ChatInput,
                    group: 'navigation',
                    order: 100,
                }]
        });
    }
    async run(accessor, ...args) {
        const instaService = accessor.get(IInstantiationService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const telemetryService = accessor.get(ITelemetryService);
        let widget = chatWidgetService.lastFocusedWidget;
        if (!widget) {
            widget = this.extractWidget(args);
        }
        if (!widget) {
            return;
        }
        const source = this.extractSource(args) ?? 'chatInput';
        let placeholder;
        let description;
        const { entriesScope, entriesMap } = widget.input.selectedToolsModel;
        switch (entriesScope) {
            case ToolsScope.Session:
                placeholder = localize('chat.tools.placeholder.session', "Select tools for this chat session");
                description = localize('chat.tools.description.session', "The selected tools were configured only for this chat session.");
                break;
            case ToolsScope.Agent:
                placeholder = localize('chat.tools.placeholder.agent', "Select tools for this custom agent");
                description = localize('chat.tools.description.agent', "The selected tools are configured by the '{0}' custom agent. Changes to the tools will be applied to the custom agent file as well.", widget.input.currentModeObs.get().label.get());
                break;
            case ToolsScope.Agent_ReadOnly:
                placeholder = localize('chat.tools.placeholder.readOnlyAgent', "Select tools for this custom agent");
                description = localize('chat.tools.description.readOnlyAgent', "The selected tools are configured by the '{0}' custom agent. Changes to the tools will only be used for this session and will not change the '{0}' custom agent.", widget.input.currentModeObs.get().label.get());
                break;
            case ToolsScope.Global:
                placeholder = localize('chat.tools.placeholder.global', "Select tools that are available to chat.");
                description = localize('chat.tools.description.global', "The selected tools will be applied globally for all chat sessions that use the default agent.");
                break;
        }
        // Create a cancellation token that cancels when the mode changes
        const cts = new CancellationTokenSource();
        const initialMode = widget.input.currentModeObs.get();
        const modeListener = autorun(reader => {
            if (initialMode.id !== widget.input.currentModeObs.read(reader).id) {
                cts.cancel();
            }
        });
        try {
            const result = await instaService.invokeFunction(showToolsPicker, placeholder, source, description, () => entriesMap.get(), widget.input.selectedLanguageModel.get()?.metadata, cts.token);
            if (result) {
                widget.input.selectedToolsModel.set(result, false);
            }
        }
        finally {
            modeListener.dispose();
            cts.dispose();
        }
        const tools = widget.input.selectedToolsModel.entriesMap.get();
        telemetryService.publicLog2('chat/selectedTools', {
            total: tools.size,
            enabled: Iterable.reduce(tools, (prev, [_, enabled]) => enabled ? prev + 1 : prev, 0),
        });
    }
    extractWidget(args) {
        function isChatActionContext(obj) {
            return !!obj && typeof obj === 'object' && !!obj.widget;
        }
        for (const arg of args) {
            if (isChatActionContext(arg)) {
                return arg.widget;
            }
        }
        return undefined;
    }
    extractSource(args) {
        function isChatActionSource(obj) {
            return !!obj && typeof obj === 'object' && !!obj.source;
        }
        for (const arg of args) {
            if (isChatActionSource(arg)) {
                return arg.source;
            }
        }
        return undefined;
    }
}
export function registerChatToolActions() {
    registerAction2(AcceptToolConfirmation);
    registerAction2(SkipToolConfirmation);
    registerAction2(ConfigureToolsAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pELE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2pELE9BQU8s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