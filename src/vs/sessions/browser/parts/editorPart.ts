/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../base/browser/window.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';

export class MainEditorPart extends MainEditorPartBase {
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_LEFT = 5;
	static readonly MARGIN_BOTTOM = 10;

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return;
		}

		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART)
			? MainEditorPart.MARGIN_BOTTOM - 5
			: MainEditorPart.MARGIN_BOTTOM;

		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ||
			this.layoutService.isVisible(Parts.CHATBAR_PART)
			? 0
			: MainEditorPart.MARGIN_LEFT;

		const adjustedWidth = width - marginLeft - 2 /* border width */;
		const adjustedHeight = height - MainEditorPart.MARGIN_TOP - marginBottom - 2 /* border width */;

		super.layout(adjustedWidth - 5, adjustedHeight, top, left);
	}
}
