/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button, IButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { formatChatQuestion } from '../common/chatParserTypes.js';
import { IChatFollowup } from '../common/chatService.js';
import { ChatAgentLocation } from '../common/constants.js';

const $ = dom.$;

export class ChatFollowups<T extends IChatFollowup> extends Disposable {
	constructor(
		container: HTMLElement,
		followups: T[],
		private readonly location: ChatAgentLocation,
		private readonly options: IButtonStyles | undefined,
		private readonly clickHandler: (followup: T) => void,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();

		const followupsContainer = dom.append(container, $('.interactive-session-followups'));
		followups.forEach(followup => this.renderFollowup(followupsContainer, followup));
	}

	private renderFollowup(container: HTMLElement, followup: T): void {

		if (!this.chatAgentService.getDefaultAgent(this.location)) {
			// No default agent yet, which affects how followups are rendered, so can't render this yet
			return;
		}

		const tooltipPrefix = formatChatQuestion(this.chatAgentService, this.location, '', followup.agentId, followup.subCommand);
		if (tooltipPrefix === undefined) {
			return;
		}

		const baseTitle = followup.kind === 'reply' ?
			(followup.title || followup.message)
			: followup.title;
		const message = followup.kind === 'reply' ? followup.message : followup.title;
		const tooltip = (tooltipPrefix +
			(followup.tooltip || message)).trim();
		const button = this._register(new Button(container, { ...this.options, title: tooltip }));
		if (followup.kind === 'reply') {
			button.element.classList.add('interactive-followup-reply');
		} else if (followup.kind === 'command') {
			button.element.classList.add('interactive-followup-command');
		}
		button.element.ariaLabel = localize('followUpAriaLabel', "Follow up question: {0}", baseTitle);
		button.label = new MarkdownString(baseTitle);

		this._register(button.onDidClick(() => this.clickHandler(followup)));
	}
}
