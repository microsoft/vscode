/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as terminalEncoding from '../../../../../../base/node/terminalEncoding.js';
import * as encoding from '../../../common/encoding.js';

suite('Encoding', function () {

	this.timeout(10000);

	test('resolve terminal encoding (detect)', async function () {
		const enc = await terminalEncoding.resolveTerminalEncoding();
		assert.ok(enc.length > 0);
	});

	test('resolve terminal encoding (environment)', async function () {
		process.env['VSCODE_CLI_ENCODING'] = 'utf16le';

		const enc = await terminalEncoding.resolveTerminalEncoding();
		assert.ok(await encoding.encodingExists(enc));
		assert.strictEqual(enc, 'utf16le');
	});
});
