/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as model from 'vs/platform/configuration/common/model';

suite('ConfigurationService - Model', () => {

	test('simple merge', () => {
		let base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('Recursive merge', () => {
		const base = { 'a': { 'b': 1 } };
		model.merge(base, { 'a': { 'b': 2 } }, true);
		assert.deepEqual(base, { 'a': { 'b': 2 } });
	});
});