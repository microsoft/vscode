/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './inlineChatDefaultModel.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InlineChatController } from './inlineChatController.js';
import * as InlineChatActions from './inlineChatActions.js';
import { CTX_INLINE_CHAT_EDITING, CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, MENU_INLINE_CHAT_WIDGET_STATUS } from '../common/inlineChat.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { InlineChatNotebookContribution } from './inlineChatNotebook.js';
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatEnabler, InlineChatEscapeToolContribution, InlineChatSessionServiceImpl } from './inlineChatSessionServiceImpl.js';
import { IInlineChatHistoryService, InlineChatHistoryService } from './inlineChatHistoryService.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { CancelAction, ChatSubmitAction } from '../../chat/browser/actions/chatExecuteActions.js';
import { localize } from '../../../../nls.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InlineChatAccessibilityHelp } from './inlineChatAccessibilityHelp.js';
registerEditorContribution(InlineChatController.ID, InlineChatController, 0 /* EditorContributionInstantiation.Eager */); // EAGER because of notebook dispose/create of editors
registerAction2(InlineChatActions.KeepSessionAction2);
registerAction2(InlineChatActions.UndoSessionAction2);
registerAction2(InlineChatActions.UndoAndCloseSessionAction2);
registerAction2(InlineChatActions.CancelSessionAction);
registerAction2(InlineChatActions.ContinueInlineChatInChatViewAction);
registerAction2(InlineChatActions.RephraseInlineChatSessionAction);
// --- browser
registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, 1 /* InstantiationType.Delayed */);
registerSingleton(IInlineChatHistoryService, InlineChatHistoryService, 1 /* InstantiationType.Delayed */);
// --- MENU special ---
const editActionMenuItem = {
    group: '0_main',
    order: 0,
    command: {
        id: ChatSubmitAction.ID,
        title: localize('send.edit', "Edit Code"),
    },
    when: ContextKeyExpr.and(ChatContextKeys.inputHasText, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(), CTX_INLINE_CHAT_EDITING, CTX_INLINE_CHAT_V1_ENABLED),
};
const generateActionMenuItem = {
    group: '0_main',
    order: 0,
    command: {
        id: ChatSubmitAction.ID,
        title: localize('send.generate', "Generate"),
    },
    when: ContextKeyExpr.and(ChatContextKeys.inputHasText, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(), CTX_INLINE_CHAT_EDITING.toNegated(), CTX_INLINE_CHAT_V1_ENABLED),
};
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, editActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, generateActionMenuItem);
const cancelActionMenuItem = {
    group: '0_main',
    order: 0,
    command: {
        id: CancelAction.ID,
        title: localize('cancel', "Cancel Request"),
        shortTitle: localize('cancelShort', "Cancel"),
    },
    when: ContextKeyExpr.and(CTX_INLINE_CHAT_REQUEST_IN_PROGRESS),
};
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, cancelActionMenuItem);
// --- actions ---
registerAction2(InlineChatActions.StartSessionAction);
registerAction2(InlineChatActions.AskInChatAction);
registerAction2(InlineChatActions.FocusInlineChat);
registerAction2(InlineChatActions.SubmitInlineChatInputAction);
registerAction2(InlineChatActions.QueueInChatAction);
registerAction2(InlineChatActions.HideInlineChatInputAction);
registerAction2(InlineChatActions.FixDiagnosticsAction);
registerAction2(InlineChatActions.DismissEditorAffordanceAction);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, 3 /* LifecyclePhase.Restored */);
registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(InlineChatEscapeToolContribution.Id, InlineChatEscapeToolContribution, 3 /* WorkbenchPhase.AfterRestored */);
AccessibleViewRegistry.register(new InlineChatAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUVyQyxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0gsT0FBTyxFQUFhLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNqRSxPQUFPLEtBQUssaUJBQWlCLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLDBCQUEwQixFQUFFLG1DQUFtQyxFQUFFLDhCQUE4QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDbkssT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RSxPQUFPLEVBQW1DLDhCQUE4QixFQUFFLFVBQVUsSUFBSSxtQkFBbUIsRUFBa0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0SyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZ0NBQWdDLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0SSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUM5RyxPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFL0UsMEJBQTBCLENBQUMsb0JBQW9CLENBQUMsRUFBRSxFQUFFLG9CQUFvQixnREFBd0MsQ0FBQyxDQUFDLHNEQUFzRDtBQUV4SyxlQUFlLENBQUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUN0RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUN0RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUM5RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUN2RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsa0NBQWtDLENBQUMsQ0FBQztBQUN0RSxlQUFlLENBQUMsaUJBQWlCLENBQUMsK0JBQStCLENBQUMsQ0FBQztBQUVuRSxjQUFjO0FBRWQsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsNEJBQTRCLG9DQUE0QixDQUFDO0FBQ3RHLGlCQUFpQixDQUFDLHlCQUF5QixFQUFFLHdCQUF3QixvQ0FBNEIsQ0FBQztBQUVsRyx1QkFBdUI7QUFFdkIsTUFBTSxrQkFBa0IsR0FBYztJQUNyQyxLQUFLLEVBQUUsUUFBUTtJQUNmLEtBQUssRUFBRSxDQUFDO0lBQ1IsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLGdCQUFnQixDQUFDLEVBQUU7UUFDdkIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDO0tBQ3pDO0lBQ0QsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQ3ZCLGVBQWUsQ0FBQyxZQUFZLEVBQzVCLG1DQUFtQyxDQUFDLFNBQVMsRUFBRSxFQUMvQyx1QkFBdUIsRUFDdkIsMEJBQTBCLENBQzFCO0NBQ0QsQ0FBQztBQUVGLE1BQU0sc0JBQXNCLEdBQWM7SUFDekMsS0FBSyxFQUFFLFFBQVE7SUFDZixLQUFLLEVBQUUsQ0FBQztJQUNSLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFO1FBQ3ZCLEtBQUssRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQztLQUM1QztJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUN2QixlQUFlLENBQUMsWUFBWSxFQUM1QixtQ0FBbUMsQ0FBQyxTQUFTLEVBQUUsRUFDL0MsdUJBQXVCLENBQUMsU0FBUyxFQUFFLEVBQ25DLDBCQUEwQixDQUMxQjtDQUNELENBQUM7QUFFRixZQUFZLENBQUMsY0FBYyxDQUFDLDhCQUE4QixFQUFFLGtCQUFrQixDQUFDLENBQUM7QUFDaEYsWUFBWSxDQUFDLGNBQWMsQ0FBQyw4QkFBOEIsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO0FBRXBGLE1BQU0sb0JBQW9CLEdBQWM7SUFDdkMsS0FBSyxFQUFFLFFBQVE7SUFDZixLQUFLLEVBQUUsQ0FBQztJQUNSLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxZQUFZLENBQUMsRUFBRTtRQUNuQixLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQztRQUMzQyxVQUFVLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUM7S0FDN0M7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FDdkIsbUNBQW1DLENBQ25DO0NBQ0QsQ0FBQztBQUVGLFlBQVksQ0FBQyxjQUFjLENBQUMsOEJBQThCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztBQUlsRixrQkFBa0I7QUFFbEIsZUFBZSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDdEQsZUFBZSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ25ELGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUNuRCxlQUFlLENBQUMsaUJBQWlCLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUMvRCxlQUFlLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUNyRCxlQUFlLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM3RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN4RCxlQUFlLENBQUMsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUdqRSxNQUFNLDhCQUE4QixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQWtDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ25ILDhCQUE4QixDQUFDLDZCQUE2QixDQUFDLDhCQUE4QixrQ0FBMEIsQ0FBQztBQUV0SCw4QkFBOEIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLHVDQUErQixDQUFDO0FBQ3RHLDhCQUE4QixDQUFDLGdDQUFnQyxDQUFDLEVBQUUsRUFBRSxnQ0FBZ0MsdUNBQStCLENBQUM7QUFDcEksc0JBQXNCLENBQUMsUUFBUSxDQUFDLElBQUksMkJBQTJCLEVBQUUsQ0FBQyxDQUFDIn0=