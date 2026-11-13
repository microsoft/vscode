/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { ILogService } from '../../log/common/log.js';
import { IScreenWindow } from '../common/appWindows.js';

/**
 * Lists the windows on screen with Core Graphics, from JavaScript for Automation, which needs no permission: unlike
 * their titles, where windows show is not private. It prints them as JSON.
 */
const SCRIPT = `ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run() {
	const frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
	const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID))) || [];
	return JSON.stringify({
		frontmostPid: frontmost.isNil() ? undefined : frontmost.processIdentifier,
		windows: windows.map(window => ({
			id: window.kCGWindowNumber,
			pid: window.kCGWindowOwnerPID,
			layer: window.kCGWindowLayer,
			alpha: window.kCGWindowAlpha,
			bounds: { x: window.kCGWindowBounds.X, y: window.kCGWindowBounds.Y, width: window.kCGWindowBounds.Width, height: window.kCGWindowBounds.Height },
		})),
	});
}`;

/** How long listing the windows may take before a capture goes ahead without knowing where they are. */
const TIMEOUT = 2000;

export interface IScreenWindows {
	/** The process of the frontmost application, which has the focus. */
	readonly frontmostPid: number | undefined;
	/** The windows on screen, front to back. */
	readonly windows: readonly IScreenWindow[];
}

/** Lists the windows that macOS shows on screen, front to back, or returns `undefined` when it can't. */
export function getMacScreenWindows(logService: ILogService): Promise<IScreenWindows | undefined> {
	return new Promise(resolve => {
		execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT], { timeout: TIMEOUT, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
			let screenWindows: IScreenWindows | undefined;
			if (!error) {
				try {
					screenWindows = parseScreenWindows(JSON.parse(stdout));
				} catch {
					// Reported below, like a script that failed.
				}
			}
			if (!screenWindows) {
				logService.warn('[AppWindows] Listing the windows on screen failed, so captures do not show where the window is:', error ?? stdout.slice(0, 200));
			}
			resolve(screenWindows);
		});
	});
}

function parseScreenWindows(value: unknown): IScreenWindows | undefined {
	const list = typeof value === 'object' && value !== null ? value as { readonly frontmostPid?: unknown; readonly windows?: unknown } : undefined;
	if (!list || !Array.isArray(list.windows)) {
		return undefined;
	}
	return { frontmostPid: typeof list.frontmostPid === 'number' ? list.frontmostPid : undefined, windows: list.windows.filter(isScreenWindow) };
}

function isScreenWindow(value: unknown): value is IScreenWindow {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const window = value as Partial<Record<keyof IScreenWindow, unknown>>;
	const bounds = window.bounds as Partial<Record<keyof IScreenWindow['bounds'], unknown>> | undefined;
	return typeof window.id === 'number' && typeof window.pid === 'number' && typeof window.layer === 'number' && typeof window.alpha === 'number'
		&& typeof bounds === 'object' && bounds !== null
		&& typeof bounds.x === 'number' && typeof bounds.y === 'number' && typeof bounds.width === 'number' && typeof bounds.height === 'number';
}
