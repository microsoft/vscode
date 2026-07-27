/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { createPixelSpinner, IPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatMcpServersStartingSlow, IChatMcpStartingServer } from '../../../common/chatService/chatService.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import './media/chatMcpServersInteractionContent.css';

/**
 * Renders a lightweight "Starting MCP servers …" progress hint for agent-host
 * sessions. The set of servers still starting is driven by the observable on
 * {@link IChatMcpServersStartingSlow.servers}; when it empties (all servers
 * started, content began arriving, or the turn ended) the part hides itself.
 * There is no interactive affordance — this is a progress indicator only.
 */
export class ChatMcpServersStartingContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly rendered = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly spinner = this._register(new MutableDisposable<IPixelSpinner>());
	private hadStartingServers = false;
	private didNotifyFinished = false;

	constructor(
		private readonly data: IChatMcpServersStartingSlow,
		private readonly options: {
			readonly createSpinner?: typeof createPixelSpinner;
			readonly onDidFinishStarting?: () => void;
		} | undefined,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this.domNode = dom.$('.chat-mcp-servers-interaction');
		this._register(autorun(reader => {
			this.render(this.data.servers.read(reader));
		}));
	}

	private render(servers: readonly IChatMcpStartingServer[]): void {
		dom.clearNode(this.domNode);
		this.rendered.clear();
		this.spinner.clear();

		if (!servers.length) {
			this.domNode.style.display = 'none';
			if (this.hadStartingServers && !this.didNotifyFinished) {
				this.didNotifyFinished = true;
				this.options?.onDidFinishStarting?.();
			}
			return;
		}
		this.hadStartingServers = true;
		this.domNode.style.display = '';

		const links = servers
			.map(server => '`' + escapeMarkdownSyntaxTokens(server.name) + '`')
			.join(', ');
		this._renderMessage(
			localize('mcp.starting.servers', 'Starting MCP servers {0}...', links),
		);
	}

	private _renderMessage(content: string): void {
		const container = dom.$('.chat-mcp-servers-interaction-hint');
		const messageContainer = dom.$('.chat-mcp-servers-message');
		const iconElement = dom.$('.chat-mcp-servers-icon');
		this.spinner.value = (this.options?.createSpinner ?? createPixelSpinner)(iconElement);

		const rendered = this.rendered.value = this.markdownRendererService.render(new MarkdownString(content));
		messageContainer.appendChild(iconElement);
		messageContainer.appendChild(rendered.element);
		container.appendChild(messageContainer);
		this.domNode.appendChild(container);
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'mcpServersStartingSlow';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
