/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolveViewNavigationTarget, ViewNavigationDirection } from '../../../browser/actions/viewNavigationModel.js';
import { standardSnapshot } from './viewNavigationFixtures.js';

// Retain explicit expected destinations independently of the implementation.
// Table-driven cases cover all 7 anchors, 4 directions, and both wrap modes,
// while keeping the regression matrix easy to review and extend.
type NavigationCase = readonly [
	from: string,
	direction: ViewNavigationDirection,
	wrap: boolean,
	expectedViewId: string | undefined,
	expectedContainerId: string | undefined,
	expectedIndex: number | undefined,
	expectedTotal: number | undefined
];

const cases: readonly NavigationCase[] = [
	['a', 'next', true, 'b', 'explorer', 1, 7],
	['a', 'next', false, 'b', 'explorer', 1, 7],
	['a', 'previous', true, 'g', 'problems', 6, 7],
	['a', 'previous', false, undefined, undefined, undefined, undefined],
	['a', 'first', true, 'a', 'explorer', 0, 7],
	['a', 'first', false, 'a', 'explorer', 0, 7],
	['a', 'last', true, 'g', 'problems', 6, 7],
	['a', 'last', false, 'g', 'problems', 6, 7],
	['b', 'next', true, 'c', 'explorer', 2, 7],
	['b', 'next', false, 'c', 'explorer', 2, 7],
	['b', 'previous', true, 'a', 'explorer', 0, 7],
	['b', 'previous', false, 'a', 'explorer', 0, 7],
	['b', 'first', true, 'a', 'explorer', 0, 7],
	['b', 'first', false, 'a', 'explorer', 0, 7],
	['b', 'last', true, 'g', 'problems', 6, 7],
	['b', 'last', false, 'g', 'problems', 6, 7],
	['c', 'next', true, 'd', 'auxiliary', 3, 7],
	['c', 'next', false, 'd', 'auxiliary', 3, 7],
	['c', 'previous', true, 'b', 'explorer', 1, 7],
	['c', 'previous', false, 'b', 'explorer', 1, 7],
	['c', 'first', true, 'a', 'explorer', 0, 7],
	['c', 'first', false, 'a', 'explorer', 0, 7],
	['c', 'last', true, 'g', 'problems', 6, 7],
	['c', 'last', false, 'g', 'problems', 6, 7],
	['d', 'next', true, 'e', 'auxiliary', 4, 7],
	['d', 'next', false, 'e', 'auxiliary', 4, 7],
	['d', 'previous', true, 'c', 'explorer', 2, 7],
	['d', 'previous', false, 'c', 'explorer', 2, 7],
	['d', 'first', true, 'a', 'explorer', 0, 7],
	['d', 'first', false, 'a', 'explorer', 0, 7],
	['d', 'last', true, 'g', 'problems', 6, 7],
	['d', 'last', false, 'g', 'problems', 6, 7],
	['e', 'next', true, 'f', 'problems', 5, 7],
	['e', 'next', false, 'f', 'problems', 5, 7],
	['e', 'previous', true, 'd', 'auxiliary', 3, 7],
	['e', 'previous', false, 'd', 'auxiliary', 3, 7],
	['e', 'first', true, 'a', 'explorer', 0, 7],
	['e', 'first', false, 'a', 'explorer', 0, 7],
	['e', 'last', true, 'g', 'problems', 6, 7],
	['e', 'last', false, 'g', 'problems', 6, 7],
	['f', 'next', true, 'g', 'problems', 6, 7],
	['f', 'next', false, 'g', 'problems', 6, 7],
	['f', 'previous', true, 'e', 'auxiliary', 4, 7],
	['f', 'previous', false, 'e', 'auxiliary', 4, 7],
	['f', 'first', true, 'a', 'explorer', 0, 7],
	['f', 'first', false, 'a', 'explorer', 0, 7],
	['f', 'last', true, 'g', 'problems', 6, 7],
	['f', 'last', false, 'g', 'problems', 6, 7],
	['g', 'next', true, 'a', 'explorer', 0, 7],
	['g', 'next', false, undefined, undefined, undefined, undefined],
	['g', 'previous', true, 'f', 'problems', 5, 7],
	['g', 'previous', false, 'f', 'problems', 5, 7],
	['g', 'first', true, 'a', 'explorer', 0, 7],
	['g', 'first', false, 'a', 'explorer', 0, 7],
	['g', 'last', true, 'g', 'problems', 6, 7],
	['g', 'last', false, 'g', 'problems', 6, 7],
];

suite('Workbench view navigation: workbench focus matrix', () => {
	for (const [from, direction, wrap, expectedViewId, expectedContainerId, expectedIndex, expectedTotal] of cases) {
		test(`workbench: ${direction} from ${from} (${wrap ? 'wrap' : 'no wrap'}) goes to ${expectedViewId ?? 'none'}`, () => {
			const result = resolveViewNavigationTarget(standardSnapshot(from), {
				scope: 'workbench',
				direction,
				wrap
			});
			assert.strictEqual(result?.viewId, expectedViewId);
			assert.strictEqual(result?.containerId, expectedContainerId);
			assert.strictEqual(result?.index, expectedIndex);
			assert.strictEqual(result?.total, expectedTotal);
		});
	}
});
