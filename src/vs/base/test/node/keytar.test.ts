/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isLinux } from 'vs/base/common/platform';

suite('Keytar', () => {

	(isLinux ? test.skip : test)('loads and is functional', async () => { // TODO@RMacfarlane test seems to fail on Linux (Error: Unknown or unsupported transport 'disabled' for address 'disabled:')
		const keytar = await import('keytar');
		const name = `VSCode Test ${Math.floor(Math.random() * 1e9)}`;
		try {
			await keytar.setPassword(name, 'foo', 'bar');
			assert.strictEqual(await keytar.findPassword(name), 'bar');
			assert.strictEqual((await keytar.findCredentials(name)).length, 1);
			assert.strictEqual(await keytar.getPassword(name, 'foo'), 'bar');
			await keytar.deletePassword(name, 'foo');
			assert.strictEqual(await keytar.getPassword(name, 'foo'), null);
		} catch (err) {
			// try to clean up
			try {
				await keytar.deletePassword(name, 'foo');
			} finally {
				// eslint-disable-next-line no-unsafe-finally
				throw err;
			}
		}
	});
});
