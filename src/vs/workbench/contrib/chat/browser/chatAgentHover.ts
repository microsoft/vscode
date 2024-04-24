/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { h } from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { showExtensionsWithIdsCommandId } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { verifiedPublisherIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';

export class ChatAgentHover extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly icon: HTMLElement;
	private readonly name: HTMLElement;
	private readonly extensionName: HTMLElement;
	private readonly verifiedBadge: HTMLElement;
	private readonly publisherName: HTMLElement;
	private readonly description: HTMLElement;

	private currentAgent: IChatAgentData | undefined;

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IExtensionsWorkbenchService private readonly extensionService: IExtensionsWorkbenchService,
		@ICommandService private readonly commandService: ICommandService,
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
				h('span.chat-agent-hover-description@description'),
				h('span.chat-agent-hover-marketplace-button@button'),
			]);
		this.domNode = hoverElement.root;

		this.icon = hoverElement.icon;
		this.name = hoverElement.name;
		this.extensionName = hoverElement.extensionName;
		this.description = hoverElement.description;

		hoverElement.separator.textContent = '|';

		this.verifiedBadge = dom.$('span.extension-verified-publisher', undefined, renderIcon(verifiedPublisherIcon));
		this.verifiedBadge.style.display = 'none';

		this.publisherName = dom.$('span.chat-agent-hover-publisher-name');
		dom.append(
			hoverElement.publisher,
			this.verifiedBadge,
			this.publisherName);

		const label = localize('marketplaceLabel', "View in Marketplace") + '.';
		const marketplaceButton = this._register(new Button(hoverElement.button, {
			title: label,
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined,
		}));
		marketplaceButton.label = label;
		this._register(marketplaceButton.onDidClick(() => {
			if (this.currentAgent) {
				this.commandService.executeCommand(showExtensionsWithIdsCommandId, [this.currentAgent.extensionId.value]);
			}
		}));
	}

	setAgent(id: string): void {
		const agent = this.chatAgentService.getAgent(id)!;
		this.currentAgent = agent;

		if (agent.metadata.icon instanceof URI) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(agent.metadata.icon).toString(true);
			this.icon.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
		} else if (agent.metadata.themeIcon) {
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(agent.metadata.themeIcon));
			this.icon.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}

		this.name.textContent = `@${agent.name}`;
		this.extensionName.textContent = agent.extensionDisplayName;
		this.publisherName.textContent = agent.extensionPublisherDisplayName ?? agent.extensionPublisherId;

		const description = agent.description && !agent.description.endsWith('.') ?
			`${agent.description}. ` :
			(agent.description || '');
		this.description.textContent = description;

		const cancel = this._register(new CancellationTokenSource());
		this.extensionService.getExtensions([{ id: agent.extensionId.value }], cancel.token).then(extensions => {
			cancel.dispose();
			const extension = extensions[0];
			if (extension?.publisherDomain?.verified) {
				this.verifiedBadge.style.display = '';
			}
		});
	}
}
