/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { isMatch } from '../../common/glob';
import { URI } from '../../vs/base/common/uri';

suite('isMatch', () => {
	test('issue #3377: should match URIs on Windows', () => {
		const uri = URI.file('/Users/someone/Projects/proj01/base/test/common/map.test.ts');
		const glob = '**/{map.test.ts,map.spec.ts}';
		const result = isMatch(uri, glob);
		assert.strictEqual(result, true);
	});
});
