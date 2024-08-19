/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/languages';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { asCssVariable } from 'vs/platform/theme/common/colorUtils';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentHover, getChatAgentHoverOptions } from 'vs/workbench/contrib/chat/browser/chatAgentHover';
import { getFullyQualifiedId, IChatAgentCommand, IChatAgentData, IChatAgentNameService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatSlashCommandBackground, chatSlashCommandForeground } from 'vs/workbench/contrib/chat/common/chatColors';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestVariablePart, chatSubcommandLeader, IParsedChatRequest, IParsedChatRequestPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { contentRefUrl } from '../common/annotations';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { ILanguageModelToolsService } from 'vs/workbench/contrib/chat/common/languageModelToolsService';

/** For rendering slash commands, variables */
const decorationRefUrl = `http://_vscodedecoration_`;

/** For rendering agent decorations with hover */
const agentRefUrl = `http://_chatagent_`;

/** For rendering agent decorations with hover */
const agentSlashRefUrl = `http://_chatslash_`;

export function agentToMarkdown(agent: IChatAgentData, isClickable: boolean, accessor: ServicesAccessor): string {
	const chatAgentNameService = accessor.get(IChatAgentNameService);
	const chatAgentService = accessor.get(IChatAgentService);

	const isAllowed = chatAgentNameService.getAgentNameRestriction(agent);
	let name = `${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
	const isDupe = isAllowed && chatAgentService.agentHasDupeName(agent.id);
	if (isDupe) {
		name += ` (${agent.publisherDisplayName})`;
	}

	const args: IAgentWidgetArgs = { agentId: agent.id, name, isClickable };
	return `[${agent.name}](${agentRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
}

interface IAgentWidgetArgs {
	agentId: string;
	name: string;
	isClickable?: boolean;
}

export function agentSlashCommandToMarkdown(agent: IChatAgentData, command: IChatAgentCommand): string {
	const text = `${chatSubcommandLeader}${command.name}`;
	const args: ISlashCommandWidgetArgs = { agentId: agent.id, command: command.name };
	return `[${text}](${agentSlashRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
}

interface ISlashCommandWidgetArgs {
	agentId: string;
	command: string;
}

interface IDecorationWidgetArgs {
	title?: string;
}

export class ChatMarkdownDecorationsRenderer {
	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) { }

	convertParsedRequestToMarkdown(parsedRequest: IParsedChatRequest): string {
		let result = '';
		for (const part of parsedRequest.parts) {
			if (part instanceof ChatRequestTextPart) {
				result += part.text;
			} else if (part instanceof ChatRequestAgentPart) {
				result += this.instantiationService.invokeFunction(accessor => agentToMarkdown(part.agent, false, accessor));
			} else {
				result += this.genericDecorationToMarkdown(part);
			}
		}

		return result;
	}

	private genericDecorationToMarkdown(part: IParsedChatRequestPart): string {
		const uri = part instanceof ChatRequestDynamicVariablePart && part.data instanceof URI ?
			part.data :
			undefined;
		const title = uri ? this.labelService.getUriLabel(uri, { relative: true }) :
			part instanceof ChatRequestSlashCommandPart ? part.slashCommand.detail :
				part instanceof ChatRequestAgentSubcommandPart ? part.command.description :
					part instanceof ChatRequestVariablePart ? (this.chatVariablesService.getVariable(part.variableName)?.description) :
						part instanceof ChatRequestToolPart ? (this.toolsService.getTool(part.toolId)?.userDescription) :
							'';

		const args: IDecorationWidgetArgs = { title };
		const text = part.text;
		return `[${text}](${decorationRefUrl}?${encodeURIComponent(JSON.stringify(args))})`;
	}

	walkTreeAndAnnotateReferenceLinks(element: HTMLElement): IDisposable {
		const store = new DisposableStore();
		element.querySelectorAll('a').forEach(a => {
			const href = a.getAttribute('data-href');
			if (href) {
				if (href.startsWith(agentRefUrl)) {
					let args: IAgentWidgetArgs | undefined;
					try {
						args = JSON.parse(decodeURIComponent(href.slice(agentRefUrl.length + 1)));
					} catch (e) {
						this.logService.error('Invalid chat widget render data JSON', toErrorMessage(e));
					}

					if (args) {
						a.parentElement!.replaceChild(
							this.renderAgentWidget(args, store),
							a);
					}
				} else if (href.startsWith(agentSlashRefUrl)) {
					let args: ISlashCommandWidgetArgs | undefined;
					try {
						args = JSON.parse(decodeURIComponent(href.slice(agentRefUrl.length + 1)));
					} catch (e) {
						this.logService.error('Invalid chat slash command render data JSON', toErrorMessage(e));
					}

					if (args) {
						a.parentElement!.replaceChild(
							this.renderSlashCommandWidget(a.textContent!, args, store),
							a);
					}
				} else if (href.startsWith(decorationRefUrl)) {
					let args: IDecorationWidgetArgs | undefined;
					try {
						args = JSON.parse(decodeURIComponent(href.slice(decorationRefUrl.length + 1)));
					} catch (e) { }

					a.parentElement!.replaceChild(
						this.renderResourceWidget(a.textContent!, args, store),
						a);
				} else if (href.startsWith(contentRefUrl)) {
					this.renderFileWidget(href, a);
				} else if (href.startsWith('command:')) {
					this.injectKeybindingHint(a, href, this.keybindingService);
				}
			}
		});

		return store;
	}

	private renderAgentWidget(args: IAgentWidgetArgs, store: DisposableStore): HTMLElement {
		const nameWithLeader = `${chatAgentLeader}${args.name}`;
		let container: HTMLElement;
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
				const widget = this.chatWidgetService.lastFocusedWidget;
				if (!widget || !agent) {
					return;
				}

				this.chatService.sendRequest(widget.viewModel!.sessionId, agent.metadata.sampleRequest ?? '', { location: widget.location, agentId: agent.id });
			}));
		} else {
			container = this.renderResourceWidget(nameWithLeader, undefined, store);
		}

		const agent = this.chatAgentService.getAgent(args.agentId);
		const hover: Lazy<ChatAgentHover> = new Lazy(() => store.add(this.instantiationService.createInstance(ChatAgentHover)));
		store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, () => {
			hover.value.setAgent(args.agentId);
			return hover.value.domNode;
		}, agent && getChatAgentHoverOptions(() => agent, this.commandService)));
		return container;
	}

	private renderSlashCommandWidget(name: string, args: ISlashCommandWidgetArgs, store: DisposableStore): HTMLElement {
		const container = dom.$('span.chat-agent-widget.chat-command-widget');
		const agent = this.chatAgentService.getAgent(args.agentId);
		const button = store.add(new Button(container, {
			buttonBackground: asCssVariable(chatSlashCommandBackground),
			buttonForeground: asCssVariable(chatSlashCommandForeground),
			buttonHoverBackground: undefined
		}));
		button.label = name;
		store.add(button.onDidClick(() => {
			const widget = this.chatWidgetService.lastFocusedWidget;
			if (!widget || !agent) {
				return;
			}

			const command = agent.slashCommands.find(c => c.name === args.command);
			this.chatService.sendRequest(widget.viewModel!.sessionId, command?.sampleRequest ?? '', { location: widget.location, agentId: agent.id, slashCommand: args.command });
		}));

		return container;
	}

	private renderFileWidget(href: string, a: HTMLAnchorElement): void {
		// TODO this can be a nicer FileLabel widget with an icon. Do a simple link for now.
		const fullUri = URI.parse(href);
		let location: Location | { uri: URI; range: undefined };
		try {
			location = revive(JSON.parse(fullUri.fragment));
		} catch (err) {
			this.logService.error('Invalid chat widget render data JSON', toErrorMessage(err));
			return;
		}

		if (!location.uri || !URI.isUri(location.uri)) {
			this.logService.error(`Invalid chat widget render data: ${fullUri.fragment}`);
			return;
		}

		const fragment = location.range ? `${location.range.startLineNumber}-${location.range.endLineNumber}` : '';
		a.setAttribute('data-href', location.uri.with({ fragment }).toString());

		const label = this.labelService.getUriLabel(location.uri, { relative: true });
		a.title = location.range ?
			`${label}#${location.range.startLineNumber}-${location.range.endLineNumber}` :
			label;
	}


	private renderResourceWidget(name: string, args: IDecorationWidgetArgs | undefined, store: DisposableStore): HTMLElement {
		const container = dom.$('span.chat-resource-widget');
		const alias = dom.$('span', undefined, name);
		if (args?.title) {
			store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, args.title));
		}

		container.appendChild(alias);
		return container;
	}


	private injectKeybindingHint(a: HTMLAnchorElement, href: string, keybindingService: IKeybindingService): void {
		const command = href.match(/command:([^\)]+)/)?.[1];
		if (command) {
			const kb = keybindingService.lookupKeybinding(command);
			if (kb) {
				const keybinding = kb.getLabel();
				if (keybinding) {
					a.textContent = `${a.textContent} (${keybinding})`;
				}
			}
		}
	}
}
