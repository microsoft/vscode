/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IScreenWindow, IScreenWindows } from '../common/appWindows.js';

/**
 * Lists the normal windows of macOS with Core Graphics, front to back, including those on other Spaces, from JavaScript
 * for Automation. Unlike their titles, which need the Screen Recording permission, where windows are is not private.
 * It prints them as JSON.
 */
const SCRIPT = `ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run() {
	const frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
	const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID))) || [];
	return JSON.stringify({
		frontmostPid: frontmost.isNil() ? undefined : frontmost.processIdentifier,
		windows: windows.filter(window => window.kCGWindowLayer === 0).map(window => ({
			id: window.kCGWindowNumber,
			pid: window.kCGWindowOwnerPID,
			layer: window.kCGWindowLayer,
			alpha: window.kCGWindowAlpha,
			bounds: { x: window.kCGWindowBounds.X, y: window.kCGWindowBounds.Y, width: window.kCGWindowBounds.Width, height: window.kCGWindowBounds.Height },
			onScreen: !!window.kCGWindowIsOnscreen,
			title: window.kCGWindowName || undefined,
		})),
	});
}`;

/** How long listing the windows may take before a capture goes ahead without knowing where they are. */
const TIMEOUT = 2000;

/** How many of the applications that the user used last are looked up, which is enough to get past VS Code. */
const MAX_RECENT_APPLICATIONS = 4;

/** How long capturing a window may take. */
const CAPTURE_TIMEOUT = 5000;

/** Lists the windows of macOS and the applications that the user used, or returns `undefined` when it can't. */
export async function getMacScreenWindows(logService: ILogService): Promise<IScreenWindows | undefined> {
	const [windows, recentPids] = await Promise.all([
		run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT]).then(output => output === undefined ? undefined : parseScreenWindows(output)),
		getRecentPids(),
	]);
	if (!windows) {
		logService.warn('[AppWindows] Listing the windows on screen failed, so captures do not show where the window is.');
		return undefined;
	}
	return { ...windows, recentPids };
}

/** The processes of the visible applications, from the one in front to the one used longest ago, as Launch Services orders them. */
async function getRecentPids(): Promise<number[]> {
	const list = await run('/usr/bin/lsappinfo', ['visibleProcessList']);
	const applications = Array.from(list?.matchAll(/(?<asn>ASN:0x[0-9a-f]+-0x[0-9a-f]+)/gi) ?? [], match => match.groups?.asn).slice(0, MAX_RECENT_APPLICATIONS);
	const pids = await Promise.all(applications.map(async asn => {
		const info = asn ? await run('/usr/bin/lsappinfo', ['info', '-only', 'pid', asn]) : undefined;
		return Number(/"pid"=(?<pid>\d+)/.exec(info ?? '')?.groups?.pid);
	}));
	return pids.filter(pid => Number.isInteger(pid) && pid > 0);
}

/**
 * Captures a window of macOS as a PNG, without its shadow, with the system's `screencapture`. Unlike a desktop media
 * stream, a single screenshot doesn't make macOS mark the window as shared, and it also captures windows on other
 * Spaces. Returns `undefined` when the capture failed.
 */
export async function captureMacWindow(windowId: number, logService: ILogService): Promise<Buffer | undefined> {
	const file = join(tmpdir(), `vscode-window-${generateUuid()}.png`);
	try {
		await new Promise<void>((resolve, reject) => {
			execFile('/usr/sbin/screencapture', [`-l${windowId}`, '-o', '-x', '-tpng', file], { timeout: CAPTURE_TIMEOUT }, error => error ? reject(error) : resolve());
		});
		return await fs.promises.readFile(file);
	} catch (error) {
		logService.error('[AppWindows] Capturing the window failed:', error);
		return undefined;
	} finally {
		await fs.promises.rm(file, { force: true });
	}
}

function run(command: string, args: readonly string[]): Promise<string | undefined> {
	return new Promise(resolve => {
		execFile(command, args, { timeout: TIMEOUT, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve(error ? undefined : stdout));
	});
}

function parseScreenWindows(output: string): Omit<IScreenWindows, 'recentPids'> | undefined {
	let value: unknown;
	try {
		value = JSON.parse(output);
	} catch {
		return undefined;
	}
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
		&& typeof window.onScreen === 'boolean' && (window.title === undefined || typeof window.title === 'string')
		&& typeof bounds === 'object' && bounds !== null
		&& typeof bounds.x === 'number' && typeof bounds.y === 'number' && typeof bounds.width === 'number' && typeof bounds.height === 'number';
}
