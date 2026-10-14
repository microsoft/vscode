/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MAX_RIPGREP_SYMLINK_LOOPS, RipgrepSymlinkLoopDetector } from '../../node/ripgrepSearchUtils.js';

suite('RipgrepSymlinkLoopDetector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports once more loops than allowed were found, including loops split across chunks', () => {
		const detector = new RipgrepSymlinkLoopDetector();
		const loop = 'rg: File system loop found: a/link points to an ancestor a\n';

		assert.deepStrictEqual([
			detector.handleStderr(loop.repeat(MAX_RIPGREP_SYMLINK_LOOPS - 1) + 'rg: ./unreadable: Permission denied (os error 13)\n'),
			detector.handleStderr(loop + loop.slice(0, 20)),
			detector.handleStderr(loop.slice(20)),
		], [false, false, true]);
	});
});
