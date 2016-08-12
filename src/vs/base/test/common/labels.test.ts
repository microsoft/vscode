/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {getPathLabels} from 'vs/base/common/labels';
import uri from 'vs/base/common/uri';

suite('Labels', () => {

	test('getPathLabels - no collisions', () => {
		const uris = [
			uri.file('/parentA/childA.txt'),
			uri.file('/parentA/childB.txt'),
			uri.file('/parentA/other/childC.txt')
		];

		const res = getPathLabels(uris).values();
		assert.equal(res.length, 3);
		assert.equal(res[0].label, 'childA.txt');
		assert.ok(!res[0].meta);
		assert.equal(res[1].label, 'childB.txt');
		assert.ok(!res[1].meta);
		assert.equal(res[2].label, 'childC.txt');
		assert.ok(!res[2].meta);
	});

	test('getPathLabels - collisions', () => {
		const uris = [
			uri.file('/parentA/childA.txt'),
			uri.file('/parentB/childA.txt'),
			uri.file('/parentC/other/childA.txt')
		];

		const res = getPathLabels(uris).values();
		assert.equal(res.length, 3);
		assert.equal(res[0].label, 'childA.txt');
		assert.equal(res[0].meta, '/parentA');
		assert.equal(res[1].label, 'childA.txt');
		assert.equal(res[1].meta, '/parentB');
		assert.equal(res[2].label, 'childA.txt');
		assert.equal(res[2].meta, '/parentC/other');
	});
});