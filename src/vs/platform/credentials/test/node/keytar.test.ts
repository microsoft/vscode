/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';

suite('Keytar', () => {

	test('loads and is functional', done => {
		if (platform.isLinux) {
			// Skip test due to set up issue with Travis.
			done();
			return;
		}
		(async () => {
			const keytar = await import('keytar');
			const name = `VSCode Test ${Math.floor(Math.random() * 1e9)}`;
			try {
				await keytar.setPassword(name, 'foo', 'bar');
				assert.equal(await keytar.getPassword(name, 'foo'), 'bar');
				await keytar.deletePassword(name, 'foo');
				assert.equal(await keytar.getPassword(name, 'foo'), undefined);
			} catch (err) {
				// try to clean up
				try {
					await keytar.deletePassword(name, 'foo');
				} finally {
					throw err;
				}
			}
		})().then(done, done);
	});
});