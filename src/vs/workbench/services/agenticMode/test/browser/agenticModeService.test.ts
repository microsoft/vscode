/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { AGENTIC_MODE_STORAGE_KEY } from '../../../configuration/browser/agents/agenticModeWorkspaceService.js';
import { IWorkbenchConfigurationService } from '../../../configuration/common/configuration.js';
import { AgenticModeService } from '../../browser/agenticModeService.js';

suite('AgenticModeService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('is unsupported and inert with a configuration service that cannot switch, as in the Agents window', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const testObject = new AgenticModeService(new class extends mock<IWorkbenchConfigurationService>() { }, storageService);

		await testObject.setActive(true);

		assert.deepStrictEqual({
			isSupported: testObject.isSupported,
			isActive: testObject.isActive,
			windowFolders: testObject.windowFolders,
			onDidChange: testObject.onDidChange === Event.None,
			stored: storageService.getBoolean(AGENTIC_MODE_STORAGE_KEY, StorageScope.WORKSPACE),
		}, {
			isSupported: false,
			isActive: false,
			windowFolders: [],
			onDidChange: true,
			stored: undefined,
		});
	});
});
