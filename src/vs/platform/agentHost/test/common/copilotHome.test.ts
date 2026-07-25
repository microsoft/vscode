/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotHomePath, getCopilotRootPaths } from '../../common/copilotHome.js';

suite('copilotHome', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the configured or default Copilot home', () => {
		assert.deepStrictEqual([
			getCopilotHomePath('user-home', {}),
			getCopilotHomePath('user-home', { COPILOT_HOME: 'custom-copilot' }),
		], [
			join('user-home', '.copilot'),
			'custom-copilot',
		]);
	});

	test('resolves all Copilot roots', () => {
		assert.deepStrictEqual([
			getCopilotRootPaths('user-home', {}),
			getCopilotRootPaths('user-home', { COPILOT_HOME: 'custom-copilot' }),
		], [
			[join('user-home', '.copilot')],
			['custom-copilot', join('user-home', '.copilot')],
		]);
	});
});
