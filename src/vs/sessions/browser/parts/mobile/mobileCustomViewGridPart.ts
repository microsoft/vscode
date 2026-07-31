/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Part } from '../../../../workbench/browser/part.js';
import { clearAgentsPartCardStyles } from '../agentsPartCard.js';
import { CustomViewGridPart } from '../customViewGridPart.js';
import { isPhoneLayout } from './mobileLayout.js';

/**
 * Mobile variant of {@link CustomViewGridPart}.
 *
 * On phone-sized viewports the part fills the full grid cell without card
 * margins or border insets. When the viewport transitions to tablet/desktop
 * (e.g. device rotation crossing the phone breakpoint) this delegates to the
 * desktop implementation so layout math stays correct.
 */
export class MobileCustomViewGridPart extends CustomViewGridPart {

	override updateStyles(): void {
		// Always run the desktop implementation first so inline styles are set on
		// tablet/desktop transitions; clear them again in phone mode so CSS takes over.
		super.updateStyles();

		if (!isPhoneLayout(this.layoutService)) {
			return;
		}

		const container = this.getContainer();
		if (container) {
			clearAgentsPartCardStyles(container);
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!isPhoneLayout(this.layoutService)) {
			super.layout(width, height, top, left);
			return;
		}

		if (!this.layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
			return;
		}

		const { contentSize } = this.layoutContents(width, height);
		this._layoutNode(contentSize.width, contentSize.height);
		Part.prototype.layout.call(this, width, height, top, left);
	}
}
