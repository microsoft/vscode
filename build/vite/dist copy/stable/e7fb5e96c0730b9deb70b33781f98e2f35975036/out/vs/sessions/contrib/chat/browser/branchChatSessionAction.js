/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { isRequestVM, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { revive } from '../../../../base/common/marshalling.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
/**
 * Action ID for branching chat session to a new local session.
 */
export const ACTION_ID_BRANCH_CHAT_SESSION = 'workbench.action.chat.branchChatSession';
/**
 * Action that allows users to branch the current chat session from a specific checkpoint.
 * This creates a copy of the conversation up to the selected checkpoint, allowing users
 * to explore alternative paths from any point in the conversation.
 */
export class BranchChatSessionAction extends Action2 {
    static { this.ID = ACTION_ID_BRANCH_CHAT_SESSION; }
    constructor() {
        super({
            id: BranchChatSessionAction.ID,
            title: localize2('branchChatSession', "Branch Chat"),
            tooltip: localize2('branchChatSessionTooltip', "Branch to new session"),
            icon: Codicon.reply,
            f1: false,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.requestInProgress.negate()),
            menu: [{
                    id: MenuId.ChatMessageCheckpoint,
                    group: 'navigation',
                    order: 3,
                    when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.lockedToCodingAgent.negate()),
                }]
        });
    }
    async run(accessor, ...args) {
        const item = args[0];
        const widgetService = accessor.get(IChatWidgetService);
        const chatService = accessor.get(IChatService);
        // Item must be a valid request or response from the checkpoint toolbar context
        if (!item || (!isRequestVM(item) && !isResponseVM(item))) {
            return;
        }
        const widget = widgetService.getWidgetBySessionResource(item.sessionResource);
        if (!widget || !widget.viewModel) {
            return;
        }
        // Get the current chat model
        const chatModel = widget.viewModel.model;
        if (!chatModel) {
            return;
        }
        const checkpointRequestId = isRequestVM(item) ? item.id : item.requestId;
        const serializedData = revive(structuredClone(chatModel.toJSON()));
        serializedData.sessionId = generateUuid();
        delete serializedData.customTitle;
        const checkpointIndex = serializedData.requests.findIndex(r => r.requestId === checkpointRequestId);
        if (checkpointIndex === -1) {
            return;
        }
        serializedData.requests = serializedData.requests.slice(0, checkpointIndex);
        // Clear shouldBeRemovedOnSend for all requests in the branched session
        // This ensures all requests are visible in the new session
        for (const request of serializedData.requests) {
            delete request.shouldBeRemovedOnSend;
            delete request.isHidden;
        }
        // If there's no conversation history to branch, don't proceed
        if (serializedData.requests.length === 0) {
            return;
        }
        // Load the branched data into a new session model
        const modelRef = chatService.loadSessionFromData(serializedData);
        // Open the branched session in the chat view pane
        await widgetService.openSession(modelRef.object.sessionResource, ChatViewPaneTarget);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhbmNoQ2hhdFNlc3Npb25BY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9icmFuY2hDaGF0U2Vzc2lvbkFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDL0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFnQixrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTFILE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDN0csT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUdwRzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLHlDQUF5QyxDQUFDO0FBRXZGOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsT0FBTzthQUVuQyxPQUFFLEdBQUcsNkJBQTZCLENBQUM7SUFFbkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsdUJBQXVCLENBQUMsRUFBRTtZQUM5QixLQUFLLEVBQUUsU0FBUyxDQUFDLG1CQUFtQixFQUFF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