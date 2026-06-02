/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../base/browser/window.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';

export class MainEditorPart extends MainEditorPartBase {
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_BOTTOM = 5;
	static readonly MARGIN_LEFT = 5;
	static readonly MARGIN_RIGHT = 5;

	override get minimumWidth() {
		return Math.max(300, super.minimumWidth);
	}

	override priority = LayoutPriority.High;

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return;
		}

		// MARGIN_BOTTOM applies only when the panel is visible (paired with the panel's
		// 5px top margin to center the sash). When the panel is hidden the card fills its
		// cell; the workbench grid's 10px bottom gutter provides the visible gap.
		// MARGIN_RIGHT drops to 0 when the auxiliary bar is hidden so the editor fills
		// the remaining horizontal space (CSS `.noauxiliarybar` override mirrors this).
		const marginRight = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)
			? MainEditorPart.MARGIN_RIGHT
			: 0;
		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART)
			? MainEditorPart.MARGIN_BOTTOM
			: 0;

		const adjustedWidth = width - marginRight - MainEditorPart.MARGIN_LEFT - 2 /* border width */;
		const adjustedHeight = height - MainEditorPart.MARGIN_TOP - marginBottom - 2 /* border width */;

		super.layout(adjustedWidth, adjustedHeight, top, left);
	}
}
