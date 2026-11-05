/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { MeteredConnectionMainService } from '../../electron-main/meteredConnectionMainService.js';

suite('MeteredConnectionMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initialization waits for the initial browser connection state', async () => {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new MeteredConnectionMainService(configurationService));
		let initialized = false;
		void service.whenConnectionStateInitialized.then(() => initialized = true);

		await timeout(0);
		assert.strictEqual(initialized, false);

		service.setIsBrowserConnectionMetered(true);
		await service.whenConnectionStateInitialized;

		assert.deepStrictEqual({
			initialized,
			isConnectionMetered: service.isConnectionMetered,
		}, {
			initialized: true,
			isConnectionMetered: true,
		});
	});
});
