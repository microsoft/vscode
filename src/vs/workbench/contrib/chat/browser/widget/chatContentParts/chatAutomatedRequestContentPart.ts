/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button, type IButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { formatChatRequestTimestamp } from '../../../common/chatProgressFormatting.js';
import './media/chatAutomatedRequestContent.css';

interface IAutomatedRequestOptions {
	readonly title: string;
	readonly participant: string;
	readonly timestamp?: number;
	readonly agentMessage?: {
		readonly text: string;
		readonly showDetailsLabel: string;
	};
}

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

export function getAutomatedRequestSummaryLabel(title: string, participant: string): string {
	return localize('chat.automatedRequest.summary', "{0}, {1}", title, participant);
}

/** Shared disclosure and attribution for requests submitted by workbench features. */
export class ChatAutomatedRequestContentPart extends Disposable {
	readonly domNode: HTMLElement;
	protected readonly content: HTMLElement;

	constructor(
		options: IAutomatedRequestOptions,
		@IHoverService protected readonly _hoverService: IHoverService,
	) {
		super();
		this.domNode = dom.$('.chat-automated-request');
		const card = dom.append(this.domNode, dom.$('.chat-automated-request-card'));
		this._createHeader(card, options);
		const body = dom.append(card, dom.$('.chat-automated-request-body'));
		this.content = dom.append(body, dom.$('.chat-automated-request-details'));
		if (options.agentMessage?.text) {
			const message = dom.append(body, dom.$('.chat-automated-request-message'));
			dom.append(message, dom.$('.chat-automated-request-message-body', undefined, options.agentMessage.text));
		}
		this._createMetadata(options);
	}

	private _createHeader(parent: HTMLElement, options: IAutomatedRequestOptions): void {
		const header = dom.append(parent, dom.$('.chat-automated-request-header'));
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
		const disclosureButton = this._register(new Button(header, { ...transparentButtonStyles, title: false }));
		disclosureButton.element.classList.add('chat-automated-request-header-disclosure');
		disclosureButton.setAriaLabel(getAutomatedRequestSummaryLabel(options.title, options.participant));

		const content = dom.append(header, dom.$('.chat-automated-request-header-content', { 'aria-hidden': 'true' }));
		dom.append(content, dom.$('span.chat-automated-request-title', undefined, options.title));
		this._register(this._hoverService.setupDelayedHover(disclosureButton.element, { content: options.title }));

		let messageButton: Button | undefined;
		const setExpanded = (expanded: boolean) => {
			this.domNode.classList.toggle('collapsed', !expanded);
			disclosureButton.element.ariaExpanded = String(expanded);
			if (messageButton) {
				messageButton.element.tabIndex = expanded ? 0 : -1;
			}
		};
		setExpanded(false);
		handlePointerFocus(disclosureButton);
		this._register(disclosureButton.onDidClick(() => setExpanded(this.domNode.classList.contains('collapsed'))));

		if (options.agentMessage?.text) {
			const showMessageLabel = localize('chat.automatedRequest.showAgentMessage', "Show Agent Message");
			const showDetailsLabel = options.agentMessage.showDetailsLabel;
			const agentMessageButton = this._register(new Button(header, { ...transparentButtonStyles, title: false }));
			messageButton = agentMessageButton;
			agentMessageButton.element.classList.add('chat-automated-request-message-toggle');
			agentMessageButton.icon = Codicon.eye;
			agentMessageButton.setAriaLabel(localize('chat.automatedRequest.agentMessage', "Agent Message"));
			agentMessageButton.element.tabIndex = -1;
			handlePointerFocus(agentMessageButton);
			let showingAgentMessage = false;
			const updateMessageVisibility = (visible: boolean) => {
				showingAgentMessage = visible;
				this.domNode.classList.toggle('showing-agent-message', visible);
				agentMessageButton.checked = visible;
			};
			updateMessageVisibility(false);
			this._register(this._hoverService.setupDelayedHover(agentMessageButton.element, () => ({
				content: showingAgentMessage ? showDetailsLabel : showMessageLabel,
			})));
			this._register(agentMessageButton.onDidClick(() => {
				setExpanded(true);
				updateMessageVisibility(!showingAgentMessage);
			}));
		}

		const twistie = dom.append(header, dom.$('span.chat-automated-request-twistie', { 'aria-hidden': 'true' }));
		twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));
	}

	private _createMetadata(options: IAutomatedRequestOptions): void {
		const metadata = dom.append(this.domNode, dom.$('.chat-automated-request-metadata'));
		const formattedTimestamp = formatChatRequestTimestamp(options.timestamp);
		if (formattedTimestamp) {
			const time = dom.append(metadata, dom.$('time.chat-automated-request-timestamp', {
				datetime: formattedTimestamp.dateTime,
				'aria-label': localize('chat.automatedRequest.startedAt', "Started {0}", formattedTimestamp.fullText),
				tabindex: 0,
			}, formattedTimestamp.text));
			this._register(this._hoverService.setupDelayedHover(time, { content: formattedTimestamp.fullText }));
			dom.append(metadata, dom.$('span.chat-automated-request-metadata-separator', { 'aria-hidden': 'true' }, '\u2022'));
		}
		const participant = dom.append(metadata, dom.$('span.chat-automated-request-participant', undefined, options.participant));
		this._register(this._hoverService.setupDelayedHover(participant, { content: options.participant }));
	}
}
