/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkbenchConfigurationService } from '../../../configuration/common/configuration.js';
import { AgentsModeService } from '../../browser/agentsModeService.js';

suite('AgentsModeService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('is unsupported and inert with a configuration service that cannot switch, as in the Agents window', async () => {
		const testObject = new AgentsModeService(new class extends mock<IWorkbenchConfigurationService>() { });

		await testObject.setActive(true);

		assert.deepStrictEqual({
			isSupported: testObject.isSupported,
			isActive: testObject.isActive,
			windowFolders: testObject.windowFolders,
			onDidChange: testObject.onDidChange === Event.None,
		}, {
			isSupported: false,
			isActive: false,
			windowFolders: [],
			onDidChange: true,
		});
	});
});
