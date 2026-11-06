/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionsWindowUsageService } from '../../browser/sessionsWindowUsageService.js';

suite('SessionsWindowUsageService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('snapshots prior use before recording each window open', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const firstWindow = new SessionsWindowUsageService(storageService);
		const secondWindow = new SessionsWindowUsageService(storageService);

		assert.deepStrictEqual({
			firstWindow: {
				hadPriorWindowOpen: firstWindow.hadPriorWindowOpen,
				windowOpenCount: firstWindow.windowOpenCount,
			},
			secondWindow: {
				hadPriorWindowOpen: secondWindow.hadPriorWindowOpen,
				windowOpenCount: secondWindow.windowOpenCount,
			},
			storedCount: storageService.getNumber('agentSessions.telemetry.summary.appLaunchCount', StorageScope.APPLICATION),
			machineKeys: storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
		}, {
			firstWindow: {
				hadPriorWindowOpen: false,
				windowOpenCount: 1,
			},
			secondWindow: {
				hadPriorWindowOpen: true,
				windowOpenCount: 2,
			},
			storedCount: 2,
			machineKeys: ['agentSessions.telemetry.summary.appLaunchCount'],
		});
	});

	test('recognizes launches recorded before the badge without session history', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('agentSessions.telemetry.summary.appLaunchCount', 7, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const usage = new SessionsWindowUsageService(storageService);

		assert.deepStrictEqual({
			hadPriorWindowOpen: usage.hadPriorWindowOpen,
			windowOpenCount: usage.windowOpenCount,
			storedCount: storageService.getNumber('agentSessions.telemetry.summary.appLaunchCount', StorageScope.APPLICATION),
		}, {
			hadPriorWindowOpen: true,
			windowOpenCount: 8,
			storedCount: 8,
		});
	});
});
