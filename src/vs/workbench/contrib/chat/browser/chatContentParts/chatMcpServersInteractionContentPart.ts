/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { escapeMarkdownSyntaxTokens, createMarkdownCommandLink, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IAutostartResult, IMcpService } from '../../../mcp/common/mcpTypes.js';
import { startServerAndWaitForLiveTools } from '../../../mcp/common/mcpTypesUtils.js';
import { IChatMcpServersStarting } from '../../common/chatService.js';
import { IChatRendererContent, IChatResponseViewModel, isResponseVM } from '../../common/chatViewModel.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';
import './media/chatMcpServersInteractionContent.css';

export class ChatMcpServersInteractionContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private workingProgressPart: ChatProgressContentPart | undefined;
	private interactionContainer: HTMLElement | undefined;
	private readonly interactionMd = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly showSpecificServersScheduler = this._register(new RunOnceScheduler(() => this.updateDetailedProgress(this.data.state!.get()), 2500));
	private readonly previousParts = new Lazy(() => {
		if (!isResponseVM(this.context.element)) {
			return [];
		}

		return this.context.element.session.getItems()
			.filter((r, i): r is IChatResponseViewModel => isResponseVM(r) && i < this.context.elementIndex)
			.flatMap(i => i.response.value.filter(c => c.kind === 'mcpServersStarting'))
			.map(p => p.state?.get());
	});

	constructor(
		private readonly data: IChatMcpServersStarting,
		private readonly context: IChatContentPartRenderContext,
		@IMcpService private readonly mcpService: IMcpService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.domNode = dom.$('.chat-mcp-servers-interaction');

		// Listen to autostart state changes if available
		if (data.state) {
			this._register(autorun(reader => {
				const state = data.state!.read(reader);
				this.updateForState(state);
			}));
		}
	}

	private updateForState(state: IAutostartResult): void {
		if (!state.working) {
			this.workingProgressPart?.domNode.remove();
			this.workingProgressPart = undefined;
			this.showSpecificServersScheduler.cancel();
		} else if (!this.workingProgressPart) {
			if (!this.showSpecificServersScheduler.isScheduled()) {
				this.showSpecificServersScheduler.schedule();
			}
		} else if (this.workingProgressPart) {
			this.updateDetailedProgress(state);
		}

		const requiringInteraction = state.serversRequiringInteraction.filter(s => {
			// don't note interaction for a server we already started
			if (this.data.didStartServerIds?.includes(s.id)) {
				return false;
			}

			// don't note interaction for a server we previously noted interaction for
			if (this.previousParts.value.some(p => p?.serversRequiringInteraction.some(s2 => s.id === s2.id))) {
				return false;
			}

			return true;
		});

		if (requiringInteraction.length > 0) {
			if (!this.interactionMd.value) {
				this.renderInteractionRequired(requiringInteraction);
			} else {
				this.updateInteractionRequired(this.interactionMd.value.element, requiringInteraction);
			}
		} else if (requiringInteraction.length === 0 && this.interactionContainer) {
			this.interactionContainer.remove();
			this.interactionContainer = undefined;
		}

		this._onDidChangeHeight.fire();
	}

	private createServerCommandLinks(servers: Array<{ id: string; label: string }>): string {
		return servers.map(s => createMarkdownCommandLink({
			title: '`' + escapeMarkdownSyntaxTokens(s.label) + '`',
			id: McpCommandIds.ServerOptions,
			arguments: [s.id],
		}, false)).join(', ');
	}

	private updateDetailedProgress(state: IAutostartResult): void {
		const skipText = createMarkdownCommandLink({
			title: localize('mcp.skip.link', 'Skip?'),
			id: McpCommandIds.SkipCurrentAutostart,
		});

		let content: MarkdownString;
		if (state.starting.length === 0) {
			content = new MarkdownString(undefined, { isTrusted: true }).appendText(localize('mcp.working.mcp', 'Activating MCP extensions...') + ' ').appendMarkdown(skipText);
		} else {
			// Update to show specific server names as command links
			const serverLinks = this.createServerCommandLinks(state.starting);
			content = new MarkdownString(undefined, { isTrusted: true }).appendMarkdown(localize('mcp.starting.servers', 'Starting MCP servers {0}...', serverLinks) + ' ').appendMarkdown(skipText);
		}

		if (this.workingProgressPart) {
			this.workingProgressPart.updateMessage(content);
		} else {
			this.workingProgressPart = this._register(this.instantiationService.createInstance(
				ChatProgressContentPart,
				{ kind: 'progressMessage', content },
				this._markdownRendererService,
				this.context,
				true, // forceShowSpinner
				true, // forceShowMessage
				undefined, // icon
				undefined, // toolInvocation
			));
			this.domNode.appendChild(this.workingProgressPart.domNode);
		}

		this._onDidChangeHeight.fire();
	}

	private renderInteractionRequired(serversRequiringInteraction: Array<{ id: string; label: string; errorMessage?: string }>): void {
		this.interactionContainer = dom.$('.chat-mcp-servers-interaction-hint');

		// Create subtle hint message
		const messageContainer = dom.$('.chat-mcp-servers-message');
		const icon = dom.$('.chat-mcp-servers-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));

		const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);

		messageContainer.appendChild(icon);
		messageContainer.appendChild(messageMd.element);

		this.interactionContainer.appendChild(messageContainer);
		this.domNode.prepend(this.interactionContainer);
	}

	private updateInteractionRequired(oldElement: HTMLElement, serversRequiringInteraction: Array<{ id: string; label: string; errorMessage?: string }>): void {
		const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
		oldElement.replaceWith(messageMd.element);
	}

	private createInteractionMessage(serversRequiringInteraction: Array<{ id: string; label: string; errorMessage?: string }>) {
		const count = serversRequiringInteraction.length;
		const links = this.createServerCommandLinks(serversRequiringInteraction);

		const content = count === 1
			? localize('mcp.start.single', 'The MCP server {0} may have new tools and requires interaction to start. [Start it now?]({1})', links, '#start')
			: localize('mcp.start.multiple', 'The MCP servers {0} may have new tools and require interaction to start. [Start them now?]({1})', links, '#start');
		const str = new MarkdownString(content, { isTrusted: true });
		const messageMd = this.interactionMd.value = this._markdownRendererService.render(str, {
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
			actionHandler: (content) => {
				if (!content.startsWith('command:')) {
					this._start(startLink!);
					return Promise.resolve(true);
				}
				return openLinkFromMarkdown(this._openerService, content, true);
			}
		});

		// eslint-disable-next-line no-restricted-syntax
		const startLink = [...messageMd.element.querySelectorAll('a')].find(a => !a.getAttribute('data-href')?.startsWith('command:'));
		if (!startLink) {
			// Should not happen
			return { messageMd, startLink: undefined };
		}

		startLink.setAttribute('role', 'button');
		startLink.href = '';

		return { messageMd, startLink };
	}

	private async _start(startLink: HTMLElement) {
		// Update to starting state
		startLink.style.pointerEvents = 'none';
		startLink.style.opacity = '0.7';

		try {
			if (!this.data.state) {
				return;
			}

			const state = this.data.state.get();
			const serversToStart = state.serversRequiringInteraction;

			// Start servers in sequence with progress updates
			for (let i = 0; i < serversToStart.length; i++) {
				const serverInfo = serversToStart[i];
				startLink.textContent = localize('mcp.starting', "Starting {0}...", serverInfo.label);
				this._onDidChangeHeight.fire();

				const server = this.mcpService.servers.get().find(s => s.definition.id === serverInfo.id);
				if (server) {
					await startServerAndWaitForLiveTools(server, { promptType: 'all-untrusted' });

					this.data.didStartServerIds ??= [];
					this.data.didStartServerIds.push(serverInfo.id);
				}
			}

			// Remove the interaction container after successful start
			if (this.interactionContainer) {
				this.interactionContainer.remove();
				this.interactionContainer = undefined;
			}
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
		return other.kind === 'mcpServersStarting';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
