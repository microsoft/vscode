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
	/**
	 * Whether the window is on a Space, even one that the screen doesn't show, as minimized windows and those of hidden
	 * applications are too. The windows that applications keep hidden, some with titles, are on none. `undefined` when
	 * macOS doesn't tell, as only a private API of macOS does.
	 */
	readonly onSpace: boolean | undefined;
	/** The title of the window, which macOS only tells with the Screen Recording permission. */
	readonly title: string | undefined;
	/** The path of the bundle of the window's application, which has its icon, or `undefined` when it has none. */
	readonly appPath: string | undefined;
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

/** A window of another application, in the order of {@link orderAppWindows}. */
export type OrderedAppWindow<T> =
	/** A desktop media source, with the window that it is when the screen shows it. */
	| { readonly source: T; readonly window: IScreenWindow | undefined }
	/** A window that the screen doesn't show, which desktop media sources leave out. */
	| { readonly source: undefined; readonly window: IScreenWindow };

/**
 * Orders the windows of other applications so that the first one is the window that a capture takes, and adds the
 * windows that the screen doesn't show, which desktop media sources leave out.
 *
 * Windows that the screen shows come first, front to back: the windows of the frontmost application, unless it is VS
 * Code, then the others. Only windows that a capture can take come there.
 *
 * Then come the windows on other Spaces, minimized or of hidden applications: those of the applications that the user
 * used last first, then front to back. So when the screen shows no window that a capture can take, as when VS Code is
 * in full screen, in a Space of its own, a capture takes the front window of the application that the user used last.
 *
 * The toolbars and badges that some apps float over their windows come last, then the sources that the screen doesn't
 * show.
 */
export function orderAppWindows<T extends { readonly id: string }>(sources: readonly T[], screen: IScreenWindows, ownPid: number): OrderedAppWindow<T>[] {
	const onScreen = new Map(screen.windows.filter(window => window.onScreen).map((window, index) => [String(window.id), { window, index }]));
	const sorted = sources
		.map((source, position) => {
			const match = onScreen.get(getWindowHandle(source.id) ?? '');
			const window = match?.window;
			const group = !window ? 3 : !isCapturedWindow(window) ? 2 : window.pid === screen.frontmostPid && screen.frontmostPid !== ownPid ? 0 : 1;
			return { source, window, group, index: match?.index ?? 0, position };
		})
		.sort((a, b) => a.group - b.group || a.index - b.index || a.position - b.position);
	const captured = sorted.filter(({ group }) => group < 2);
	const offScreen = getOffScreenWindows(screen, ownPid, !captured.length);
	const offScreenHandles = new Set(offScreen.map(window => String(window.id)));
	return [
		...captured.map(({ source, window }) => ({ source, window })),
		...offScreen.map(window => ({ source: undefined, window })),
		...sorted.filter(({ source, group }) => group > 1 && !offScreenHandles.has(getWindowHandle(source.id) ?? '')).map(({ source, window }) => ({ source, window })),
	];
}

/**
 * Returns the titled windows of other applications that the screen doesn't show and that a capture can take: those of
 * the applications that the user used last first, then front to back. Applications also keep hidden windows, which are
 * on no Space. Without knowing which windows are on a Space, it can't tell those apart, so it only returns the front
 * window of the application that the user used last, when the screen shows no window that a capture can take.
 */
function getOffScreenWindows(screen: IScreenWindows, ownPid: number, noneOnScreen: boolean): IScreenWindow[] {
	const recency = (pid: number) => {
		const index = screen.recentPids.indexOf(pid);
		return index < 0 ? screen.recentPids.length : index;
	};
	const windows = screen.windows
		.filter(window => !window.onScreen && window.onSpace !== false && window.pid !== ownPid && !!window.title && isCapturedWindow(window))
		.sort((a, b) => recency(a.pid) - recency(b.pid));
	if (windows.some(window => window.onSpace === undefined)) {
		const recent = windows[0];
		return noneOnScreen && screen.recentPids.includes(recent.pid) ? [recent] : [];
	}
	return windows;
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
