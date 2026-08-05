/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MAX_TUNNEL_NAME_LENGTH, normalizeTunnelName } from '../../common/remoteTunnel.js';

suite('Remote tunnel name normalization', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes names compatibly with the CLI', () => {
		assert.deepStrictEqual([
			normalizeTunnelName('Connor-PC'),
			normalizeTunnelName('---Connor PC!'),
			normalizeTunnelName('a'.repeat(MAX_TUNNEL_NAME_LENGTH + 1)),
			normalizeTunnelName('---!@#$'),
		], [
			'connor-pc',
			'connorpc',
			'a'.repeat(MAX_TUNNEL_NAME_LENGTH),
			'',
		]);
	});
});
