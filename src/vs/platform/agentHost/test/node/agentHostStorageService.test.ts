/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';

suite('AgentHostStorageService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('coalesces rapid writes and persists the latest value', async () => {
		const firstWrite = new DeferredPromise<void>();
		const firstWriteStarted = new DeferredPromise<void>();
		const contents: string[] = [];
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async (_path, content) => {
				contents.push(content);
				if (contents.length === 1) {
					firstWriteStarted.complete();
					await firstWrite.p;
				}
			},
		};
		const service = store.add(new AgentHostStorageService(new NullLogService(), URI.file('/storage/agent-host.json'), writer));

		service.set('value', 1);
		await firstWriteStarted.p;
		service.set('value', 2);
		service.set('value', 3);
		firstWrite.complete();
		await service.whenIdle();

		assert.deepStrictEqual(contents, ['{\n\t"value": 1\n}\n', '{\n\t"value": 3\n}\n']);
	});
});
