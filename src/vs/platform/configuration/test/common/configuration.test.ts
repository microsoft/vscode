/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { merge } from 'vs/platform/configuration/common/configuration';

suite('Configuration', () => {

	test('simple merge', () => {
		let base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});


});