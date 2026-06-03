/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { shouldMoveActiveFocusInto } from '../../browser/parts/sessionsPart.js';

suite('Sessions - shouldMoveActiveFocusInto', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let grid: HTMLElement;
	let target: HTMLElement;
	let otherLeaf: HTMLElement;
	let outside: HTMLElement;

	setup(() => {
		// grid
		//  ├─ target (the session view to focus into)
		//  └─ otherLeaf (a sibling grid leaf)
		// outside (a different surface, e.g. the sessions list)
		grid = $('.grid');
		target = $('.target');
		otherLeaf = $('.other');
		grid.appendChild(target);
		grid.appendChild(otherLeaf);
		outside = $('.outside');
		document.body.appendChild(grid);
		document.body.appendChild(outside);
	});

	teardown(() => {
		grid.remove();
		outside.remove();
	});

	test('moves focus on startup restore (focus on body) and never steals it from other surfaces', () => {
		assert.deepStrictEqual(
			{
				onBody: shouldMoveActiveFocusInto(target, grid, document.body),
				onNull: shouldMoveActiveFocusInto(target, grid, null),
				fromOtherLeaf: shouldMoveActiveFocusInto(target, grid, otherLeaf),
				alreadyInTarget: shouldMoveActiveFocusInto(target, grid, target),
				fromOutsideSurface: shouldMoveActiveFocusInto(target, grid, outside),
				noGrid: shouldMoveActiveFocusInto(target, undefined, outside),
			},
			{
				onBody: true,            // startup restore
				onNull: true,            // nothing focused
				fromOtherLeaf: true,     // moving between grid leaves
				alreadyInTarget: false,  // no-op, focus already there
				fromOutsideSurface: false, // don't steal from the sessions list/dialog
				noGrid: false,
			},
		);
	});
});
