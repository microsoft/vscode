/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { revive } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/languages';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestTextPart, IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { contentRefUrl } from '../common/annotations';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { h } from 'vs/base/browser/dom';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { showExtensionsWithIdsCommandId } from 'vs/workbench/contrib/extensions/browser/extensionsActions';

const variableRefUrl = 'http://_vscodedecoration_';
const agentRefUrl = 'http://_chatagent_';

export class ChatMarkdownDecorationsRenderer {
	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
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
					text += ` (${part.agent.extensionPublisher})`;
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

	walkTreeAndAnnotateReferenceLinks(element: HTMLElement): void {
		element.querySelectorAll('a').forEach(a => {
			const href = a.getAttribute('data-href');
			if (href) {
				if (href.startsWith(agentRefUrl)) {
					const title = decodeURIComponent(href.slice(agentRefUrl.length + 1));
					a.parentElement!.replaceChild(
						this.renderAgentWidget(a.textContent!, title),
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
	}

	private renderAgentWidget(name: string, id: string): HTMLElement {
		const agent = this.chatAgentService.getAgent(id)!;

		const container = dom.$('span.chat-resource-widget');
		const alias = dom.$('span', undefined, name);

		const hoverElement = h(
			'.chat-agent-hover@root',
			[
				h('.chat-agent-hover-header', [
					h('.chat-agent-hover-icon@icon'),
					h('.chat-agent-hover-details', [
						h('.chat-agent-hover-name@name'),
						h('.chat-agent-hover-extension', [
							h('.chat-agent-hover-extension-name@extensionName'),
							h('.chat-agent-hover-separator@separator'),
							h('.chat-agent-hover-publisher@publisher'),
						]),
					]),
				]),
				h('.chat-agent-hover-description@description'),
			]);

		if (agent.metadata.icon instanceof URI) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(agent.metadata.icon).toString(true);
			hoverElement.icon.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
		} else if (agent.metadata.themeIcon) {
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(agent.metadata.themeIcon));
			hoverElement.icon.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}

		hoverElement.name.textContent = `@${agent.name}`;
		hoverElement.extensionName.textContent = agent.extensionDisplayName;
		hoverElement.separator.textContent = ' | ';
		hoverElement.publisher.textContent = agent.extensionPublisher;

		const description = agent.description && !agent.description.endsWith('.') ?
			`${agent.description}. ` :
			(agent.description || '');
		hoverElement.description.textContent = description;

		const marketplaceLink = document.createElement('a');
		marketplaceLink.setAttribute('href', `command:${showExtensionsWithIdsCommandId}?${encodeURIComponent(JSON.stringify([agent.extensionId.value]))}`);
		marketplaceLink.textContent = localize('marketplaceLabel', "View in Marketplace") + '.';
		hoverElement.description.appendChild(marketplaceLink);

		this.hoverService.setupUpdatableHover(getDefaultHoverDelegate('element'), container, hoverElement.root);
		container.appendChild(alias);
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
