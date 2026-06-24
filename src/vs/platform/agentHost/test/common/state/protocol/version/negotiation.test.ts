/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isCompatibleProtocolVersion, negotiateProtocolVersion } from '../../../../../common/state/protocol/version/negotiation.js';

suite('Protocol version negotiation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matrix of compatibility rules', () => {
		const cases: ReadonlyArray<readonly [string, string, boolean]> = [
			// Exact match always works.
			['0.1.0', '0.1.0', true],
			['1.2.3', '1.2.3', true],
			// 0.x: minor must match; offered <= server.
			['0.1.0', '0.1.5', true],
			['0.1.5', '0.1.5', true],
			['0.1.5', '0.1.0', false],
			['0.2.0', '0.1.0', false],
			['0.0.1', '0.1.0', false],
			// >=1.x: same major; offered <= server.
			['1.0.0', '1.2.3', true],
			['1.2.3', '1.0.0', false],
			['2.0.0', '1.2.3', false],
			// Invalid versions: never compatible.
			['not-a-version', '0.1.0', false],
			['0.1.0', '0.1', false],
		];
		const actual = cases.map(([offered, server, expected]) => ({
			offered, server, expected, got: isCompatibleProtocolVersion(offered, server),
		}));
		assert.deepStrictEqual(
			actual.filter(c => c.got !== c.expected),
			[],
			'mismatched compatibility checks',
		);
	});

	test('negotiate picks the highest compatible offered version', () => {
		assert.strictEqual(negotiateProtocolVersion(['0.1.0', '0.1.2', '0.1.1'], '0.1.5'), '0.1.2');
		assert.strictEqual(negotiateProtocolVersion(['0.1.0', '0.2.0'], '0.1.0'), '0.1.0');
		assert.strictEqual(negotiateProtocolVersion(['0.0.5', '0.2.0'], '0.1.0'), undefined);
		assert.strictEqual(negotiateProtocolVersion([], '0.1.0'), undefined);
		// Order of offered versions does not affect the result.
		assert.strictEqual(negotiateProtocolVersion(['0.1.2', '0.1.0'], '0.1.5'), '0.1.2');
	});
});
