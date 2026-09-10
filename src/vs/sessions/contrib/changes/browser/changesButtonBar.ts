/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getChangesButtonBarIconLabelSpacing(container: HTMLElement): 'compact' | 'default' {
	return container.classList.contains('outside-card') ? 'default' : 'compact';
}
