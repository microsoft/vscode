/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { HashService } from 'vs/workbench/services/hash/common/hashService';

suite('Hash Service', () => {

	test('computeSHA1Hash', async () => {
		const service = new HashService();

		assert.equal(await service.createSHA1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
		assert.equal(await service.createSHA1('hello world'), '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
		assert.equal(await service.createSHA1('da39a3ee5e6b4b0d3255bfef95601890afd80709'), '10a34637ad661d98ba3344717656fcc76209c2f8');
		assert.equal(await service.createSHA1('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed'), 'd6b0d82cea4269b51572b8fab43adcee9fc3cf9a');
		assert.equal(await service.createSHA1('öäü_?ß()<>ÖÄÜ'), 'b64beaeff9e317b0193c8e40a2431b210388eba9');
	});
});