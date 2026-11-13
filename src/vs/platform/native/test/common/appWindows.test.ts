/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { excludeOwnWindowSources, findRecentAppWindow, getScreenWindowId, IScreenWindow, orderAppWindowSources } from '../../common/appWindows.js';

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

suite('orderAppWindowSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const OWN_PID = 1;
	const BROWSER_PID = 2;
	const OTHER_PID = 3;

	function screenWindow(id: number, pid: number, options: { readonly layer?: number; readonly alpha?: number; readonly height?: number; readonly onScreen?: boolean; readonly untitled?: boolean } = {}): IScreenWindow {
		return { id, pid, layer: options.layer ?? 0, alpha: options.alpha ?? 1, bounds: { x: id, y: 0, width: 800, height: options.height ?? 600 }, onScreen: options.onScreen ?? true, title: options.untitled ? undefined : 'Window' };
	}

	function order(sources: readonly string[], windows: readonly IScreenWindow[], frontmostPid: number | undefined) {
		return orderAppWindowSources(sources.map(id => ({ id })), { frontmostPid, recentPids: [], windows }, OWN_PID).map(({ source, bounds, eligible }) => `${source.id} ${bounds ? bounds.x : '-'}${eligible ? '' : ' ineligible'}`);
	}

	test('puts the window to capture first: of the frontmost app unless it is VS Code, a normal window and big enough', () => {
		const sources = ['window:10:0', 'window:20:0', 'window:30:0', 'window:40:0', 'window:50:0', 'window:60:0', 'window:70:0'];
		// Front to back: a toolbar strip of the browser, a window of another app, the browser's window, a panel, a transparent window and one on another Space.
		const windows = [
			screenWindow(20, BROWSER_PID, { height: 68 }),
			screenWindow(30, OTHER_PID),
			screenWindow(40, BROWSER_PID),
			screenWindow(50, OTHER_PID, { layer: 3 }),
			screenWindow(60, OTHER_PID, { alpha: 0 }),
			screenWindow(70, OTHER_PID, { onScreen: false }),
		];

		assert.deepStrictEqual({
			browserInFront: order(sources, windows, BROWSER_PID),
			vsCodeInFront: order(sources, windows, OWN_PID),
		}, {
			browserInFront: ['window:40:0 40', 'window:30:0 30', 'window:20:0 20 ineligible', 'window:50:0 50 ineligible', 'window:60:0 60 ineligible', 'window:10:0 - ineligible', 'window:70:0 - ineligible'],
			vsCodeInFront: ['window:30:0 30', 'window:40:0 40', 'window:20:0 20 ineligible', 'window:50:0 50 ineligible', 'window:60:0 60 ineligible', 'window:10:0 - ineligible', 'window:70:0 - ineligible'],
		});
	});

	test('finds the window that the user left for VS Code: the titled window of the app used last, on another Space too', () => {
		const windows = [
			screenWindow(10, OWN_PID, { onScreen: true }),
			screenWindow(20, BROWSER_PID, { onScreen: false, untitled: true }),
			screenWindow(30, BROWSER_PID, { onScreen: false, height: 68 }),
			screenWindow(40, BROWSER_PID, { onScreen: false }),
			screenWindow(50, OTHER_PID, { onScreen: false }),
		];
		const find = (recentPids: readonly number[]) => findRecentAppWindow({ frontmostPid: OWN_PID, recentPids, windows }, OWN_PID)?.id;

		assert.deepStrictEqual({
			browserUsedLast: find([OWN_PID, BROWSER_PID, OTHER_PID]),
			otherUsedLast: find([OWN_PID, OTHER_PID, BROWSER_PID]),
			onlyVSCode: find([OWN_PID]),
		}, {
			browserUsedLast: 40,
			otherUsedLast: 50,
			onlyVSCode: undefined,
		});
	});
});
