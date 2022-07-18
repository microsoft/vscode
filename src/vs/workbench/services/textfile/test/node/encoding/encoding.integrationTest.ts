/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as terminalEncoding from 'vs/base/node/terminalEncoding';

suite('Encoding', () => {

	test('resolve terminal encoding (detect)', async function () {
		const enc = await terminalEncoding.resolveTerminalEncoding();
		assert.ok(enc.length > 0);
	});
});
