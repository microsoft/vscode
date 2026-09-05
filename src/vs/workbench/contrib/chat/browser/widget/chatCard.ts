/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, IButtonStyles } from '../../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import './media/chatCard.css';

/**
 * The large inline card shell: rounded border, panel background, clipped content. Chat's other
 * card tier is `.chat-confirmation-widget2`, which is smaller and has no background.
 */
export const CHAT_CARD_LARGE_CLASS = 'chat-card-large';

/** Header strip of a large card: title on the left, actions on the right, separated by a rule. */
export const CHAT_CARD_HEADER_CLASS = 'chat-card-header';

export const CHAT_CARD_TITLE_CLASS = 'chat-card-title';

export const CHAT_CARD_HEADER_ACTIONS_CLASS = 'chat-card-header-actions';

/**
 * Button styles that set no colors at all.
 *
 * `Button` writes its background, foreground and border as *inline* styles, which no selector can
 * outrank -- that is why every hand rolled copy of this button needed `!important`. Passing no
 * colors makes `Button` write empty strings instead, leaving the appearance to the stylesheet.
 */
export const chatCardButtonStyles: IButtonStyles = {
	buttonBackground: undefined,
	buttonHoverBackground: undefined,
	buttonForeground: undefined,
	buttonSeparator: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
	buttonBorder: undefined,
};

export interface IChatCardIconButtonOptions {
	/** Omit for buttons whose glyph changes over time; set `label` on the result instead. */
	readonly icon?: ThemeIcon;
	readonly ariaLabel: string;
	/** Adds a delayed hover. Pass the aria label again when the two should match. */
	readonly hoverContent?: string;
	/** `strong` reads as content rather than chrome, `padded` sizes to a label. */
	readonly variant?: 'strong' | 'padded';
}

/**
 * Creates a chrome free 22px icon button for a card header or footer.
 *
 * Takes the store rather than returning one, so the button and its hover share the caller's
 * single lifetime.
 */
export function createChatCardIconButton(store: DisposableStore, container: HTMLElement, hoverService: IHoverService, options: IChatCardIconButtonOptions): Button {
	const button = store.add(new Button(container, { ...chatCardButtonStyles, secondary: true, supportIcons: true }));
	button.element.classList.add('chat-card-icon-button');
	if (options.variant) {
		button.element.classList.add(`chat-card-icon-button-${options.variant}`);
	}

	if (options.icon) {
		button.label = `$(${options.icon.id})`;
	}

	button.element.setAttribute('aria-label', options.ariaLabel);
	if (options.hoverContent !== undefined) {
		store.add(hoverService.setupDelayedHover(button.element, { content: options.hoverContent }));
	}

	return button;
}
