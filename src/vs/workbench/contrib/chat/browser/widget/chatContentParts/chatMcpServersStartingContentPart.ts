/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { createPixelSpinner, IPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { createMarkdownCommandLink, escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatMcpServersStartingSlow, IChatMcpStartingServer } from '../../../common/chatService/chatService.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatTreeItem } from '../../chat.js';
import { CustomizationMigrationCategoryId } from '../../aiCustomization/customizationMigrationCategories.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import './media/chatMcpServersInteractionContent.css';

/**
 * Renders a lightweight "Starting MCP servers …" progress hint for agent-host
 * sessions. The set of servers still starting is driven by the observable on
 * {@link IChatMcpServersStartingSlow.servers}; when it empties (all servers
 * started, content began arriving, or the turn ended) the part hides itself.
 * When migration is enabled, eligible servers include a link to the migration
 * review page.
 */
export class ChatMcpServersStartingContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly rendered = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly spinner = this._register(new MutableDisposable<IPixelSpinner>());
	private reviewLink: HTMLAnchorElement | undefined;
	private hadStartingServers = false;
	private didNotifyFinished = false;

	constructor(
		private readonly data: IChatMcpServersStartingSlow,
		private readonly options: {
			readonly createSpinner?: typeof createPixelSpinner;
			readonly showSpinner?: boolean;
			readonly onDidFinishStarting?: () => void;
		} | undefined,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this.domNode = dom.$('.chat-mcp-servers-interaction');
		this._register(autorun(reader => {
			this.render(this.data.servers.read(reader), this.data.serversNeedingMigration.read(reader));
		}));
	}

	private render(servers: readonly IChatMcpStartingServer[], serversNeedingMigration: readonly IChatMcpStartingServer[]): void {
		const restoreReviewLinkFocus = this.reviewLink?.ownerDocument.activeElement === this.reviewLink;
		this.reviewLink = undefined;
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
		if (!serversNeedingMigration.length) {
			this._renderMessage(new MarkdownString(localize('mcp.starting.servers', 'Starting MCP servers {0}...', links)), restoreReviewLinkFocus);
			return;
		}

		const reviewLink = createMarkdownCommandLink({
			id: AICustomizationManagementCommands.OpenEditor,
			text: localize('mcp.migration.review', "Review migrations"),
			tooltip: localize('mcp.migration.review.tooltip', "Open MCP Server Migration Review"),
			arguments: [{ migration: true, migrationCategory: CustomizationMigrationCategoryId.McpServers }],
		});
		const content = localize('mcp.starting.servers.migration', 'Starting MCP servers {0}... Some servers need migration. {1}', links, reviewLink);
		this._renderMessage(new MarkdownString(content, {
			isTrusted: { enabledCommands: [AICustomizationManagementCommands.OpenEditor] },
		}), restoreReviewLinkFocus);
	}

	private _renderMessage(content: MarkdownString, restoreReviewLinkFocus: boolean): void {
		const container = dom.$('.chat-mcp-servers-interaction-hint');
		const messageContainer = dom.$('.chat-mcp-servers-message');
		if (this.options?.showSpinner !== false) {
			const iconElement = dom.$('.chat-mcp-servers-icon');
			this.spinner.value = (this.options?.createSpinner ?? createPixelSpinner)(iconElement);
			messageContainer.appendChild(iconElement);
		}

		const rendered = this.rendered.value = this.markdownRendererService.render(content);
		// eslint-disable-next-line no-restricted-syntax
		this.reviewLink = rendered.element.querySelector('a') ?? undefined;
		messageContainer.appendChild(rendered.element);
		container.appendChild(messageContainer);
		this.domNode.appendChild(container);
		if (restoreReviewLinkFocus) {
			this.reviewLink?.focus();
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'mcpServersStartingSlow';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
