/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Leaves the windows of VS Code out of desktop media sources, and keeps the others in their order. A source is a window
 * of VS Code when its native window handle is, because the rest of its id can differ from the id that
 * `BrowserWindow.getMediaSourceId()` returns for the same window.
 */
export function excludeOwnWindowSources<T extends { readonly id: string }>(sources: readonly T[], ownSourceIds: readonly string[]): T[] {
	const ownHandles = new Set<string>();
	for (const id of ownSourceIds) {
		const handle = getWindowHandle(id);
		if (handle) {
			ownHandles.add(handle);
		}
	}
	return sources.filter(source => {
		const handle = getWindowHandle(source.id);
		return !handle || !ownHandles.has(handle);
	});
}

function getWindowHandle(sourceId: string): string | undefined {
	return /^window:(?<handle>[^:]+):/.exec(sourceId)?.groups?.handle;
}
