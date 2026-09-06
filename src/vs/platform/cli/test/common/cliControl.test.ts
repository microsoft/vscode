/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getUpdateCliRequest } from '../../common/cliControl.js';

suite('CLI Control', () => {
	test('creates update requests', () => {
		assert.deepStrictEqual(
			[
				getUpdateCliRequest({ _: [], update: { _: [], status: { _: [], json: true } } }),
				getUpdateCliRequest({ _: [], update: { _: [], install: { _: [], version: '1.2.3', force: true } } }),
				getUpdateCliRequest({ _: [] })
			],
			[
				{ command: 'status', json: true },
				{ command: 'install', version: '1.2.3', force: true },
				undefined
			]
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
