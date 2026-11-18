/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { excludeOwnWindowSources, findOwnWindowShowingArea, getScreenWindowId, getSelectableWindows, IScreenWindow, orderAppWindows } from '../../common/appWindows.js';

suite('excludeOwnWindowSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves out the windows of VS Code by their handle, and keeps the order of the others', () => {
		const sources = [{ id: 'window:11:0' }, { id: 'window:22:0' }, { id: 'window:33:1' }, { id: 'window:44:0' }];

		assert.deepStrictEqual(excludeOwnWindowSources(sources, ['window:22:0', 'window:33:0', 'invalid']).map(source => source.id), ['window:11:0', 'window:44:0']);
	});
});

suite('getScreenWindowId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the number of a window of macOS from its source id', () => {
		assert.deepStrictEqual(['window:4242:0', 'window:4242:1', 'screen:1:0', 'window:0x2a:0', 'window::0', 'invalid'].map(getScreenWindowId), [4242, 4242, undefined, undefined, undefined, undefined]);
	});
});

suite('orderAppWindows', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const OWN_PID = 1;
	const BROWSER_PID = 2;
	const OTHER_PID = 3;
	const EDITOR_PID = 4;

	function screenWindow(id: number, pid: number, options: { readonly layer?: number; readonly alpha?: number; readonly height?: number; readonly onScreen?: boolean; readonly onSpace?: boolean; readonly untitled?: boolean } = {}): IScreenWindow {
		return { id, pid, layer: options.layer ?? 0, alpha: options.alpha ?? 1, bounds: { x: id, y: 0, width: 800, height: options.height ?? 600 }, onScreen: options.onScreen ?? true, onSpace: options.onSpace ?? true, title: options.untitled ? undefined : 'Window', appName: undefined, appPath: undefined };
	}

	function order(sources: readonly string[], windows: readonly IScreenWindow[], frontmostPid: number | undefined, recentPids: readonly number[] = []) {
		return orderAppWindows(sources.map(id => ({ id })), { frontmostPid, recentPids, windows }, OWN_PID).map(({ source, window }) => `${source?.id ?? 'off screen'} ${window ? window.bounds.x : '-'}`);
	}

	test('puts the window to capture first: of the frontmost app unless it is VS Code, a normal window and big enough', () => {
		const sources = ['window:10:0', 'window:20:0', 'window:30:0', 'window:40:0', 'window:50:0', 'window:60:0', 'window:70:0'];
		// Front to back: a toolbar strip of the browser, a window of another app, the browser's window, a panel, a transparent window and a hidden one.
		const windows = [
			screenWindow(20, BROWSER_PID, { height: 68 }),
			screenWindow(30, OTHER_PID),
			screenWindow(40, BROWSER_PID),
			screenWindow(50, OTHER_PID, { layer: 3 }),
			screenWindow(60, OTHER_PID, { alpha: 0 }),
			screenWindow(70, OTHER_PID, { onScreen: false, onSpace: false }),
		];

		assert.deepStrictEqual({
			browserInFront: order(sources, windows, BROWSER_PID),
			vsCodeInFront: order(sources, windows, OWN_PID),
		}, {
			browserInFront: ['window:40:0 40', 'window:30:0 30', 'window:20:0 20', 'window:50:0 50', 'window:60:0 60', 'window:10:0 -', 'window:70:0 -'],
			vsCodeInFront: ['window:30:0 30', 'window:40:0 40', 'window:20:0 20', 'window:50:0 50', 'window:60:0 60', 'window:10:0 -', 'window:70:0 -'],
		});
	});

	test('adds the titled windows on other Spaces after those to capture on screen: of the apps used last first, then front to back', () => {
		const sources = ['window:10:0', 'window:20:0', 'window:60:0'];
		// Front to back: the browser's window and its toolbar strip on screen, then windows that the screen doesn't show:
		// another app's, VS Code's, the editor's, another app's that desktop media sources listed too, a hidden window of the
		// editor with a title, an untitled one, a strip, and the browser's.
		const windows = [
			screenWindow(10, BROWSER_PID),
			screenWindow(20, BROWSER_PID, { height: 68 }),
			screenWindow(30, OTHER_PID, { onScreen: false }),
			screenWindow(40, OWN_PID, { onScreen: false }),
			screenWindow(50, EDITOR_PID, { onScreen: false }),
			screenWindow(60, OTHER_PID, { onScreen: false }),
			screenWindow(70, EDITOR_PID, { onScreen: false, onSpace: false }),
			screenWindow(80, EDITOR_PID, { onScreen: false, untitled: true }),
			screenWindow(90, OTHER_PID, { onScreen: false, height: 68 }),
			screenWindow(100, BROWSER_PID, { onScreen: false }),
		];

		assert.deepStrictEqual(order(sources, windows, BROWSER_PID, [BROWSER_PID, OWN_PID, EDITOR_PID]), ['window:10:0 10', 'off screen 100', 'off screen 50', 'off screen 30', 'off screen 60', 'window:20:0 20']);
	});

	test('takes the window that the user left for VS Code when the screen shows none to capture, as in full screen', () => {
		// Only VS Code shows, and on other Spaces: a hidden window of the browser with a title, the browser's window and another app's.
		const windows = [
			screenWindow(10, OWN_PID),
			screenWindow(20, BROWSER_PID, { onScreen: false, onSpace: false }),
			screenWindow(30, BROWSER_PID, { onScreen: false }),
			screenWindow(40, OTHER_PID, { onScreen: false }),
		];
		// Without the private API, which windows are on a Space is unknown: then only the front window of the app used last comes, when the screen shows none to capture.
		const spacesUnknown = [...windows, screenWindow(50, OTHER_PID)].map(window => ({ ...window, onSpace: undefined }));

		assert.deepStrictEqual({
			browserUsedLast: order([], windows, OWN_PID, [OWN_PID, BROWSER_PID, OTHER_PID]),
			otherUsedLast: order([], windows, OWN_PID, [OWN_PID, OTHER_PID, BROWSER_PID]),
			spacesUnknown: order([], spacesUnknown, OWN_PID, [OWN_PID, BROWSER_PID, OTHER_PID]),
			spacesUnknownOnlyVSCodeUsed: order([], spacesUnknown, OWN_PID, [OWN_PID]),
			spacesUnknownWindowOnScreen: order(['window:50:0'], spacesUnknown, OTHER_PID, [OTHER_PID, BROWSER_PID]),
		}, {
			browserUsedLast: ['off screen 30', 'off screen 40'],
			otherUsedLast: ['off screen 40', 'off screen 30'],
			spacesUnknown: ['off screen 20'],
			spacesUnknownOnlyVSCodeUsed: [],
			spacesUnknownWindowOnScreen: ['window:50:0 50'],
		});
	});
});

suite('selectable windows', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const OWN_PID = 1;
	const BROWSER_PID = 2;

	function screenWindow(id: number, pid: number, bounds: { x: number; y: number; width: number; height: number }, options: { readonly layer?: number; readonly onScreen?: boolean; readonly title?: string; readonly appName?: string } = {}): IScreenWindow {
		return { id, pid, layer: options.layer ?? 0, alpha: 1, bounds, onScreen: options.onScreen ?? true, onSpace: true, title: options.title, appName: options.appName, appPath: undefined };
	}

	test('keeps the windows that the screen shows and that a capture can take, front to back, also those of VS Code', () => {
		const windows = getSelectableWindows([
			screenWindow(10, BROWSER_PID, { x: 0, y: 0, width: 800, height: 600 }, { title: 'Preview', appName: 'Browser' }),
			screenWindow(20, BROWSER_PID, { x: 0, y: 0, width: 800, height: 40 }, { appName: 'Browser' }),
			screenWindow(30, BROWSER_PID, { x: 0, y: 0, width: 800, height: 600 }, { appName: 'Browser', layer: 8 }),
			screenWindow(40, OWN_PID, { x: 100, y: 100, width: 800, height: 600 }, { title: 'app.ts', appName: 'Code' }),
			screenWindow(50, BROWSER_PID, { x: 0, y: 0, width: 800, height: 600 }, { appName: 'Browser', onScreen: false }),
			screenWindow(60, BROWSER_PID, { x: 0, y: 0, width: 800, height: 600 }, { appName: 'Browser' }),
		], OWN_PID);

		assert.deepStrictEqual(windows.map(window => `${window.id} ${window.appName}: ${window.name}${window.own ? ' (own)' : ''}`), [
			'10 Browser: Preview',
			'40 Code: app.ts (own)',
			'60 Browser: Browser',
		]);
	});

	test('finds the window of VS Code that alone shows an area, of all the windows that the screen shows', () => {
		const windows = [
			// The overlay that lets the user select, a panel of VS Code.
			screenWindow(5, OWN_PID, { x: 0, y: 0, width: 2000, height: 1500 }, { layer: 1000 }),
			// A small panel that another app floats above windows.
			screenWindow(8, BROWSER_PID, { x: 600, y: 100, width: 80, height: 80 }, { layer: 3 }),
			screenWindow(10, BROWSER_PID, { x: 0, y: 0, width: 400, height: 300 }, { appName: 'Browser' }),
			screenWindow(20, OWN_PID, { x: 0, y: 0, width: 1000, height: 800 }, { appName: 'Code' }),
		];
		const find = (area: { x: number; y: number; width: number; height: number }) => findOwnWindowShowingArea(area, windows, OWN_PID)?.id;

		assert.deepStrictEqual({
			onlyVSCode: find({ x: 500, y: 400, width: 200, height: 100 }),
			underFloatingPanel: find({ x: 550, y: 50, width: 200, height: 200 }),
			partlyBehindBrowser: find({ x: 300, y: 200, width: 200, height: 200 }),
			partlyOutsideVSCode: find({ x: 900, y: 700, width: 200, height: 200 }),
			browser: find({ x: 10, y: 10, width: 100, height: 100 }),
			desktop: find({ x: 1100, y: 900, width: 50, height: 50 }),
		}, {
			onlyVSCode: 20,
			underFloatingPanel: undefined,
			partlyBehindBrowser: undefined,
			partlyOutsideVSCode: undefined,
			browser: undefined,
			desktop: undefined,
		});
	});
});
