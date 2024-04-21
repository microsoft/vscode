/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { h } from 'vs/base/browser/dom';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { CancellationToken } from 'vs/base/common/cancellation';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { verifiedPublisherIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';

export class ChatAgentHover {
	public readonly domNode: HTMLElement;

	constructor(
		id: string,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IExtensionsWorkbenchService private readonly extensionService: IExtensionsWorkbenchService,
	) {
		const agent = this.chatAgentService.getAgent(id)!;

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
		this.domNode = hoverElement.root;

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
		hoverElement.separator.textContent = '|';

		const verifiedBadge = dom.$('span.extension-verified-publisher', undefined, renderIcon(verifiedPublisherIcon));
		verifiedBadge.style.display = 'none';
		dom.append(
			hoverElement.publisher,
			verifiedBadge,
			agent.extensionPublisher);


		const description = agent.description && !agent.description.endsWith('.') ?
			`${agent.description}. ` :
			(agent.description || '');
		hoverElement.description.textContent = description;

		// const marketplaceLink = document.createElement('a');
		// marketplaceLink.setAttribute('href', `command:${showExtensionsWithIdsCommandId}?${encodeURIComponent(JSON.stringify([agent.extensionId.value]))}`);
		// marketplaceLink.textContent = localize('marketplaceLabel', "View in Marketplace") + '.';
		// hoverElement.description.appendChild(marketplaceLink);

		this.extensionService.getExtensions([{ id: agent.extensionId.value }], CancellationToken.None).then(extensions => {
			const extension = extensions[0];
			if (extension?.publisherDomain?.verified) {
				verifiedBadge.style.display = '';
			}
		});
	}
}
