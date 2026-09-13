/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { agentsCardBorder, agentsPanelBackground, agentsPanelForeground } from '../../common/theme.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../common/layoutConstants.js';

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
	MARGIN_RIGHT: AGENTS_FLOATING_PANEL_GAP,
	MARGIN_RIGHT_NO_EDITOR_PANE: 0,
	MARGIN_BOTTOM: 0,
	BORDER_WIDTH: 1,
} as const;

/**
 * Content box of a card part, i.e. its grid-allocated size minus the card's
 * visual margins and border.
 */
export function getAgentsPartCardContentSize(width: number, height: number, editorPaneVisible: boolean): { readonly width: number; readonly height: number } {
	const borderTotal = AgentsPartCard.BORDER_WIDTH * 2;
	const marginRight = editorPaneVisible ? AgentsPartCard.MARGIN_RIGHT : AgentsPartCard.MARGIN_RIGHT_NO_EDITOR_PANE;

	return {
		width: width - AgentsPartCard.MARGIN_LEFT - marginRight - borderTotal,
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
