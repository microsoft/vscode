/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ChatTreeItem, ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatModel, ISerializableChatData } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
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

	static readonly ID = ACTION_ID_BRANCH_CHAT_SESSION;

	constructor() {
		super({
			id: BranchChatSessionAction.ID,
			title: localize2('branchChatSession', "Branch Chat"),
			tooltip: localize2('branchChatSessionTooltip', "Branch to new session"),
			icon: Codicon.reply,
			f1: false,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate(),
			),
			menu: [{
				id: MenuId.ChatMessageCheckpoint,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(
					ChatContextKeys.isRequest,
					ChatContextKeys.lockedToCodingAgent.negate(),
				),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const item = args[0] as ChatTreeItem | undefined;
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
		const chatModel = widget.viewModel.model as ChatModel;
		if (!chatModel) {
			return;
		}

		const checkpointRequestId = isRequestVM(item) ? item.id : item.requestId;
		const serializedData = revive(structuredClone(chatModel.toJSON())) as ISerializableChatData;
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
			delete (request as { isHidden?: boolean }).isHidden;
		}

		// If there's no conversation history to branch, don't proceed
		if (serializedData.requests.length === 0) {
			return;
		}

		// Load the branched data into a new session model
		const modelRef = chatService.loadSessionFromContent(serializedData);
		if (!modelRef) {
			return;
		}

		// Open the branched session in the chat view pane
		await widgetService.openSession(modelRef.object.sessionResource, ChatViewPaneTarget);
	}
}
