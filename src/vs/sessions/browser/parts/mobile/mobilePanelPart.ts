/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AbstractPaneCompositePart } from '../../../../workbench/browser/parts/paneCompositePart.js';
import { PanelPart } from '../panelPart.js';
import { isPhoneLayout } from './mobileLayout.js';

/**
 * Mobile variant of PanelPart.
 *
 * On phone-sized viewports the panel fills the full grid cell
 * without card margins or border insets. On tablet/desktop it falls
 * back to the desktop behavior so runtime viewport transitions keep
 * working.
 */
export class MobilePanelPart extends PanelPart {

	override updateStyles(): void {
		super.updateStyles();

		if (!isPhoneLayout(this.layoutService)) {
			return;
		}

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = '';
			container.style.removeProperty('--part-background');
			container.style.removeProperty('--part-border-color');
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!isPhoneLayout(this.layoutService)) {
			super.layout(width, height, top, left);
			return;
		}

		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			return;
		}

		// Full dimensions — no card margins or border subtraction.
		// AbstractPaneCompositePart.layout internally calls Part.layout.
		AbstractPaneCompositePart.prototype.layout.call(this, width, height, top, left);
	}
}
