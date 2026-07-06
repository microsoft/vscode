/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAgentHostCustomizationService } from '../../agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatMcpAuthenticationRequired, IChatMcpAuthenticationRequiredServer } from '../../../common/chatService/chatService.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import './media/chatMcpServersInteractionContent.css';

export class ChatMcpAuthenticationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly rendered = this._register(new MutableDisposable<IRenderedMarkdown>());

	/**
	 * Whether this part was ever shown. Used to distinguish the initial empty
	 * state (the part is emitted with an empty `servers` observable that is
	 * populated immediately after) from the terminal state where every server
	 * has been authenticated — only the latter marks the part
	 * {@link IChatMcpAuthenticationRequired.isUsed used}.
	 */
	private _hasBeenVisible = false;

	/**
	 * The MCP server currently being authenticated, or `undefined` when idle.
	 * While set, the part shows an "Authenticating …" progress message for that
	 * server and stays visible regardless of the underlying auth-required state.
	 */
	private readonly _authenticating = observableValue<IChatMcpAuthenticationRequiredServer | undefined>(this, undefined);

	constructor(
		private readonly data: IChatMcpAuthenticationRequired,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
	) {
		super();
		this.domNode = dom.$('.chat-mcp-servers-interaction');
		// Re-render whenever the set of servers requiring auth changes — e.g. a
		// server whose auth requirement surfaced after this part was first shown
		// is pushed into the same observable by the session handler — or while a
		// server is actively being authenticated.
		this._register(autorun(reader => {
			const servers = this.data.servers.read(reader);
			const authenticating = this._authenticating.read(reader);
			this.render(servers, authenticating);
			this.updateVisibility(servers, authenticating);
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => this.updateVisibility(this.data.servers.get(), this._authenticating.get())));
	}

	private render(servers: readonly IChatMcpAuthenticationRequiredServer[], authenticating: IChatMcpAuthenticationRequiredServer | undefined): void {
		dom.clearNode(this.domNode);
		this.rendered.clear();

		if (authenticating) {
			this._renderMessage(
				ThemeIcon.modify(Codicon.loading, 'spin'),
				localize('mcp.auth.authenticating', 'Authenticating {0}...', '`' + escapeMarkdownSyntaxTokens(authenticating.name) + '`'),
			);
			return;
		}

		if (!servers.length) {
			return;
		}

		const links = servers
			.map(server => '`' + escapeMarkdownSyntaxTokens(server.name) + '`')
			.join(', ');
		const content = servers.length === 1
			? localize('mcp.auth.single', 'The MCP server {0} requires authentication. [Authenticate](#authenticate)?', links)
			: localize('mcp.auth.multiple', 'The MCP servers {0} require authentication. [Authenticate](#authenticate)?', links);
		this._renderMessage(Codicon.mcp, content, { href: '#authenticate', run: () => void this.authenticate() });
	}

	private _renderMessage(icon: ThemeIcon, content: string, action?: { href: string; run: () => void }): void {
		const container = dom.$('.chat-mcp-servers-interaction-hint');
		const messageContainer = dom.$('.chat-mcp-servers-message');
		const iconElement = dom.$('.chat-mcp-servers-icon');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));

		const rendered = this.rendered.value = this.markdownRendererService.render(new MarkdownString(content, { isTrusted: true }), action ? {
			actionHandler: (href: string) => {
				// Only the dedicated authenticate link triggers auth; ignore any
				// other link target so the handler stays scoped to this control.
				if (href !== action.href) {
					return Promise.resolve(false);
				}
				action.run();
				return Promise.resolve(true);
			},
		} : undefined);

		messageContainer.appendChild(iconElement);
		messageContainer.appendChild(rendered.element);
		container.appendChild(messageContainer);
		this.domNode.appendChild(container);

		if (action) {
			// Present the authenticate link as a button for assistive technology
			// and clear its href so it doesn't behave like a navigable link.
			// eslint-disable-next-line no-restricted-syntax
			const actionLink = rendered.element.querySelector<HTMLAnchorElement>(`a[data-href="${action.href}"]`);
			if (actionLink) {
				actionLink.setAttribute('role', 'button');
				actionLink.href = '';
			}
		}
	}

	private async authenticate(): Promise<void> {
		const sessionResource = URI.revive(this.data.sessionResource);
		try {
			for (const server of this.data.servers.get()) {
				this._authenticating.set(server, undefined);
				await this.agentHostCustomizationService.authenticateMcpServer(sessionResource, server.id);
			}
		} finally {
			this._authenticating.set(undefined, undefined);
		}
	}

	private updateVisibility(dataServers: readonly IChatMcpAuthenticationRequiredServer[], authenticating: IChatMcpAuthenticationRequiredServer | undefined): void {
		// Stay visible while actively authenticating so the progress message is shown.
		if (authenticating) {
			this.domNode.style.display = '';
			this._hasBeenVisible = true;
			return;
		}
		const sessionResource = URI.revive(this.data.sessionResource);
		const servers = this.agentHostCustomizationService.getMcpServers(sessionResource);
		const visible = dataServers.some(server => servers.some(current => current.id === server.id && current.status === McpServerStatus.AuthRequired));
		this.domNode.style.display = visible ? '' : 'none';
		if (visible) {
			this._hasBeenVisible = true;
		} else if (this._hasBeenVisible) {
			// Every server has been authenticated. Mark this part used so a
			// subsequent auth requirement surfaces as a fresh prompt rather than
			// silently reusing this now-hidden one.
			this.data.isUsed = true;
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'mcpAuthenticationRequired';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
