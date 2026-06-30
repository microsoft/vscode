/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAgentHostCustomizationService } from '../../agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatMcpAuthenticationRequired } from '../../../common/chatService/chatService.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import './media/chatMcpServersInteractionContent.css';

export class ChatMcpAuthenticationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly rendered = this._register(new MutableDisposable<IRenderedMarkdown>());

	constructor(
		private readonly data: IChatMcpAuthenticationRequired,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
	) {
		super();
		this.domNode = dom.$('.chat-mcp-servers-interaction');
		this.render();
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => this.updateVisibility()));
		this.updateVisibility();
	}

	private render(): void {
		const container = dom.$('.chat-mcp-servers-interaction-hint');
		const messageContainer = dom.$('.chat-mcp-servers-message');
		const icon = dom.$('.chat-mcp-servers-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));

		const links = this.data.servers
			.map(server => '`' + escapeMarkdownSyntaxTokens(server.name) + '`')
			.join(', ');
		const content = this.data.servers.length === 1
			? localize('mcp.auth.single', 'The MCP server {0} requires authentication. [Authenticate](#authenticate)', links)
			: localize('mcp.auth.multiple', 'The MCP servers {0} require authentication. [Authenticate](#authenticate)', links);
		const rendered = this.rendered.value = this.markdownRendererService.render(new MarkdownString(content, { isTrusted: true }), {
			actionHandler: () => {
				void this.authenticate();
				return Promise.resolve(true);
			},
		});

		messageContainer.appendChild(icon);
		messageContainer.appendChild(rendered.element);
		container.appendChild(messageContainer);
		this.domNode.appendChild(container);
	}

	private async authenticate(): Promise<void> {
		const sessionResource = URI.revive(this.data.sessionResource);
		for (const server of this.data.servers) {
			await this.agentHostCustomizationService.authenticateMcpServer(sessionResource, server.id);
		}
	}

	private updateVisibility(): void {
		const sessionResource = URI.revive(this.data.sessionResource);
		const servers = this.agentHostCustomizationService.getMcpServers(sessionResource);
		const visible = this.data.servers.some(server => servers.some(current => current.id === server.id && current.status === McpServerStatus.AuthRequired));
		this.domNode.style.display = visible ? '' : 'none';
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'mcpAuthenticationRequired';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
