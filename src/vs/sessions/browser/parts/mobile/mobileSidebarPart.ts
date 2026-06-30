/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPaneCompositePart } from '../../../../workbench/browser/parts/paneCompositePart.js';
import { SidebarPart } from '../sidebarPart.js';
import { isPhoneLayout } from './mobileLayout.js';

/**
 * Mobile variant of SidebarPart.
 *
 * On phone-sized viewports the sidebar skips card-specific inline styles
 * so that CSS-only theming takes over. On tablet/desktop it falls back
 * to the desktop behavior so runtime viewport transitions keep working.
 */
export class MobileSidebarPart extends SidebarPart {

	override updateStyles(): void {
		// Run base theme wiring; this also cascades to AbstractPaneCompositePart.
		super.updateStyles();

		if (!isPhoneLayout(this.layoutService)) {
			return;
		}

		// Skip SidebarPart's card / title-area inline styles on phone.
		AbstractPaneCompositePart.prototype.updateStyles.call(this);

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = '';
			container.style.color = '';
			container.style.outlineColor = '';
		}
	}
}
