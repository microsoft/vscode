/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { shouldOpenAgentsWindow } from '../../common/argv.js';

suite('Native argv routing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('evaluation attachment implies Agents window without changing default routing', () => {
		assert.strictEqual(shouldOpenAgentsWindow({ _: [] }), false);
		assert.strictEqual(shouldOpenAgentsWindow({ _: [], agents: true }), true);
		assert.strictEqual(shouldOpenAgentsWindow({ _: [], 'attach-to-evaluation-session': 'remote-host-copilot:/session' }), true);
	});
});
