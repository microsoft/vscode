/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IManagedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getFullyQualifiedId, IChatAgentData, IChatAgentNameService, IChatAgentService } from '../common/chatAgents.js';
import { showExtensionsWithIdsCommandId } from '../../extensions/browser/extensionsActions.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { verifiedPublisherIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';

export class ChatAgentHover extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly icon: HTMLElement;
	private readonly name: HTMLElement;
	private readonly extensionName: HTMLElement;
	private readonly publisherName: HTMLElement;
	private readonly description: HTMLElement;

	private readonly _onDidChangeContents = this._register(new Emitter<void>());
	public readonly onDidChangeContents: Event<void> = this._onDidChangeContents.event;

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IExtensionsWorkbenchService private readonly extensionService: IExtensionsWorkbenchService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();

		const hoverElement = dom.h(
			'.chat-agent-hover@root',
			[
				dom.h('.chat-agent-hover-header', [
					dom.h('.chat-agent-hover-icon@icon'),
					dom.h('.chat-agent-hover-details', [
						dom.h('.chat-agent-hover-name@name'),
						dom.h('.chat-agent-hover-extension', [
							dom.h('.chat-agent-hover-extension-name@extensionName'),
							dom.h('.chat-agent-hover-separator@separator'),
							dom.h('.chat-agent-hover-publisher@publisher'),
						]),
					]),
				]),
				dom.h('.chat-agent-hover-warning@warning'),
				dom.h('span.chat-agent-hover-description@description'),
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
					this._onDidChangeContents.fire();
				}
			});
		}
	}
}

export function getChatAgentHoverOptions(getAgent: () => IChatAgentData | undefined, commandService: ICommandService): IManagedHoverOptions {
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
