/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CSS class marking a Changes button-bar container as living outside a card
 * composition — the standard (non-single-pane) Changes view's actions row,
 * rendered above the file-tree card by {@link ChangesViewPane.createActionsButtonBar}.
 * Already used by `changesView.css` to switch button styling for that same
 * container. Shared between the production container markup and the fixture
 * so the spacing derivation below and the DOM it inspects cannot drift apart.
 *
 * The single-pane redesign renders its actions via {@link ChangesActionsBar}
 * in the editor's title-bar action item instead (no `outside-card` container),
 * so it intentionally keeps compact spacing and is unaffected by this class.
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
