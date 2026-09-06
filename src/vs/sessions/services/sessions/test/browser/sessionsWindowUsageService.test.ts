/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { SessionsWindowUsageService } from '../../browser/sessionsWindowUsageService.js';

suite('SessionsWindowUsageService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('captures prior use before recording each Agents window open', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const firstWindow = new SessionsWindowUsageService(storageService);
		const firstSnapshot = {
			hadPriorWindowOpen: firstWindow.hadPriorWindowOpen,
			windowOpenCount: firstWindow.windowOpenCount,
		};
		const repeatedConsumerSnapshot = {
			hadPriorWindowOpen: firstWindow.hadPriorWindowOpen,
			windowOpenCount: firstWindow.windowOpenCount,
		};
		const secondWindow = new SessionsWindowUsageService(storageService);

		assert.deepStrictEqual({
			firstSnapshot,
			repeatedConsumerSnapshot,
			secondSnapshot: {
				hadPriorWindowOpen: secondWindow.hadPriorWindowOpen,
				windowOpenCount: secondWindow.windowOpenCount,
			},
		}, {
			firstSnapshot: {
				hadPriorWindowOpen: false,
				windowOpenCount: 1,
			},
			repeatedConsumerSnapshot: {
				hadPriorWindowOpen: false,
				windowOpenCount: 1,
			},
			secondSnapshot: {
				hadPriorWindowOpen: true,
				windowOpenCount: 2,
			},
		});
	});
});
