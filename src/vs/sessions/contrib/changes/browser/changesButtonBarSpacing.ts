/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** CSS class marking a Changes button-bar container as living outside a card composition; also used by `changesView.css` to switch button styling. */
export const CHANGES_OUTSIDE_CARD_CLASS = 'outside-card';

/** Derives the `iconLabelSpacing` variant for a Changes button-bar container from its own composition context. */
export function getChangesButtonBarIconLabelSpacing(container: HTMLElement): 'compact' | 'default' {
	return container.classList.contains(CHANGES_OUTSIDE_CARD_CLASS) ? 'default' : 'compact';
}

