/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { agentsCardBorder, agentsPanelBackground, agentsPanelForeground } from '../../common/theme.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../common/layoutConstants.js';

const AGENTS_PART_CARD_BORDER_WIDTH = 1;

/**
 * Marks a part as a floating content card. Carries the shared background,
 * border, corner radius and outer margin (see `media/workbench.css`) so every
 * content part in the Agents window is styled from one place.
 */
export const AGENTS_PART_CARD_CLASS = 'agents-part-card';

/** Visual metrics of a card part, kept in sync with the CSS in `media/workbench.css`. */
export const AgentsPartCard = {
	MARGIN_TOP: 0,
	MARGIN_LEFT: 0,
	MARGIN_LEFT_NO_SIDEBAR: AGENTS_FLOATING_PANEL_GAP,
	MARGIN_RIGHT: AGENTS_FLOATING_PANEL_GAP,
	MARGIN_RIGHT_INSET_CONNECTED_FRAMES: Math.max(0, AGENTS_FLOATING_PANEL_GAP - AGENTS_PART_CARD_BORDER_WIDTH * 2),
	MARGIN_RIGHT_NO_EDITOR_PANE: 0,
	MARGIN_BOTTOM: 0,
	BORDER_WIDTH: AGENTS_PART_CARD_BORDER_WIDTH,
} as const;

/** Whether both connected frames are inset by the containing part borders. */
export function hasInsetConnectedFramePair(container: HTMLElement): boolean {
	return container.classList.contains('modern-ui-tabs')
		&& container.classList.contains('modern-ui-connected-editor-tabs')
		&& container.classList.contains('dock-detail-panel');
}

/** Content box of a card part, filling the grid in compact or phone layouts. */
export function getAgentsPartCardContentSize(width: number, height: number, editorPaneVisible: boolean, sidebarVisible: boolean, phoneLayout: boolean, compact = false, insetConnectedFramePair = false): { readonly width: number; readonly height: number } {
	if (phoneLayout || compact) {
		return { width, height };
	}

	const borderTotal = AgentsPartCard.BORDER_WIDTH * 2;
	const marginLeft = sidebarVisible ? AgentsPartCard.MARGIN_LEFT : AgentsPartCard.MARGIN_LEFT_NO_SIDEBAR;
	const marginRight = editorPaneVisible
		? insetConnectedFramePair ? AgentsPartCard.MARGIN_RIGHT_INSET_CONNECTED_FRAMES : AgentsPartCard.MARGIN_RIGHT
		: AgentsPartCard.MARGIN_RIGHT_NO_EDITOR_PANE;

	return {
		width: width - marginLeft - marginRight - borderTotal,
		height: height - AgentsPartCard.MARGIN_TOP - AgentsPartCard.MARGIN_BOTTOM - borderTotal
	};
}

/** Publishes the themed card colors that `media/workbench.css` draws the card from. */
export function applyAgentsPartCardStyles(container: HTMLElement, theme: IColorTheme): void {
	container.style.setProperty('--part-background', theme.getColor(agentsPanelBackground)?.toString() ?? '');
	container.style.setProperty('--part-border-color', theme.getColor(agentsCardBorder)?.toString() ?? 'transparent');
	container.style.setProperty('--part-foreground', theme.getColor(agentsPanelForeground)?.toString() ?? '');
	container.style.backgroundColor = theme.getColor(agentsPanelBackground)?.toString() ?? '';
}

/** Clears the inline card colors so CSS can take over (phone layout). */
export function clearAgentsPartCardStyles(container: HTMLElement): void {
	container.style.backgroundColor = '';
	container.style.removeProperty('--part-background');
	container.style.removeProperty('--part-border-color');
	container.style.color = '';
}
