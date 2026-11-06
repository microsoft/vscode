/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import { createNullSessionDataService, createNoopGitService } from '../common/sessionTestHelpers.js';
import { createTestAgentService } from './agentServiceTestUtils.js';

suite('AgentServiceComposition', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const expectedSessionDataCleanupParticipants = 2;

	test('arms session-data cleanup participants', async () => {
		const onWillDeleteSessionData = disposables.add(new Emitter<IWillDeleteSessionDataEvent>());
		const sessionDataService = {
			...createNullSessionDataService(),
			onWillDeleteSessionData: onWillDeleteSessionData.event,
		};
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(createTestAgentService(
			logService,
			fileService,
			sessionDataService,
			{ _serviceBrand: undefined, ...product },
			createNoopGitService(),
		));
		const cleanup: Promise<unknown>[] = [];

		onWillDeleteSessionData.fire({
			session: URI.parse('copilot:/session'),
			workingDirectories: undefined,
			waitUntil: promise => cleanup.push(promise),
		});

		assert.strictEqual(cleanup.length, expectedSessionDataCleanupParticipants);
		await Promise.all(cleanup);
	});
});
