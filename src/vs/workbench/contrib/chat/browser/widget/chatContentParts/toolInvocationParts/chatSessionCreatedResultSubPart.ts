/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatSessionCreatedData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSessionCreatedResult.css';

/**
 * Renders the "Open Session" pill for a completed `create_session` /
 * `create_chat` tool call: a single secondary button — carrying the agent icon
 * and the session title — that opens the created session. The link comes from
 * the tool call's structured {@link IChatSessionCreatedData} (not the model's
 * prose), so it is always present and clickable. Clicking opens the session
 * through the `agent-host-session://` opener — registered in the Agents window
 * and (for editor-window chat) by the workbench.
 */
export class ChatSessionCreatedResultSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly data: IChatSessionCreatedData,
		_context: IChatContentPartRenderContext,
		_renderer: IMarkdownRenderer,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-open-session-result');

		const button = this._register(new Button(this.domNode, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: this.data.label,
		}));
		button.element.classList.add('chat-open-session-button');
		button.label = `$(${this.getIcon().id}) ${this.data.label}`;
		this._register(button.onDidClick(() => {
			this.openerService.open(URI.parse(this.data.openLink), { fromUserGesture: true, allowContributedOpeners: true });
		}));
	}

	protected override getIcon(): ThemeIcon {
		return this.data.isChat ? Codicon.commentDiscussion : Codicon.agent;
	}
}
