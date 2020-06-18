/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as terminalEncoding from 'vs/base/node/terminalEncoding';
import * as encoding from 'vs/base/common/encoding';

suite('Terminal encoding', () => {
	test('resolve terminal encoding (detect)', async function () {
		const enc = await terminalEncoding.resolveTerminalEncoding();
		assert.ok(enc.length > 0);
	});

	test('resolve terminal encoding (environment)', async function () {
		process.env['VSCODE_CLI_ENCODING'] = 'utf16le';

		const enc = await terminalEncoding.resolveTerminalEncoding();
		assert.ok(await encoding.encodingExists(enc));
		assert.equal(enc, 'utf16le');
	});
});
