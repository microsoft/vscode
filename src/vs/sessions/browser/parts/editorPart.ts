/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../base/browser/window.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import type { IAgentWorkbenchLayoutService } from '../workbench.js';
import { EDITOR_PART_MINIMUM_WIDTH } from './editorPartSizing.js';

export class MainEditorPart extends MainEditorPartBase {
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_BOTTOM = 0;
	static readonly MARGIN_LEFT = 0;
	static readonly MARGIN_RIGHT = 0;

	override get minimumWidth() {
		return Math.max(EDITOR_PART_MINIMUM_WIDTH, super.minimumWidth);
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

		const adjustedWidth = width - MainEditorPart.MARGIN_RIGHT - MainEditorPart.MARGIN_LEFT - 2 /* border width */;
		const adjustedHeight = height - MainEditorPart.MARGIN_TOP - MainEditorPart.MARGIN_BOTTOM - 2 /* border width */;

		super.layout(adjustedWidth, adjustedHeight, top, left);

		if (agentLayoutService.isSinglePaneLayoutEnabled && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			agentLayoutService.handleDockedEditorPartLayout(width);
		}
	}
}
