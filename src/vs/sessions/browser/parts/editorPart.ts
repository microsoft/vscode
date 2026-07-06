/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../base/browser/window.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import type { IAgentWorkbenchLayoutService } from '../workbench.js';

export class MainEditorPart extends MainEditorPartBase {
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_BOTTOM = 5;
	static readonly MARGIN_LEFT = 5;
	static readonly MARGIN_RIGHT = 5;

	override get minimumWidth() {
		return Math.max(300, super.minimumWidth);
	}

	// The editor part keeps a stable, user-set width: the Sessions Part is the
	// flexible view (LayoutPriority.High) that absorbs visibility/resize deltas.
	// Making the editor the flex view caused its width to drift to the minimum
	// when toggling the auxiliary bar across session switches.
	override priority = LayoutPriority.Normal;

	override layout(width: number, height: number, top: number, left: number): void {
		const agentLayoutService = this.layoutService as IAgentWorkbenchLayoutService;
		const keepForDockedTabBar = agentLayoutService.isSinglePaneLayoutEnabled
			&& this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && !keepForDockedTabBar) {
			return;
		}

		// MARGIN_BOTTOM applies only when the panel is visible (paired with the panel's
		// 5px top margin to center the sash). When the panel is hidden the card fills its
		// cell; the workbench grid's 10px bottom gutter provides the visible gap.
		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ||
			this.layoutService.isVisible(Parts.SESSIONS_PART)
			? 0
			: MainEditorPart.MARGIN_LEFT;
		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART)
			? MainEditorPart.MARGIN_BOTTOM
			: 0;

		const adjustedWidth = width - MainEditorPart.MARGIN_RIGHT - marginLeft - 2 /* border width */;
		const adjustedHeight = height - MainEditorPart.MARGIN_TOP - marginBottom - 2 /* border width */;

		super.layout(adjustedWidth, adjustedHeight, top, left);

		if (agentLayoutService.isSinglePaneLayoutEnabled && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			agentLayoutService.handleDockedEditorPartLayout(width);
		}
	}
}
