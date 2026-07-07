/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../platform/theme/common/colorRegistry.js';
import { AbstractPaneCompositePart } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { AuxiliaryBarPart } from './auxiliaryBarPart.js';

/**
 * Single-pane variant of the auxiliary bar. In the single-pane layout the
 * auxiliary bar is docked inside the editor part as a contextual detail panel:
 * it has no title/composite bar, shares the editor background so the pane reads
 * as one card, and fills the exact rectangle the workbench positions it in.
 */
export class SinglePaneAuxiliaryBarPart extends AuxiliaryBarPart {

	protected override createTitleArea(): HTMLElement | undefined {
		// No title strip; the single tab bar lives on the editor part.
		return undefined;
	}

	protected override shouldShowCompositeBar(): boolean {
		return false;
	}

	protected override getPartBackgroundColor(): string {
		return this.getColor(editorBackground) || '';
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
