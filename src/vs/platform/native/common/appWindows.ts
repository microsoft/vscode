/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRectangle } from '../../window/common/window.js';

/**
 * A window of macOS, as `CGWindowListCopyWindowInfo` describes it.
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
	/** Whether the screen shows the window, which it doesn't on another Space, nor when it is minimized or hidden. */
	readonly onScreen: boolean;
	/** The title of the window, which macOS only tells with the Screen Recording permission. Hidden windows have none. */
	readonly title: string | undefined;
}

/** The windows of macOS, and the applications that the user used. */
export interface IScreenWindows {
	/** The process of the frontmost application, which has the focus. */
	readonly frontmostPid: number | undefined;
	/** The processes of the visible applications, from the one in front to the one used longest ago. */
	readonly recentPids: readonly number[];
	/** The windows, front to back, including those that the screen doesn't show. */
	readonly windows: readonly IScreenWindow[];
}

/** The size that a window needs to be the one that a capture takes, rather than a strip that an app floats over its window. */
const MIN_CAPTURED_SIZE = 100;

/** Whether a capture can take the window: a normal window, visible and big enough. */
function isCapturedWindow(window: IScreenWindow): boolean {
	return window.layer === 0 && window.alpha > 0 && window.bounds.width >= MIN_CAPTURED_SIZE && window.bounds.height >= MIN_CAPTURED_SIZE;
}

/**
 * Orders the windows of other applications so that the first one is the window that a capture takes. Windows that the
 * screen shows come first, front to back: the windows of the frontmost application, unless it is VS Code, then the
 * others. A window only comes first when a capture can take it, see `eligible`; the toolbars and badges that some apps
 * float over their windows come after. The windows that the screen doesn't show keep their order, last. Also returns
 * where each window shows.
 */
export function orderAppWindowSources<T extends { readonly id: string }>(sources: readonly T[], screen: IScreenWindows, ownPid: number): { readonly source: T; readonly bounds: IRectangle | undefined; readonly eligible: boolean }[] {
	const onScreen = new Map(screen.windows.filter(window => window.onScreen).map((window, index) => [String(window.id), { window, index }]));
	return sources
		.map((source, position) => {
			const shown = onScreen.get(getWindowHandle(source.id) ?? '');
			const window = shown?.window;
			const group = !window ? 3 : !isCapturedWindow(window) ? 2 : window.pid === screen.frontmostPid && screen.frontmostPid !== ownPid ? 0 : 1;
			return { source, bounds: window?.bounds, eligible: group < 2, group, index: shown?.index ?? 0, position };
		})
		.sort((a, b) => a.group - b.group || a.index - b.index || a.position - b.position)
		.map(({ source, bounds, eligible }) => ({ source, bounds, eligible }));
}

/**
 * Returns the window that the user left for VS Code when the screen shows none that a capture could take, as when VS
 * Code is in full screen, in a Space of its own: the front window of the application that they used last, other than
 * VS Code, wherever it is. Only a window with a title qualifies, as applications keep hidden windows without one.
 */
export function findRecentAppWindow(screen: IScreenWindows, ownPid: number): IScreenWindow | undefined {
	for (const pid of screen.recentPids) {
		const window = pid === ownPid ? undefined : screen.windows.find(window => window.pid === pid && !!window.title && isCapturedWindow(window));
		if (window) {
			return window;
		}
	}
	return undefined;
}

/** The desktop media source id of a window of macOS, which `getUserMedia` captures even when desktop media sources leave it out. */
export function getWindowSourceId(window: IScreenWindow): string {
	return `window:${window.id}:0`;
}

/** The number of a window of macOS, from its desktop media source id, or `undefined` when the id is not a window's. */
export function getScreenWindowId(sourceId: string): number | undefined {
	const handle = getWindowHandle(sourceId);
	return handle && /^\d+$/.test(handle) ? Number(handle) : undefined;
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
