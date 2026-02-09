/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IChatHookPart } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { HOOK_TYPES, HookTypeValue } from '../../../common/promptSyntax/hookSchema.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import './media/chatHookContentPart.css';

function getHookTypeLabel(hookType: HookTypeValue): string {
	return HOOK_TYPES.find(hook => hook.id === hookType)?.label ?? hookType;
}

export class ChatHookContentPart extends ChatCollapsibleContentPart implements IChatContentPart {

	constructor(
		private readonly hookPart: IChatHookPart,
		context: IChatContentPartRenderContext,
		@IHoverService hoverService: IHoverService,
	) {
		const hookTypeLabel = getHookTypeLabel(hookPart.hookType);
		const isStopped = !!hookPart.stopReason;
		const isWarning = !!hookPart.systemMessage;
		const title = isStopped
			? localize('hook.title.stopped', "Blocked by {0} hook", hookTypeLabel)
			: localize('hook.title.warning', "Warning from {0} hook", hookTypeLabel);

		super(title, context, undefined, hoverService);

		this.icon = isStopped ? Codicon.circleSlash : isWarning ? Codicon.warning : Codicon.check;

		if (isStopped) {
			this.domNode.classList.add('chat-hook-outcome-blocked');
		}

		this.setExpanded(false);
	}

	protected override initContent(): HTMLElement {
		const content = $('.chat-hook-details.chat-used-context-list');

		if (this.hookPart.stopReason) {
			const reasonElement = $('.chat-hook-reason', undefined, this.hookPart.stopReason);
			content.appendChild(reasonElement);
		} else if (this.hookPart.systemMessage) {
			const messageElement = $('.chat-hook-message', undefined, this.hookPart.systemMessage);
			content.appendChild(messageElement);
		}

		return content;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind !== 'hook') {
			return false;
		}
		return other.hookType === this.hookPart.hookType &&
			other.stopReason === this.hookPart.stopReason &&
			other.systemMessage === this.hookPart.systemMessage;
	}
}
