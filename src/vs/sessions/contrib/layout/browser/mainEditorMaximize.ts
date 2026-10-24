/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';

/** The layouts whose panel was hidden with the terminal in it as the editor area was maximized. */
const terminalPanelHiddenForMaximizedEditor = new WeakSet<IAgentWorkbenchLayoutService>();

/**
 * Maximizes the main editor area, synchronously. A panel showing the terminal hides with it, and
 * {@link restoreMainEditorPart} shows it again.
 */
export function maximizeMainEditorPart(layoutService: IAgentWorkbenchLayoutService, viewsService: IViewsService): void {
	if (layoutService.isVisible(Parts.PANEL_PART) && viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
		layoutService.setPartHidden(true, Parts.PANEL_PART);
		terminalPanelHiddenForMaximizedEditor.add(layoutService);
	} else {
		terminalPanelHiddenForMaximizedEditor.delete(layoutService);
	}
	layoutService.setEditorMaximized(true);
}

/** Restores the maximized main editor area, synchronously, and the terminal panel {@link maximizeMainEditorPart} hid. */
export function restoreMainEditorPart(layoutService: IAgentWorkbenchLayoutService): void {
	const shouldRestoreTerminalPanel = terminalPanelHiddenForMaximizedEditor.has(layoutService);
	layoutService.setEditorMaximized(false);
	if (shouldRestoreTerminalPanel && !layoutService.isVisible(Parts.PANEL_PART)) {
		layoutService.setPartHidden(false, Parts.PANEL_PART);
	}
	terminalPanelHiddenForMaximizedEditor.delete(layoutService);
}
