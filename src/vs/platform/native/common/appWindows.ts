/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRectangle } from '../../window/common/window.js';

/**
 * A window that macOS shows on screen, as `CGWindowListCopyWindowInfo` describes it.
 */
export interface IScreenWindow {
	/** The number of the window, which the desktop media source id of a window contains. */
	readonly id: number;
	/** The process of the application that owns the window. */
	readonly pid: number;
	/** The level of the window: 0 for normal windows, higher for panels, menus, the menu bar and the Dock. */
	readonly layer: number;
	readonly alpha: number;
	readonly bounds: IRectangle;
}

/** The size that a window needs to be the one that a capture takes, rather than a strip that an app floats over its window. */
const MIN_CAPTURED_SIZE = 100;

/**
 * Orders the windows of other applications so that the first one is the window that a capture takes. Windows that the
 * screen shows come first, front to back: the windows of the frontmost application, unless it is VS Code, then the
 * others. A window only comes first when it is a normal window, visible and big enough; the toolbars and badges that
 * some apps float over their windows come after. The windows that the screen doesn't show keep their order, last.
 * Also returns where each window shows.
 */
export function orderAppWindowSources<T extends { readonly id: string }>(sources: readonly T[], screenWindows: readonly IScreenWindow[], frontmostPid: number | undefined, ownPid: number): { readonly source: T; readonly bounds: IRectangle | undefined }[] {
	const onScreen = new Map(screenWindows.map((window, index) => [String(window.id), { window, index }]));
	return sources
		.map((source, position) => {
			const shown = onScreen.get(getWindowHandle(source.id) ?? '');
			const window = shown?.window;
			const captured = !!window && window.layer === 0 && window.alpha > 0 && window.bounds.width >= MIN_CAPTURED_SIZE && window.bounds.height >= MIN_CAPTURED_SIZE;
			const group = !window ? 3 : !captured ? 2 : window.pid === frontmostPid && frontmostPid !== ownPid ? 0 : 1;
			return { source, bounds: window?.bounds, group, index: shown?.index ?? 0, position };
		})
		.sort((a, b) => a.group - b.group || a.index - b.index || a.position - b.position)
		.map(({ source, bounds }) => ({ source, bounds }));
}

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
