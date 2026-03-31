/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SidebarToggleFocusTarget {
	Titlebar = 'titlebar',
	Sidebar = 'sidebar',
}

let pendingSidebarToggleFocusTarget: SidebarToggleFocusTarget | undefined;

export function logSidebarToggleFocus(message: string, details?: Record<string, unknown>): void {
	console.warn('[sessions][sidebar-toggle-focus]', message, details ?? {});
}

export function peekSidebarToggleFocusRequest(): SidebarToggleFocusTarget | undefined {
	return pendingSidebarToggleFocusTarget;
}

export function requestSidebarToggleFocus(target: SidebarToggleFocusTarget): void {
	logSidebarToggleFocus('request', { target, previous: pendingSidebarToggleFocusTarget });
	pendingSidebarToggleFocusTarget = target;
}

export function clearSidebarToggleFocusRequest(): void {
	logSidebarToggleFocus('clear', { previous: pendingSidebarToggleFocusTarget });
	pendingSidebarToggleFocusTarget = undefined;
}

export function consumeSidebarToggleFocusRequest(target: SidebarToggleFocusTarget): boolean {
	logSidebarToggleFocus('consume-attempt', { target, pending: pendingSidebarToggleFocusTarget });
	if (pendingSidebarToggleFocusTarget !== target) {
		return false;
	}

	pendingSidebarToggleFocusTarget = undefined;
	logSidebarToggleFocus('consume-success', { target });
	return true;
}
