/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatTreeItem, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

/**
 * Given the conversation's request ids in display order and the id the user rewound to,
 * returns the ids that must be removed: the target request and every request after it.
 *
 * Mirrors the "rewind" semantics — the selected turn and everything that came after it are
 * discarded, leaving the conversation as it was *before* that turn.
 */
export function getRequestIdsToRewind(orderedRequestIds: readonly string[], targetRequestId: string): string[] {
	const index = orderedRequestIds.indexOf(targetRequestId);
	if (index === -1) {
		return [];
	}
	return orderedRequestIds.slice(index);
}

/**
 * Localized confirmation detail shown before the (irreversible) rewind removes messages.
 */
export function getRewindConfirmationMessage(count: number): string {
	return count === 1
		? localize('chat.rewind.confirm.detail.one', "Rewind will remove 1 message from this conversation. This cannot be undone.")
		: localize('chat.rewind.confirm.detail.other', "Rewind will remove {0} messages from this conversation. This cannot be undone.", count);
}

/**
 * Rewinds the current conversation to a previous turn: the selected request and everything
 * after it are removed from the session in place (unlike Fork, which copies the prefix into a
 * brand new session). Contributed to the per-message checkpoint toolbar next to Fork, and
 * exposed via the `/rewind` slash command.
 */
export class RewindConversationAction extends Action2 {

	static readonly ID = 'workbench.action.chat.rewindConversation';

	constructor() {
		super({
			id: RewindConversationAction.ID,
			title: localize2('chat.rewindConversation.label', "Rewind Conversation"),
			tooltip: localize2('chat.rewindConversation.tooltip', "Rewind conversation to this point"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.discard,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate(),
			),
			menu: [
				{
					id: MenuId.ChatMessageCheckpoint,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(
						ChatContextKeys.isRequest,
						ChatContextKeys.isFirstRequest.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.lockedToCodingAgent.negate(),
							ChatContextKeyExprs.isAgentHostSession,
						),
					),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const dialogService = accessor.get(IDialogService);

		const { sessionResource, targetRequestId } = this._resolveTarget(args, chatWidgetService, chatService);
		if (!sessionResource || !targetRequestId) {
			return;
		}

		const chatModel = chatService.getSession(sessionResource);
		if (!chatModel) {
			return;
		}

		const orderedRequestIds = chatModel.getRequests().map(request => request.id);
		const idsToRewind = getRequestIdsToRewind(orderedRequestIds, targetRequestId);
		if (idsToRewind.length === 0) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('chat.rewind.confirm.title', "Rewind conversation?"),
			detail: getRewindConfirmationMessage(idsToRewind.length),
			primaryButton: localize('chat.rewind.confirm.primary', "Rewind"),
		});
		if (!confirmed) {
			return;
		}

		for (const requestId of idsToRewind) {
			await chatService.removeRequest(sessionResource, requestId);
		}
	}

	private _resolveTarget(args: unknown[], chatWidgetService: IChatWidgetService, chatService: IChatService): { sessionResource: URI | undefined; targetRequestId: string | undefined } {
		// When invoked via the `/rewind` slash command, args[0] is the session URI.
		// With no explicit point, rewind the most recent turn.
		if (URI.isUri(args[0])) {
			const sessionResource = args[0];
			const lastRequest = chatService.getSession(sessionResource)?.getRequests().at(-1);
			return { sessionResource, targetRequestId: lastRequest?.id };
		}

		// When invoked from the checkpoint toolbar, args[0] is (or wraps) a ChatTreeItem.
		const arg = args[0] as { element?: unknown; context?: unknown; item?: unknown } | undefined;
		let item: ChatTreeItem | undefined = isChatTreeItem(arg)
			? arg
			: isChatTreeItem(arg?.element)
				? arg.element
				: isChatTreeItem(arg?.context)
					? arg.context
					: isChatTreeItem(arg?.item)
						? arg.item
						: undefined;
		const widget = (item && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}
		if (!item) {
			return { sessionResource: undefined, targetRequestId: undefined };
		}

		const sessionResource = widget?.viewModel?.sessionResource ?? (isChatTreeItem(item) ? item.sessionResource : undefined);
		const targetRequestId = isRequestVM(item) ? item.id : isResponseVM(item) ? item.requestId : undefined;
		return { sessionResource, targetRequestId };
	}
}
