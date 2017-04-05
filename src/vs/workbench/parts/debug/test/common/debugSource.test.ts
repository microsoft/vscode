/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import uri from 'vs/base/common/uri';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

suite('Debug - Source', () => {

	test('from raw source', () => {
		const rawSource = {
			name: 'zz',
			path: '/xx/yy/zz',
			sourceReference: 0
		};
		const source = new Source(rawSource, 'label');

		assert.equal(source.presenationHint, 'label');
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
		const source = new Source(rawSource, 'deemphasize');

		assert.equal(source.presenationHint, 'deemphasize');
		assert.equal(source.name, rawSource.name);
		assert.equal(source.inMemory, true);
		assert.equal(source.reference, rawSource.sourceReference);
	});
});
