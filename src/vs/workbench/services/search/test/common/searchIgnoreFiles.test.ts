/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSearchIgnoreFileNames } from '../../common/searchIgnoreFiles.js';

suite('SearchIgnoreFiles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('combines defaults and extension contributions', () => {
		assert.deepStrictEqual(getSearchIgnoreFileNames([
			['.gitignore', '.customignore'],
			['.customignore', '.hgignore', '.ignore']
		]), ['.gitignore', '.customignore', '.hgignore', '.ignore']);
	});

	test('ignores invalid file names', () => {
		assert.deepStrictEqual(getSearchIgnoreFileNames([
			['', '../.ignore', 'nested/.ignore', 'nested\\.ignore', '.webignore']
		]), ['.webignore', '.ignore']);
	});
});
