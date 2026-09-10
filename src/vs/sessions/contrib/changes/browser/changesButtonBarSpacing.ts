/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The hosts that instantiate {@link ChangesWorkbenchButtonBarWidget} /
 * {@link ChangesMenuWorkbenchButtonBarWidget}, each with its own icon/label
 * spacing relationship to the surrounding composition.
 */
export type ChangesButtonBarHost = 'header' | 'outside-card';

/**
 * Maps a Changes button-bar host to the `iconLabelSpacing` it supplies to the
 * widget constructor. Production call sites and the component fixture both
 * invoke this function (passing their own host identifier) instead of each
 * independently choosing a spacing value, so the two cannot drift apart.
 */
export function getChangesButtonBarIconLabelSpacing(host: ChangesButtonBarHost): 'compact' | 'default' {
	return host === 'outside-card' ? 'default' : 'compact';
}
