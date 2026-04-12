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
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { asCssVariable } from '../../../../../../platform/theme/common/colorUtils.js';
import { contentRefUrl } from '../../../common/widget/annotations.js';
import { getFullyQualifiedId, IChatAgentNameService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../common/widget/chatColors.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, chatSubcommandLeader } from '../../../common/requestParser/chatParserTypes.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from '../chatAgentHover.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { InlineAnchorWidget } from './chatInlineAnchorWidget.js';
/** For rendering slash commands, variables */
const decorationRefUrl = `http://_vscodedecoration_`;
/** For rendering agent decorations with hover */
const agentRefUrl = `http://_chatagent_`;
/** For rendering agent decorations with hover */
const agentSlashRefUrl = `http://_chatslash_`;
export function agentToMarkdown(agent, sessionResource, isClickable, accessor) {
    const chatAgentNameService = accessor.get(IChatAgentNameService);
    const chatAgentService = accessor.get(IChatAgentService);
    const isAllowed = chatAgentNameService.getAgentNameRestriction(agent);
    let name = `${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
    const isDupe = isAllowed && chatAgentService.agentHasDupeName(agent.id);
    if (isDupe) {
        name += ` (${agent.publisherDisplayName})`;
    }
    const args = { agentId: agent.id, sessionResource, name, isClickable };
    return `[${agent.name}](${agentRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
}
export function agentSlashCommandToMarkdown(agent, command, sessionResource) {
    const text = `${chatSubcommandLeader}${command.name}`;
    const args = { agentId: agent.id, command: command.name, sessionResource };
    return `[${text}](${agentSlashRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
}
let ChatMarkdownDecorationsRenderer = class ChatMarkdownDecorationsRenderer {
    constructor(keybindingService, logService, chatAgentService, instantiationService, hoverService, chatService, chatWidgetService, commandService, labelService, toolsService, chatMarkdownAnchorService) {
        this.keybindingService = keybindingService;
        this.logService = logService;
        this.chatAgentService = chatAgentService;
        this.instantiationService = instantiationService;
        this.hoverService = hoverService;
        this.chatService = chatService;
        this.chatWidgetService = chatWidgetService;
        this.commandService = commandService;
        this.labelService = labelService;
        this.toolsService = toolsService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    }
    convertParsedRequestToMarkdown(sessionResource, parsedRequest) {
        let result = '';
        for (const part of parsedRequest.parts) {
            if (part instanceof ChatRequestTextPart) {
                result += part.text;
            }
            else if (part instanceof ChatRequestAgentPart) {
                result += this.instantiationService.invokeFunction(accessor => agentToMarkdown(part.agent, sessionResource, false, accessor));
            }
            else {
                result += this.genericDecorationToMarkdown(part);
            }
        }
        return result;
    }
    genericDecorationToMarkdown(part) {
        const uri = part instanceof ChatRequestDynamicVariablePart && part.data instanceof URI ?
            part.data :
            undefined;
        const title = uri ? this.labelService.getUriLabel(uri, { relative: true }) :
            part instanceof ChatRequestSlashCommandPart ? part.slashCommand.detail :
                part instanceof ChatRequestAgentSubcommandPart ? part.command.description :
                    part instanceof ChatRequestSlashPromptPart ? part.name :
                        part instanceof ChatRequestToolPart ? (this.toolsService.getTool(part.toolId)?.userDescription) :
                            '';
        const args = { title };
        const text = part.text;
        return `[${text}](${decorationRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
    }
    walkTreeAndAnnotateReferenceLinks(content, element) {
        const store = new DisposableStore();
        // eslint-disable-next-line no-restricted-syntax
        element.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('data-href');
            if (href) {
                if (href.startsWith(agentRefUrl)) {
                    let args;
                    try {
                        args = JSON.parse(decodeURIComponent(href.slice(agentRefUrl.length + 1)));
                    }
                    catch (e) {
                        this.logService.error('Invalid chat widget render data JSON', toErrorMessage(e));
                    }
                    if (args) {
                        a.replaceWith(this.renderAgentWidget(args, store));
                    }
                }
                else if (href.startsWith(agentSlashRefUrl)) {
                    let args;
                    try {
                        args = JSON.parse(decodeURIComponent(href.slice(agentRefUrl.length + 1)));
                    }
                    catch (e) {
                        this.logService.error('Invalid chat slash command render data JSON', toErrorMessage(e));
                    }
                    if (args) {
                        a.replaceWith(this.renderSlashCommandWidget(a.textContent, args, store));
                    }
                }
                else if (href.startsWith(decorationRefUrl)) {
                    let args;
                    try {
                        args = JSON.parse(decodeURIComponent(href.slice(decorationRefUrl.length + 1)));
                    }
                    catch (e) { }
                    a.replaceWith(this.renderResourceWidget(a.textContent, args, store));
                }
                else if (href.startsWith(contentRefUrl)) {
                    this.renderFileWidget(content, href, a, store);
                }
                else if (href.startsWith('command:')) {
                    this.injectKeybindingHint(a, href, this.keybindingService);
                }
            }
        });
        return store;
    }
    renderAgentWidget(args, store) {
        const nameWithLeader = `${chatAgentLeader}${args.name}`;
        let container;
        if (args.isClickable) {
            container = dom.$('span.chat-agent-widget');
            const button = store.add(new Button(container, {
                buttonBackground: asCssVariable(chatSlashCommandBackground),
                buttonForeground: asCssVariable(chatSlashCommandForeground),
                buttonHoverBackground: undefined
            }));
            button.label = nameWithLeader;
            store.add(button.onDidClick(() => {
                const agent = this.chatAgentService.getAgent(args.agentId);
                const widget = this.chatWidgetService.getWidgetBySessionResource(args.sessionResource) || this.chatWidgetService.lastFocusedWidget;
                if (!widget || !agent) {
                    return;
                }
                this.chatService.sendRequest(widget.viewModel.sessionResource, agent.metadata.sampleRequest ?? '', {
                    location: widget.location,
                    agentId: agent.id,
                    userSelectedModelId: widget.input.currentLanguageModel,
                    modeInfo: widget.input.currentModeInfo
                });
            }));
        }
        else {
            container = this.renderResourceWidget(nameWithLeader, undefined, store);
        }
        const agent = this.chatAgentService.getAgent(args.agentId);
        const hover = new Lazy(() => store.add(this.instantiationService.createInstance(ChatAgentHover)));
        store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, () => {
            hover.value.setAgent(args.agentId);
            return hover.value.domNode;
        }, agent && getChatAgentHoverOptions(() => agent, this.commandService)));
        return container;
    }
    renderSlashCommandWidget(name, args, store) {
        const container = dom.$('span.chat-agent-widget.chat-command-widget');
        const agent = this.chatAgentService.getAgent(args.agentId);
        const button = store.add(new Button(container, {
            buttonBackground: asCssVariable(chatSlashCommandBackground),
            buttonForeground: asCssVariable(chatSlashCommandForeground),
            buttonHoverBackground: undefined
        }));
        button.label = name;
        store.add(button.onDidClick(() => {
            const widget = this.chatWidgetService.getWidgetBySessionResource(args.sessionResource) || this.chatWidgetService.lastFocusedWidget;
            if (!widget || !agent) {
                return;
            }
            const command = agent.slashCommands.find(c => c.name === args.command);
            this.chatService.sendRequest(widget.viewModel.sessionResource, command?.sampleRequest ?? '', {
                location: widget.location,
                agentId: agent.id,
                slashCommand: args.command,
                userSelectedModelId: widget.input.currentLanguageModel,
                modeInfo: widget.input.currentModeInfo
            });
        }));
        return container;
    }
    renderFileWidget(content, href, a, store) {
        // TODO this can be a nicer FileLabel widget with an icon. Do a simple link for now.
        const fullUri = URI.parse(href);
        const data = content.inlineReferences?.[fullUri.path.slice(1)];
        if (!data) {
            this.logService.error('Invalid chat widget render data JSON');
            return;
        }
        const inlineAnchor = store.add(this.instantiationService.createInstance(InlineAnchorWidget, a, data, undefined));
        store.add(this.chatMarkdownAnchorService.register(inlineAnchor));
    }
    renderResourceWidget(name, args, store) {
        const container = dom.$('span.chat-resource-widget');
        const alias = dom.$('span', undefined, name);
        if (args?.title) {
            store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, args.title));
        }
        container.appendChild(alias);
        return container;
    }
    injectKeybindingHint(a, href, keybindingService) {
        const command = href.match(/command:([^\)]+)/)?.[1];
        if (command) {
            a.textContent = keybindingService.appendKeybinding(a.textContent || '', command);
        }
    }
};
ChatMarkdownDecorationsRenderer = __decorate([
    __param(0, IKeybindingService),
    __param(1, ILogService),
    __param(2, IChatAgentService),
    __param(3, IInstantiationService),
    __param(4, IHoverService),
    __param(5, IChatService),
    __param(6, IChatWidgetService),
    __param(7, ICommandService),
    __param(8, ILabelService),
    __param(9, ILanguageModelToolsService),
    __param(10, IChatMarkdownAnchorService)
], ChatMarkdownDecorationsRenderer);
export { ChatMarkdownDecorationsRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duRGVjb3JhdGlvbnNSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSxrRUFBa0UsQ0FBQztBQUMzSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0s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