/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { negotiateProtocolVersion } from '../../../../../common/state/protocol/version/registry.js';

suite('Protocol version negotiation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts the released caret ranges', () => {
		const cases: ReadonlyArray<readonly [string, string | undefined]> = [
			['0.9.0', '0.9.0'],
			['0.9.5', '0.9.5'],
			['0.8.0', undefined],
			['0.10.0', undefined],
			['1.0.0', '1.0.0'],
			['1.2.3', '1.2.3'],
			['1.99.0', '1.99.0'],
			['2.0.0', undefined],
		];
		assert.deepStrictEqual(cases.map(([offered]) => negotiateProtocolVersion([offered])), cases.map(([, expected]) => expected));
	});

	test('negotiate picks the highest compatible offered version', () => {
		const offered = [
			['0.9.0', '0.9.2', '0.9.1'],
			['0.9.0', '1.0.0'],
			['0.8.0', '2.0.0'],
			[],
			['1.5.0', '1.0.0', '0.9.0'],
		];
		assert.deepStrictEqual(offered.map(versions => negotiateProtocolVersion(versions)), ['0.9.2', '1.0.0', undefined, undefined, '1.5.0']);
	});

	test('rejects malformed versions even alongside a valid offer', () => {
		for (const version of ['0.9', '01.0.0', '1.0.0-beta', '1.0.0+build', '1.0.0\n', 'not-a-version']) {
			assert.throws(() => negotiateProtocolVersion(['1.0.0', version]), /Invalid protocol version/);
		}
	});
});
