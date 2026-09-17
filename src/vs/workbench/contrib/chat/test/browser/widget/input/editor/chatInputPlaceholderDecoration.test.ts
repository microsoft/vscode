/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { resolveInputPlaceholder } from '../../../../../browser/widget/input/editor/chatInputPlaceholderDecoration.js';

suite('Chat input placeholder decoration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('falls back only when the placeholder is unset', () => {
		assert.deepStrictEqual([
			resolveInputPlaceholder(undefined, 'Default placeholder'),
			resolveInputPlaceholder('', 'Default placeholder'),
			resolveInputPlaceholder('Custom placeholder', 'Default placeholder'),
		], [
			'Default placeholder',
			'',
			'Custom placeholder',
		]);
	});
});
