/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, createMarkdownCommandLink, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { startServerAndWaitForLiveTools } from '../../../../mcp/common/mcpTypesUtils.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';
import './media/chatMcpServersInteractionContent.css';
let ChatMcpServersInteractionContentPart = class ChatMcpServersInteractionContentPart extends Disposable {
    constructor(data, context, mcpService, instantiationService, _openerService, _markdownRendererService) {
        super();
        this.data = data;
        this.context = context;
        this.mcpService = mcpService;
        this.instantiationService = instantiationService;
        this._openerService = _openerService;
        this._markdownRendererService = _markdownRendererService;
        this.interactionMd = this._register(new MutableDisposable());
        this.showSpecificServersScheduler = this._register(new RunOnceScheduler(() => this.updateDetailedProgress(this.data.state.get()), 2500));
        this.previousParts = new Lazy(() => {
            if (!isResponseVM(this.context.element)) {
                return [];
            }
            return this.context.element.session.getItems()
                .filter((r, i) => isResponseVM(r) && i < this.context.elementIndex)
                .flatMap(i => i.response.value.filter(c => c.kind === 'mcpServersStarting'))
                .map(p => p.state?.get());
        });
        this.domNode = dom.$('.chat-mcp-servers-interaction');
        // Listen to autostart state changes if available
        if (data.state) {
            this._register(autorun(reader => {
                const state = data.state.read(reader);
                this.updateForState(state);
            }));
        }
    }
    updateForState(state) {
        if (!state.working) {
            this.workingProgressPart?.domNode.remove();
            this.workingProgressPart = undefined;
            this.showSpecificServersScheduler.cancel();
        }
        else if (!this.workingProgressPart) {
            if (!this.showSpecificServersScheduler.isScheduled()) {
                this.showSpecificServersScheduler.schedule();
            }
        }
        else if (this.workingProgressPart) {
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
            }
            else {
                this.updateInteractionRequired(this.interactionMd.value.element, requiringInteraction);
            }
        }
        else if (requiringInteraction.length === 0 && this.interactionContainer) {
            this.interactionContainer.remove();
            this.interactionContainer = undefined;
        }
    }
    createServerCommandLinks(servers) {
        return servers.map(s => createMarkdownCommandLink({
            text: '`' + escapeMarkdownSyntaxTokens(s.label) + '`',
            id: "workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */,
            arguments: [s.id],
            tooltip: localize('mcp.server.options.tooltip', 'Show options for {0}', s.label),
        }, false)).join(', ');
    }
    updateDetailedProgress(state) {
        const skipText = createMarkdownCommandLink({
            text: localize('mcp.skip.link', 'Skip?'),
            id: "workbench.mcp.skipAutostart" /* McpCommandIds.SkipCurrentAutostart */,
            tooltip: localize('mcp.skip.tooltip', 'Skip starting this MCP server'),
        });
        let content;
        if (state.starting.length === 0) {
            content = new MarkdownString(undefined, { isTrusted: true }).appendText(localize('mcp.working.mcp', 'Activating MCP extensions...') + ' ').appendMarkdown(skipText);
        }
        else {
            // Update to show specific server names as command links
            const serverLinks = this.createServerCommandLinks(state.starting);
            content = new MarkdownString(undefined, { isTrusted: true }).appendMarkdown(localize('mcp.starting.servers', 'Starting MCP servers {0}...', serverLinks) + ' ').appendMarkdown(skipText);
        }
        if (this.workingProgressPart) {
            this.workingProgressPart.updateMessage(content);
        }
        else {
            this.workingProgressPart = this._register(this.instantiationService.createInstance(ChatProgressContentPart, { kind: 'progressMessage', content }, this._markdownRendererService, this.context, true, // forceShowSpinner
            true, // forceShowMessage
            undefined, // icon
            undefined, // toolInvocation
            false));
            this.domNode.appendChild(this.workingProgressPart.domNode);
        }
    }
    renderInteractionRequired(serversRequiringInteraction) {
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
    updateInteractionRequired(oldElement, serversRequiringInteraction) {
        const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
        oldElement.replaceWith(messageMd.element);
    }
    createInteractionMessage(serversRequiringInteraction) {
        const count = serversRequiringInteraction.length;
        const links = this.createServerCommandLinks(serversRequiringInteraction);
        const content = count === 1
            ? localize('mcp.start.single', 'The MCP server {0} may have new tools and requires interaction to start. [Start it now?]({1})', links, '#start')
            : localize('mcp.start.multiple', 'The MCP servers {0} may have new tools and require interaction to start. [Start them now?]({1})', links, '#start');
        const str = new MarkdownString(content, { isTrusted: true });
        const messageMd = this.interactionMd.value = this._markdownRendererService.render(str, {
            actionHandler: (content) => {
                if (!content.startsWith('command:')) {
                    this._start(startLink);
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
    async _start(startLink) {
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
        }
        catch (error) {
            // Reset link on error
            startLink.style.pointerEvents = '';
            startLink.style.opacity = '';
            startLink.textContent = 'Start now?';
        }
    }
    hasSameContent(other) {
        // Simple implementation that checks if it's the same type
        return other.kind === 'mcpServersStarting';
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatMcpServersInteractionContentPart = __decorate([
    __param(2, IMcpService),
    __param(3, IInstantiationService),
    __param(4, IOpenerService),
    __param(5, IMarkdownRendererService)
], ChatMcpServersInteractionContentPart);
export { ChatMcpServersInteractionContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNY3BTZXJ2ZXJzSW50ZXJhY3Rpb25Db250ZW50UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUseUJBQXlCLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckksT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRWpJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFcEYsT0FBTyxFQUFvQixXQUFXLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuRixPQUFPLEVBQUUs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