/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../base/browser/window.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { IEditorGroupViewOptions } from '../../../workbench/browser/parts/editor/editor.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../workbench/contrib/sessions/common/layoutConstants.js';
import { type IAgentWorkbenchLayoutService } from '../workbench.js';
import { AgentWorkbenchLayout } from '../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, getSidePaneBottomFrameInset, getSidePaneFrameInset } from '../../../workbench/browser/parts/sessions/agentsPartCard.js';
import { EDITOR_PART_MINIMUM_WIDTH } from '../../../workbench/browser/parts/sessions/editorPartSizing.js';
import { isPhoneLayout } from '../../../workbench/browser/parts/sessions/mobileLayout.js';

export class MainEditorPart extends MainEditorPartBase {
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_BOTTOM = 0;
	static readonly MARGIN_LEFT = 0;
	static readonly MARGIN_RIGHT = 0;

	// The workbench's new tab button is not offered in the Agents window, which configures its own tab bar.
	protected override getGroupViewOptions(): IEditorGroupViewOptions | undefined {
		return undefined;
	}

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
		const keepForDockedTabBar = agentLayoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop
			&& this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && !keepForDockedTabBar) {
			return;
		}

		const compact = this.layoutService.isModernUICompact();
		const marginLeft = !isPhoneLayout(this.layoutService)
			&& !compact
			&& !this.layoutService.isVisible(Parts.SIDEBAR_PART)
			&& !this.layoutService.isVisible(Parts.SESSIONS_PART)
			? AGENTS_FLOATING_PANEL_GAP : MainEditorPart.MARGIN_LEFT;
		const container = this.layoutService.mainContainer;
		const spacing = this.layoutService.getPanelSpacing();
		const connectedFrame = !isPhoneLayout(this.layoutService)
			&& container.classList.contains('modern-ui-tabs')
			&& container.classList.contains('modern-ui-connected-editor-tabs')
			&& container.classList.contains('dock-detail-panel')
			&& container.classList.contains(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS);
		const borderTotal = compact ? 0 : connectedFrame ? getSidePaneFrameInset(container, spacing) * 2 : 2;
		const bottomFrameInset = getSidePaneBottomFrameInset(container, spacing);
		const adjustedWidth = width - MainEditorPart.MARGIN_RIGHT - marginLeft - borderTotal;
		const adjustedHeight = height - MainEditorPart.MARGIN_TOP - MainEditorPart.MARGIN_BOTTOM - borderTotal - bottomFrameInset;

		super.layout(adjustedWidth, adjustedHeight, top, left);

		if (agentLayoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			agentLayoutService.handleDockedEditorPartLayout(width);
		}
	}
}
