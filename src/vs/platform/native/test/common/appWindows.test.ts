/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { excludeOwnWindowSources, IScreenWindow, orderAppWindowSources } from '../../common/appWindows.js';

suite('excludeOwnWindowSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves out the windows of VS Code by their handle, and keeps the order of the others', () => {
		const sources = [{ id: 'window:11:0' }, { id: 'window:22:0' }, { id: 'window:33:1' }, { id: 'window:44:0' }];

		assert.deepStrictEqual(excludeOwnWindowSources(sources, ['window:22:0', 'window:33:0', 'invalid']).map(source => source.id), ['window:11:0', 'window:44:0']);
	});
});

suite('orderAppWindowSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const OWN_PID = 1;
	const BROWSER_PID = 2;
	const OTHER_PID = 3;

	function screenWindow(id: number, pid: number, options: { readonly layer?: number; readonly alpha?: number; readonly width?: number; readonly height?: number } = {}): IScreenWindow {
		return { id, pid, layer: options.layer ?? 0, alpha: options.alpha ?? 1, bounds: { x: id, y: 0, width: options.width ?? 800, height: options.height ?? 600 } };
	}

	const sources = ['window:10:0', 'window:20:0', 'window:30:0', 'window:40:0', 'window:50:0', 'window:60:0'].map(id => ({ id }));
	// Front to back: a toolbar strip of the browser, a window of another app, the browser's window, a panel and a hidden window.
	const screenWindows = [
		screenWindow(20, BROWSER_PID, { height: 68 }),
		screenWindow(30, OTHER_PID),
		screenWindow(40, BROWSER_PID),
		screenWindow(50, OTHER_PID, { layer: 3 }),
		screenWindow(60, OTHER_PID, { alpha: 0 }),
	];
	const order = (frontmostPid: number | undefined) => orderAppWindowSources(sources, screenWindows, frontmostPid, OWN_PID).map(({ source, bounds }) => `${source.id} ${bounds ? bounds.x : '-'}`);

	test('puts the window to capture first: of the frontmost app unless it is VS Code, a normal window and big enough', () => {
		assert.deepStrictEqual({
			browserInFront: order(BROWSER_PID),
			vsCodeInFront: order(OWN_PID),
		}, {
			browserInFront: ['window:40:0 40', 'window:30:0 30', 'window:20:0 20', 'window:50:0 50', 'window:60:0 60', 'window:10:0 -'],
			vsCodeInFront: ['window:30:0 30', 'window:40:0 40', 'window:20:0 20', 'window:50:0 50', 'window:60:0 60', 'window:10:0 -'],
		});
	});
});
