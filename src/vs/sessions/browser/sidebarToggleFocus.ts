/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SidebarToggleFocusTarget {
	Titlebar = 'titlebar',
	Sidebar = 'sidebar',
}

let pendingSidebarToggleFocusTarget: SidebarToggleFocusTarget | undefined;

export function requestSidebarToggleFocus(target: SidebarToggleFocusTarget): void {
	pendingSidebarToggleFocusTarget = target;
}

export function clearSidebarToggleFocusRequest(): void {
	pendingSidebarToggleFocusTarget = undefined;
}

export function consumeSidebarToggleFocusRequest(target: SidebarToggleFocusTarget): boolean {
	if (pendingSidebarToggleFocusTarget !== target) {
		return false;
	}

	pendingSidebarToggleFocusTarget = undefined;
	return true;
}
