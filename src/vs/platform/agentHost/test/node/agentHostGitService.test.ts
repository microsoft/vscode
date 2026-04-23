/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getBranchCompletions } from '../../node/agentHostGitService.js';

suite('AgentHostGitService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts common branch names to the top before applying limit', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'release', 'master', 'main', 'feature/older'], { limit: 3 }),
			['main', 'master', 'feature/recent'],
		);
	});

	test('preserves git order for non-common branches', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'release', 'feature/older']),
			['feature/recent', 'release', 'feature/older'],
		);
	});

	test('filters before sorting common branch names', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'master', 'main', 'maintenance'], { query: 'ma' }),
			['main', 'master', 'maintenance'],
		);
	});
});
