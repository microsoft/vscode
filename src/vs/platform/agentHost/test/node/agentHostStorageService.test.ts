/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';

suite('AgentHostStorageService', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('stores synchronously, notifies changes, and coalesces asynchronous writes', async () => {
		const writes: string[] = [];
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async (_path, contents) => { writes.push(contents); },
		};
		const service = disposables.add(new AgentHostStorageService(
			URI.file('/agent-host-storage-service-test.json'),
			new NullLogService(),
			writer,
		));
		const changed: string[] = [];
		disposables.add(service.onDidChange(key => changed.push(key)));

		service.set('first', { value: 1 });
		service.set('second', false);
		assert.deepStrictEqual(service.get<{ value: number }>('first'), { value: 1 });
		service.delete('second');
		await service.whenIdle();

		assert.deepStrictEqual({
			changed,
			stored: service.get<boolean>('second'),
			lastWrite: JSON.parse(writes.at(-1)!),
		}, {
			changed: ['first', 'second', 'second'],
			stored: undefined,
			lastWrite: { first: { value: 1 } },
		});
	});
});
