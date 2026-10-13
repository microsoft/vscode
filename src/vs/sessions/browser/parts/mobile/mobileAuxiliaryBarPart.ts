/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AbstractPaneCompositePart } from '../../../../workbench/browser/parts/paneCompositePart.js';
import { AuxiliaryBarPart } from '../auxiliaryBarPart.js';
import { isPhoneLayout } from './mobileLayout.js';

/**
 * Mobile variant of AuxiliaryBarPart.
 *
 * On phone-sized viewports the auxiliary bar fills the full grid cell
 * without card margins or border insets. On tablet/desktop it falls
 * back to the desktop behavior so runtime viewport transitions keep
 * working.
 */
export class MobileAuxiliaryBarPart extends AuxiliaryBarPart {

	override updateStyles(): void {
		// Always run the desktop implementation first so inline card styles
		// are set on tablet/desktop transitions. In phone mode we then
		// clear them so CSS can take over (inline styles have the highest
		// specificity).
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

		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		// Full dimensions — no card margins or border subtraction.
		// AbstractPaneCompositePart.layout internally calls Part.layout.
		AbstractPaneCompositePart.prototype.layout.call(this, width, height, top, left);
	}
}
