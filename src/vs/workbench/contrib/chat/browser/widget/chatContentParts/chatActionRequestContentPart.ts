/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button, IButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { formatChatRequestTimestamp } from '../../../common/chatProgressFormatting.js';
import './media/chatActionRequestContent.css';

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

/** Shared disclosure chrome for a feature-authored request with a separate agent-facing message. */
export class ChatActionRequestContentPart extends Disposable {
	readonly domNode = dom.$('.chat-action-request');
	readonly details: HTMLElement;
	private readonly expansionChanged = this._register(new Emitter<void>());
	readonly onDidChangeExpansion = this.expansionChanged.event;

	constructor(
		options: { readonly title: string; readonly label: string; readonly source: string; readonly message: string; readonly timestamp?: number; readonly icon?: ThemeIcon },
		@IHoverService hoverService: IHoverService,
	) {
		super();
		const card = dom.append(this.domNode, dom.$('.chat-action-request-card'));
		const header = dom.append(card, dom.$('.chat-action-request-header'));
		const handlePointerFocus = (button: Button) => {
			this._register(dom.addDisposableListener(button.element, dom.EventType.POINTER_DOWN, event => {
				if (event.pointerType !== 'mouse') {
					this.domNode.classList.add('direct-pointer-input');
					return;
				}
				this.domNode.classList.remove('direct-pointer-input');
				event.preventDefault();
				button.element.blur();
			}));
		};
		const disclosure = this._register(new Button(header, { ...transparentButtonStyles, title: false }));
		disclosure.element.classList.add('chat-action-request-disclosure');
		const content = dom.append(header, dom.$('.chat-action-request-header-content', { 'aria-hidden': 'true' }));
		if (options.icon) {
			dom.append(content, renderIcon(options.icon));
		}
		dom.append(content, dom.$('span.chat-action-request-title', undefined, options.title));
		this._register(hoverService.setupDelayedHover(disclosure.element, { content: options.title }));

		let messageButton: Button | undefined;
		const setExpanded = (expanded: boolean) => {
			this.domNode.classList.toggle('collapsed', !expanded);
			disclosure.element.ariaExpanded = String(expanded);
			disclosure.element.ariaLabel = options.label;
			if (messageButton) {
				messageButton.element.tabIndex = expanded ? 0 : -1;
			}
			this.expansionChanged.fire();
		};
		setExpanded(false);
		handlePointerFocus(disclosure);
		this._register(disclosure.onDidClick(() => setExpanded(this.domNode.classList.contains('collapsed'))));

		if (options.message) {
			const toggle = this._register(new Button(header, { ...transparentButtonStyles, title: false }));
			messageButton = toggle;
			toggle.element.classList.add('chat-action-request-message-toggle');
			toggle.icon = Codicon.eye;
			toggle.setAriaLabel(localize('chat.actionRequest.agentMessage', "Agent Message"));
			toggle.element.tabIndex = -1;
			toggle.checked = false;
			handlePointerFocus(toggle);
			let showingMessage = false;
			this._register(hoverService.setupDelayedHover(toggle.element, () => ({
				content: showingMessage
					? localize('chat.actionRequest.showDetails', "Show Details")
					: localize('chat.actionRequest.showAgentMessage', "Show Agent Message"),
			})));
			this._register(toggle.onDidClick(() => {
				setExpanded(true);
				showingMessage = !showingMessage;
				this.domNode.classList.toggle('showing-agent-message', showingMessage);
				toggle.checked = showingMessage;
				this.expansionChanged.fire();
			}));
		}
		const twistie = dom.append(header, dom.$('span.chat-action-request-twistie', { 'aria-hidden': 'true' }));
		twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));

		const body = dom.append(card, dom.$('.chat-action-request-body'));
		this.details = dom.append(body, dom.$('.chat-action-request-details'));
		if (options.message) {
			dom.append(body, dom.$('.chat-action-request-message', undefined, options.message));
		}
		const metadata = dom.append(this.domNode, dom.$('.chat-action-request-metadata'));
		const timestamp = formatChatRequestTimestamp(options.timestamp);
		if (timestamp) {
			const time = dom.append(metadata, dom.$('time.chat-action-request-timestamp', {
				datetime: timestamp.dateTime,
				'aria-label': localize('chat.actionRequest.startedAt', "Started {0}", timestamp.fullText),
				tabindex: 0,
			}, timestamp.text));
			this._register(hoverService.setupDelayedHover(time, { content: timestamp.fullText }));
			dom.append(metadata, dom.$('span', { 'aria-hidden': 'true' }, '\u2022'));
		}
		dom.append(metadata, dom.$('span.chat-action-request-source', undefined, options.source));
	}
}
