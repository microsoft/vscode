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
			await keytar.setPassword('VSCode Test', 'foo', 'bar');
			assert.equal(await keytar.getPassword('VSCode Test', 'foo'), 'bar');
			await keytar.deletePassword('VSCode Test', 'foo');
			assert.equal(await keytar.getPassword('VSCode Test', 'foo'), undefined);
		})().then(done, done);
	});
});