/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { createPixelSpinner, IPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
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
 */
export class ChatMcpServersStartingContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly rendered = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly spinner = this._register(new MutableDisposable<IPixelSpinner>());
	private skipAction: HTMLAnchorElement | undefined;
	private hadStartingServers = false;
	private didNotifyFinished = false;

	constructor(
		private readonly data: IChatMcpServersStartingSlow,
		private readonly options: {
			readonly createSpinner?: typeof createPixelSpinner;
			readonly showSpinner?: boolean;
			readonly onDidFinishStarting?: () => void;
			readonly onDidRemoveFocusedAction?: () => void;
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
		const actionHadFocus = !!this.skipAction && dom.isActiveElement(this.skipAction);
		this.skipAction = undefined;
		dom.clearNode(this.domNode);
		this.rendered.clear();
		this.spinner.clear();

		if (!servers.length) {
			this.domNode.style.display = 'none';
			if (actionHadFocus) {
				this.options?.onDidRemoveFocusedAction?.();
			}
			if (this.hadStartingServers && !this.didNotifyFinished) {
				this.didNotifyFinished = true;
				this.options?.onDidFinishStarting?.();
			}
			return;
		}
		this.hadStartingServers = true;
		this.domNode.style.display = '';

		const blockingServers = servers.filter(server => server.blocking);
		const backgroundableServers = blockingServers.filter(server => server.background !== undefined);
		const visibleServers = blockingServers.length ? blockingServers : servers;
		const links = visibleServers
			.map(server => '`' + escapeMarkdownSyntaxTokens(server.name) + '`')
			.join(', ');
		this.skipAction = this._renderMessage(
			blockingServers.length
				? localize('mcp.waiting.for.servers', 'Waiting for MCP servers {0}...', links)
				: localize('mcp.starting.servers', 'Starting MCP servers {0}...', links),
			backgroundableServers,
		);
		if (actionHadFocus) {
			if (this.skipAction) {
				this.skipAction.focus();
			} else {
				this.options?.onDidRemoveFocusedAction?.();
			}
		}
	}

	private _renderMessage(content: string, backgroundableServers: readonly IChatMcpStartingServer[]): HTMLAnchorElement | undefined {
		const container = dom.$('.chat-mcp-servers-interaction-hint');
		const messageContainer = dom.$('.chat-mcp-servers-message');
		if (this.options?.showSpinner !== false) {
			const iconElement = dom.$('.chat-mcp-servers-icon');
			this.spinner.value = (this.options?.createSpinner ?? createPixelSpinner)(iconElement);
			messageContainer.appendChild(iconElement);
		}

		if (backgroundableServers.length) {
			content = localize('mcp.starting.withSkip', "{0} [Skip](#skip)", content);
		}
		let skipping = false;
		const rendered = this.rendered.value = this.markdownRendererService.render(new MarkdownString(content), {
			actionHandler: async href => {
				if (href !== '#skip' || skipping) {
					return;
				}
				skipping = true;
				const results = await Promise.allSettled(backgroundableServers.map(server => Promise.resolve().then(() => server.background!())));
				skipping = false;
				for (const result of results) {
					if (result.status === 'rejected') {
						onUnexpectedError(result.reason);
					}
				}
			},
		});
		messageContainer.appendChild(rendered.element);
		container.appendChild(messageContainer);
		this.domNode.appendChild(container);
		// eslint-disable-next-line no-restricted-syntax -- The markdown renderer owns the Skip anchor.
		return rendered.element.querySelector<HTMLAnchorElement>('a[data-href="#skip"]') ?? undefined;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'mcpServersStartingSlow';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
