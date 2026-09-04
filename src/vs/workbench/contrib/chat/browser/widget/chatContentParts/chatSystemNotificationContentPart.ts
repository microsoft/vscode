/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { Button, IButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatSystemNotificationPart } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { getCompactCodicon } from '../../chatIcons.js';
import './media/chatSystemNotificationContentPart.css';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPart } from './chatContentParts.js';
import { ChatProgressSubPart } from './chatProgressContentPart.js';

const transparentButtonStyles: IButtonStyles = {
	buttonBackground: undefined,
	buttonBorder: undefined,
	buttonForeground: undefined,
	buttonHoverBackground: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryBorder: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSeparator: undefined,
};

export class ChatSystemNotificationContentPart extends Disposable implements IChatContentPart {
	readonly domNode: HTMLElement;
	readonly inlineTimingContainer: HTMLElement | undefined;

	constructor(
		private readonly notification: IChatSystemNotificationPart,
		renderer: IMarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		let notificationNode: HTMLElement;
		if (notification.collapsible) {
			const firstLineBreak = notification.content.value.indexOf('\n');
			const detailsValue = firstLineBreak === -1 ? '' : notification.content.value.slice(firstLineBreak).trim();
			if (detailsValue) {
				notificationNode = this._renderCollapsibleNotification(notification, renderer, firstLineBreak, detailsValue);
			} else {
				notificationNode = this._renderNotification(notification, renderer, instantiationService);
			}
		} else {
			notificationNode = this._renderNotification(notification, renderer, instantiationService);
		}

		if (notification.renderInlineTiming) {
			this.domNode = dom.$('.chat-system-notification-layout');
			this.domNode.appendChild(notificationNode);
			this.inlineTimingContainer = dom.append(this.domNode, dom.$('span.chat-system-notification-timing'));
		} else {
			this.domNode = notificationNode;
			this.inlineTimingContainer = undefined;
		}
	}

	private _renderNotification(notification: IChatSystemNotificationPart, renderer: IMarkdownRenderer, instantiationService: IInstantiationService): HTMLElement {
		const rendered = this._register(renderer.render(notification.content));
		return this._register(instantiationService.createInstance(ChatProgressSubPart, rendered.element, notification.icon ?? Codicon.check, undefined)).domNode;
	}

	private _renderCollapsibleNotification(notification: IChatSystemNotificationPart, renderer: IMarkdownRenderer, firstLineBreak: number, detailsValue: string): HTMLElement {
		const summary: IMarkdownString = {
			...notification.content,
			value: notification.content.value.slice(0, firstLineBreak),
		};
		const details: IMarkdownString = {
			...notification.content,
			value: detailsValue,
		};
		const owner = dom.$('.chat-system-notification-disclosure.collapsed');
		const header = this._register(new Button(owner, { ...transparentButtonStyles, title: false }));
		header.element.classList.add('chat-system-notification-disclosure-header');
		const icon = dom.append(header.element, dom.$('span.chat-system-notification-disclosure-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(getCompactCodicon(notification.icon ?? Codicon.check)));
		icon.setAttribute('aria-hidden', 'true');
		const renderedSummary = this._register(renderer.render(summary));
		renderedSummary.element.classList.add('chat-system-notification-disclosure-summary');
		header.element.appendChild(renderedSummary.element);
		const twistie = dom.append(header.element, dom.$('span.chat-collapsible-hover-chevron'));
		twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));
		twistie.setAttribute('aria-hidden', 'true');

		const renderedDetails = this._register(renderer.render(details));
		renderedDetails.element.classList.add('chat-system-notification-disclosure-body');
		owner.appendChild(renderedDetails.element);
		const summaryText = renderAsPlaintext(summary);
		const apply = (expanded: boolean) => {
			owner.classList.toggle('collapsed', !expanded);
			twistie.classList.toggle('expanded', expanded);
			header.element.ariaExpanded = String(expanded);
			header.element.ariaLabel = expanded
				? localize('chat.systemNotification.hideDetails', "Hide details for {0}", summaryText)
				: localize('chat.systemNotification.showDetails', "Show details for {0}", summaryText);
		};
		apply(false);
		this._register(header.onDidClick(() => {
			owner.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
			apply(owner.classList.contains('collapsed'));
		}));
		return owner;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'systemNotification'
			&& other.content.value === this.notification.content.value
			&& ThemeIcon.isEqual(other.icon ?? Codicon.check, this.notification.icon ?? Codicon.check)
			&& !!other.collapsible === !!this.notification.collapsible
			&& !!other.renderInlineTiming === !!this.notification.renderInlineTiming;
	}
}
