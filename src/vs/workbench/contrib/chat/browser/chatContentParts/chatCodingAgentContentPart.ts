/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { ICodingAgentHasBegun } from '../../common/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

import './media/chatCodingAgent.css';

export class ChatCodingAgentContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		private readonly session: ICodingAgentHasBegun,
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
	) {
		super();

		this.domNode = dom.$('.coding-agent-session');

		// Create a styled container
		const container = dom.$('.chat-coding-agent-session');
		this.domNode.appendChild(container);

		// Create title with icon
		const titleContainer = dom.$('.coding-agent-title');
		container.appendChild(titleContainer);

		const robotIcon = dom.$('span.codicon.codicon-robot');
		titleContainer.appendChild(robotIcon);

		const titleText = dom.$('span.title-text');
		titleText.textContent = localize('codingAgentStarted', 'Coding Agent Session Started');
		titleContainer.appendChild(titleText);

		// Add open-in-new-editor button
		const openButton = dom.$('button.coding-agent-open-btn');
		openButton.title = localize('openInNewEditor', 'Open in New Editor Window');
		openButton.setAttribute('aria-label', openButton.title);
		openButton.setAttribute('type', 'button');
		openButton.classList.add('monaco-button', 'monaco-text-button');
		const arrowIcon = dom.$('span.codicon.codicon-arrow-top-right');
		openButton.appendChild(arrowIcon);
		openButton.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			// TODO: Implement open in new editor window logic
			console.log('Open coding agent session in new editor window:', this.session);
		};
		titleContainer.appendChild(openButton);

		// Create content
		const contentContainer = dom.$('.coding-agent-content');
		container.appendChild(contentContainer);

		const content = new MarkdownString()
			.appendMarkdown(`**${session.title}**`)
			.appendText(`\n\n`)
			.appendText(session.description);

		if (session.command) {
			content.appendText('\n\n').appendMarkdown(`\`${session.command}\``);
		}

		const result = this._register(renderer.render(content, {
			asyncRenderCallback: () => {
				this._onDidChangeHeight.fire();
			}
		}));

		contentContainer.appendChild(result.element);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'codingAgentSessionBegin' &&
			other.agentId === this.session.agentId &&
			other.jobId === this.session.jobId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
