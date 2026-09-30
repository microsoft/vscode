/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPaneCompositePart } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { agentsDetailBackground } from '../../common/theme.js';
import { AuxiliaryBarPart } from './auxiliaryBarPart.js';

/**
 * Desktop variant of the auxiliary bar. In the desktop layout the
 * auxiliary bar is docked inside the editor part as a contextual detail panel:
 * it has no title/composite bar, uses the editor background by default, and
 * fills the exact rectangle the workbench positions it in.
 */
export class DesktopAuxiliaryBarPart extends AuxiliaryBarPart {

	override create(parent: HTMLElement): void {
		// Clear `hasTitle` so PartLayout does not reserve title height (there is no title strip).
		this.options = { ...this.options, hasTitle: false };
		super.create(parent);
	}

	protected override shouldShowCompositeBar(): boolean {
		return false;
	}

	protected override getPartBackgroundColor(): string {
		return this.getColor(agentsDetailBackground) || '';
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		// The workbench docks and sizes the aux bar to an exact rectangle (below the
		// editor tab strip); fill it directly without the card margins/border math.
		AbstractPaneCompositePart.prototype.layout.call(this, width, height, top, left);
	}
}
