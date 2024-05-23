/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { h } from 'vs/base/browser/dom';
import { IUpdatableHoverOptions } from 'vs/base/browser/ui/hover/hover';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { getFullyQualifiedId, IChatAgentData, IChatAgentNameService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { showExtensionsWithIdsCommandId } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { verifiedPublisherIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';

export class ChatAgentHover extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly icon: HTMLElement;
	private readonly name: HTMLElement;
	private readonly extensionName: HTMLElement;
	private readonly publisherName: HTMLElement;
	private readonly description: HTMLElement;

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IExtensionsWorkbenchService private readonly extensionService: IExtensionsWorkbenchService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();

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
				h('.chat-agent-hover-warning@warning'),
				h('span.chat-agent-hover-description@description'),
			]);
		this.domNode = hoverElement.root;

		this.icon = hoverElement.icon;
		this.name = hoverElement.name;
		this.extensionName = hoverElement.extensionName;
		this.description = hoverElement.description;

		hoverElement.separator.textContent = '|';

		const verifiedBadge = dom.$('span.extension-verified-publisher', undefined, renderIcon(verifiedPublisherIcon));

		this.publisherName = dom.$('span.chat-agent-hover-publisher-name');
		dom.append(
			hoverElement.publisher,
			verifiedBadge,
			this.publisherName);

		hoverElement.warning.appendChild(renderIcon(Codicon.warning));
		hoverElement.warning.appendChild(dom.$('span', undefined, localize('reservedName', "This chat extension is using a reserved name.")));
	}

	setAgent(id: string): void {
		const agent = this.chatAgentService.getAgent(id)!;
		if (agent.metadata.icon instanceof URI) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(agent.metadata.icon).toString(true);
			this.icon.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
		} else if (agent.metadata.themeIcon) {
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(agent.metadata.themeIcon));
			this.icon.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}

		this.domNode.classList.toggle('noExtensionName', !!agent.isDynamic);

		const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
		this.name.textContent = isAllowed ? `@${agent.name}` : getFullyQualifiedId(agent);
		this.extensionName.textContent = agent.extensionDisplayName;
		this.publisherName.textContent = agent.publisherDisplayName ?? agent.extensionPublisherId;

		let description = agent.description ?? '';
		if (description) {
			if (!description.match(/[\.\?\!] *$/)) {
				description += '.';
			}
		}

		this.description.textContent = description;
		this.domNode.classList.toggle('allowedName', isAllowed);

		this.domNode.classList.toggle('verifiedPublisher', false);
		if (!agent.isDynamic) {
			const cancel = this._register(new CancellationTokenSource());
			this.extensionService.getExtensions([{ id: agent.extensionId.value }], cancel.token).then(extensions => {
				cancel.dispose();
				const extension = extensions[0];
				if (extension?.publisherDomain?.verified) {
					this.domNode.classList.toggle('verifiedPublisher', true);
				}
			});
		}
	}
}

export function getChatAgentHoverOptions(getAgent: () => IChatAgentData | undefined, commandService: ICommandService): IUpdatableHoverOptions {
	return {
		actions: [
			{
				commandId: showExtensionsWithIdsCommandId,
				label: localize('viewExtensionLabel', "View Extension"),
				run: () => {
					const agent = getAgent();
					if (agent) {
						commandService.executeCommand(showExtensionsWithIdsCommandId, [agent.extensionId.value]);
					}
				},
			}
		]
	};
}
