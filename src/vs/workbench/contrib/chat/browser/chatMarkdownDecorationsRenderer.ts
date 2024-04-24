/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/languages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { ChatAgentHover } from 'vs/workbench/contrib/chat/browser/chatAgentHover';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestTextPart, IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { contentRefUrl } from '../common/annotations';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';

const variableRefUrl = 'http://_vscodedecoration_';
const agentRefUrl = 'http://_chatagent_';

export class ChatMarkdownDecorationsRenderer {
	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
	) { }

	convertParsedRequestToMarkdown(parsedRequest: IParsedChatRequest): string {
		let result = '';
		for (const part of parsedRequest.parts) {
			if (part instanceof ChatRequestTextPart) {
				result += part.text;
			} else if (part instanceof ChatRequestAgentPart) {
				let text = part.text;
				const isDupe = this.chatAgentService.getAgentsByName(part.agent.name).length > 1;
				if (isDupe) {
					text += ` (${part.agent.extensionPublisherDisplayName})`;
				}

				result += `[${text}](${agentRefUrl}?${encodeURIComponent(part.agent.id)})`;
			} else {
				const uri = part instanceof ChatRequestDynamicVariablePart && part.data.map(d => d.value).find((d): d is URI => d instanceof URI)
					|| undefined;
				const title = uri ? encodeURIComponent(this.labelService.getUriLabel(uri, { relative: true })) :
					part instanceof ChatRequestAgentPart ? part.agent.id :
						'';

				const text = part.text;
				result += `[${text}](${variableRefUrl}?${title})`;
			}
		}

		return result;
	}

	walkTreeAndAnnotateReferenceLinks(element: HTMLElement): IDisposable {
		const store = new DisposableStore();
		element.querySelectorAll('a').forEach(a => {
			const href = a.getAttribute('data-href');
			if (href) {
				if (href.startsWith(agentRefUrl)) {
					const title = decodeURIComponent(href.slice(agentRefUrl.length + 1));
					a.parentElement!.replaceChild(
						this.renderAgentWidget(a.textContent!, title, store),
						a);
				} else if (href.startsWith(variableRefUrl)) {
					const title = decodeURIComponent(href.slice(variableRefUrl.length + 1));
					a.parentElement!.replaceChild(
						this.renderResourceWidget(a.textContent!, title),
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

	private renderAgentWidget(name: string, id: string, store: DisposableStore): HTMLElement {
		const container = dom.$('span.chat-resource-widget', undefined, dom.$('span', undefined, name));

		store.add(this.hoverService.setupUpdatableHover(getDefaultHoverDelegate('element'), container, () => {
			const hover = store.add(this.instantiationService.createInstance(ChatAgentHover));
			hover.setAgent(id);
			return hover.domNode;
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


	private renderResourceWidget(name: string, title: string): HTMLElement {
		const container = dom.$('span.chat-resource-widget');
		const alias = dom.$('span', undefined, name);
		alias.title = title;
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
