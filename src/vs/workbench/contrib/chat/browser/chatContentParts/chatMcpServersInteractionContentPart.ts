/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MarkdownRenderer, openLinkFromMarkdown } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { startServerAndWaitForLiveTools } from '../../../mcp/common/mcpTypesUtils.js';
import { IChatMcpServersInteractionRequired } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import './media/chatMcpServersInteractionContent.css';

export class ChatMcpServersInteractionContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		private readonly data: IChatMcpServersInteractionRequired,
		@IMcpService private readonly mcpService: IMcpService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();

		this.domNode = dom.$('.chat-mcp-servers-interaction');
		if (!data.isDone) {
			this.render();
		}
	}

	private render(): void {
		const container = dom.$('.chat-mcp-servers-interaction-hint');

		// Create subtle hint message
		const messageContainer = dom.$('.chat-mcp-servers-message');
		const icon = dom.$('.chat-mcp-servers-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));

		const count = this.data.servers.length;

		const markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		const links = this.data.servers.map(s => markdownCommandLink({
			title: '`' + s.serverLabel + '`',
			id: McpCommandIds.ServerOptions,
			arguments: [s.serverId],
		}, false)).join(', ');

		const content = count === 1
			? localize('mcp.start.single', 'The MCP server {0} may have new tools and requires interaction to start. [Start it now?]({1})', links, '#start')
			: localize('mcp.start.multiple', 'The MCP servers {0} may have new tools and require interaction to start. [Start them now?]({1})', links, '#start');
		const str = new MarkdownString(content, { isTrusted: true });
		const messageMd = markdownRenderer.render(str, {
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
			actionHandler: (content) => {
				if (!content.startsWith('command:')) {
					this._start(startLink!);
					return Promise.resolve(true);
				}
				return openLinkFromMarkdown(this._openerService, content, true);
			}
		});

		const startLink = [...messageMd.element.querySelectorAll('a')].find(a => !a.getAttribute('data-href')?.startsWith('command:'));
		if (!startLink) {
			// Should not happen
			return;
		}

		startLink.setAttribute('role', 'button');
		startLink.href = '';

		messageContainer.appendChild(icon);
		messageContainer.appendChild(messageMd.element);

		container.appendChild(messageContainer);
		this.domNode.appendChild(container);
	}

	private async _start(startLink: HTMLElement) {

		// Update to starting state
		startLink.style.pointerEvents = 'none';
		startLink.style.opacity = '0.7';

		try {
			// Start servers in sequence with progress updates
			for (let i = 0; i < this.data.servers.length; i++) {
				const serverInfo = this.data.servers[i];
				startLink.textContent = localize('mcp.starting', "Starting {0}...", serverInfo.serverLabel);
				this._onDidChangeHeight.fire();

				const server = this.mcpService.servers.get().find(s => s.definition.id === serverInfo.serverId);
				if (server) {
					await startServerAndWaitForLiveTools(server, { promptType: 'all-untrusted' });
				}
			}

			// Remove the component after successful start
			this.data.isDone = true;
			this.domNode.remove();
		} catch (error) {
			// Reset link on error
			startLink.style.pointerEvents = '';
			startLink.style.opacity = '';
			startLink.textContent = 'Start now?';
		} finally {
			this._onDidChangeHeight.fire();
		}
	}

	hasSameContent(other: IChatRendererContent): boolean {
		// Simple implementation that checks if it's the same type
		// eslint-disable-next-line local/code-no-any-casts
		return (other as any).kind === 'mcpServersInteractionRequired';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
