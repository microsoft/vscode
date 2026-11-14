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
	['a', 'next', true, 'b', 'explorer', 1, 3],
	['a', 'next', false, 'b', 'explorer', 1, 3],
	['a', 'previous', true, 'c', 'explorer', 2, 3],
	['a', 'previous', false, undefined, undefined, undefined, undefined],
	['a', 'first', true, 'a', 'explorer', 0, 3],
	['a', 'first', false, 'a', 'explorer', 0, 3],
	['a', 'last', true, 'c', 'explorer', 2, 3],
	['a', 'last', false, 'c', 'explorer', 2, 3],
	['b', 'next', true, 'c', 'explorer', 2, 3],
	['b', 'next', false, 'c', 'explorer', 2, 3],
	['b', 'previous', true, 'a', 'explorer', 0, 3],
	['b', 'previous', false, 'a', 'explorer', 0, 3],
	['b', 'first', true, 'a', 'explorer', 0, 3],
	['b', 'first', false, 'a', 'explorer', 0, 3],
	['b', 'last', true, 'c', 'explorer', 2, 3],
	['b', 'last', false, 'c', 'explorer', 2, 3],
	['c', 'next', true, 'a', 'explorer', 0, 3],
	['c', 'next', false, undefined, undefined, undefined, undefined],
	['c', 'previous', true, 'b', 'explorer', 1, 3],
	['c', 'previous', false, 'b', 'explorer', 1, 3],
	['c', 'first', true, 'a', 'explorer', 0, 3],
	['c', 'first', false, 'a', 'explorer', 0, 3],
	['c', 'last', true, 'c', 'explorer', 2, 3],
	['c', 'last', false, 'c', 'explorer', 2, 3],
	['d', 'next', true, 'e', 'auxiliary', 1, 2],
	['d', 'next', false, 'e', 'auxiliary', 1, 2],
	['d', 'previous', true, 'e', 'auxiliary', 1, 2],
	['d', 'previous', false, undefined, undefined, undefined, undefined],
	['d', 'first', true, 'd', 'auxiliary', 0, 2],
	['d', 'first', false, 'd', 'auxiliary', 0, 2],
	['d', 'last', true, 'e', 'auxiliary', 1, 2],
	['d', 'last', false, 'e', 'auxiliary', 1, 2],
	['e', 'next', true, 'd', 'auxiliary', 0, 2],
	['e', 'next', false, undefined, undefined, undefined, undefined],
	['e', 'previous', true, 'd', 'auxiliary', 0, 2],
	['e', 'previous', false, 'd', 'auxiliary', 0, 2],
	['e', 'first', true, 'd', 'auxiliary', 0, 2],
	['e', 'first', false, 'd', 'auxiliary', 0, 2],
	['e', 'last', true, 'e', 'auxiliary', 1, 2],
	['e', 'last', false, 'e', 'auxiliary', 1, 2],
	['f', 'next', true, 'g', 'problems', 1, 2],
	['f', 'next', false, 'g', 'problems', 1, 2],
	['f', 'previous', true, 'g', 'problems', 1, 2],
	['f', 'previous', false, undefined, undefined, undefined, undefined],
	['f', 'first', true, 'f', 'problems', 0, 2],
	['f', 'first', false, 'f', 'problems', 0, 2],
	['f', 'last', true, 'g', 'problems', 1, 2],
	['f', 'last', false, 'g', 'problems', 1, 2],
	['g', 'next', true, 'f', 'problems', 0, 2],
	['g', 'next', false, undefined, undefined, undefined, undefined],
	['g', 'previous', true, 'f', 'problems', 0, 2],
	['g', 'previous', false, 'f', 'problems', 0, 2],
	['g', 'first', true, 'f', 'problems', 0, 2],
	['g', 'first', false, 'f', 'problems', 0, 2],
	['g', 'last', true, 'g', 'problems', 1, 2],
	['g', 'last', false, 'g', 'problems', 1, 2],
];

suite('Workbench view navigation: container focus matrix', () => {
	for (const [from, direction, wrap, expectedViewId, expectedContainerId, expectedIndex, expectedTotal] of cases) {
		test(`container: ${direction} from ${from} (${wrap ? 'wrap' : 'no wrap'}) goes to ${expectedViewId ?? 'none'}`, () => {
			const result = resolveViewNavigationTarget(standardSnapshot(from), {
				scope: 'container',
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
