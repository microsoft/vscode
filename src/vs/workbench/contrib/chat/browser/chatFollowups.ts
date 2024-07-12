/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button, IButtonStyles } from 'vs/base/browser/ui/button/button';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatFollowup } from 'vs/workbench/contrib/chat/common/chatService';

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

		let tooltipPrefix = '';
		if ('agentId' in followup && followup.agentId && followup.agentId !== this.chatAgentService.getDefaultAgent(this.location)?.id) {
			const agent = this.chatAgentService.getAgent(followup.agentId);
			if (!agent) {
				// Refers to agent that doesn't exist
				return;
			}

			tooltipPrefix += `${chatAgentLeader}${agent.name} `;
			if ('subCommand' in followup && followup.subCommand) {
				tooltipPrefix += `${chatSubcommandLeader}${followup.subCommand} `;
			}
		}

		const baseTitle = followup.kind === 'reply' ?
			(followup.title || followup.message)
			: followup.title;
		const message = followup.kind === 'reply' ? followup.message : followup.title;
		const tooltip = (tooltipPrefix +
			('tooltip' in followup && followup.tooltip || message)).trim();
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
