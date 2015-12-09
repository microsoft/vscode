/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import uri from 'vs/base/common/uri';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

suite('Debug - Source', () => {

	test('from uri', () => {
		const u = uri.file('/a/b/c/d');
		const source = Source.fromUri(u);

		assert.equal(source.available, true);
		assert.equal(source.inMemory, false);
		assert.equal(source.reference, 0);
		assert.equal(source.uri.toString(), u.toString());
		assert.equal(source.name, 'd');
	});

	test('from raw source', () => {
		const rawSource = {
			name: 'zz',
			path: '/xx/yy/zz',
			sourceReference: 0
		};
		const source = Source.fromRawSource(rawSource);

		assert.equal(source.available, true);
		assert.equal(source.name, rawSource.name);
		assert.equal(source.inMemory, false);
		assert.equal(source.reference, rawSource.sourceReference);
		assert.equal(source.uri.toString(), uri.file(rawSource.path).toString());
	});

	test('from raw internal source', () => {
		const rawSource = {
			name: 'internalModule.js',
			sourceReference: 11
		};
		const source = Source.fromRawSource(rawSource);

		assert.equal(source.available, true);
		assert.equal(source.name, rawSource.name);
		assert.equal(source.inMemory, true);
		assert.equal(source.reference, rawSource.sourceReference);
	});
});
