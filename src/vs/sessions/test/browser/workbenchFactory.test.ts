/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { AgentWorkbenchLayout } from '../../browser/workbench.js';
import { getSessionsWorkbenchLayout } from '../../browser/workbenchFactory.js';

suite('Sessions Workbench Factory', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains mobile layout without a setting', () => {
		assert.deepStrictEqual([
			getSessionsWorkbenchLayout(390, { isWeb: true, isMobile: true }),
			getSessionsWorkbenchLayout(640, { isWeb: true, isMobile: true }),
			getSessionsWorkbenchLayout(390, { isWeb: true, isMobile: false }),
			getSessionsWorkbenchLayout(390, { isWeb: false, isMobile: true }),
		], [
			AgentWorkbenchLayout.Mobile,
			AgentWorkbenchLayout.Desktop,
			AgentWorkbenchLayout.Desktop,
			AgentWorkbenchLayout.Desktop,
		]);
	});
});
