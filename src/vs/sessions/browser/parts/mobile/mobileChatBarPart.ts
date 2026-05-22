/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AbstractPaneCompositePart } from '../../../../workbench/browser/parts/paneCompositePart.js';
import { ChatBarPart } from '../chatBarPart.js';
import { isPhoneLayout } from './mobileLayout.js';

/**
 * Mobile variant of ChatBarPart.
 *
 * On phone-sized viewports the chat bar fills the full grid cell without
 * card margins, border insets, or session-bar height adjustments. When
 * the viewport transitions to tablet/desktop (e.g., device rotation
 * crossing the phone breakpoint) this delegates to the desktop
 * implementation so layout math stays correct.
 */
export class MobileChatBarPart extends ChatBarPart {

	override updateStyles(): void {
		// Always run the desktop implementation first so inline styles are
		// set on tablet/desktop transitions. In phone mode we then clear
		// the card-specific inline styles so CSS can take over.
		super.updateStyles();

		if (!isPhoneLayout(this.layoutService)) {
			return;
		}

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = '';
			container.style.removeProperty('--part-background');
			container.style.removeProperty('--part-border-color');
			container.style.color = '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!isPhoneLayout(this.layoutService)) {
			super.layout(width, height, top, left);
			return;
		}

		if (!this.layoutService.isVisible(Parts.CHATBAR_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		// Full dimensions — no card margins or session-bar subtraction.
		// AbstractPaneCompositePart.layout internally calls Part.layout so
		// there is no need to invoke Part.prototype.layout separately.
		AbstractPaneCompositePart.prototype.layout.call(this, width, height, top, left);
	}
}
