/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CSS class marking a Changes button-bar container as living outside a card
 * composition (the single-pane editor's action row), already used by
 * `changesView.css` to switch button styling for that same container.
 * Shared between the production container markup and the fixture so the
 * spacing derivation below and the DOM it inspects cannot drift apart.
 */
export const CHANGES_OUTSIDE_CARD_CLASS = 'outside-card';

/**
 * Derives the `iconLabelSpacing` a Changes button-bar host supplies to
 * {@link ChangesWorkbenchButtonBarWidget} / {@link ChangesMenuWorkbenchButtonBarWidget}
 * from the container's own composition context, following the existing
 * convention where {@link CHANGES_OUTSIDE_CARD_CLASS} already switches this
 * container's button styling in CSS.
 */
export function getChangesButtonBarIconLabelSpacing(container: HTMLElement): 'compact' | 'default' {
	return container.classList.contains(CHANGES_OUTSIDE_CARD_CLASS) ? 'default' : 'compact';
}
