/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
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

	test('surfaces a write failure until a later write succeeds', async () => {
		let attempts = 0;
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async () => {
				attempts++;
				if (attempts === 1) {
					throw new Error('disk is unavailable');
				}
			},
		};
		const service = disposables.add(new AgentHostStorageService(
			URI.file('/agent-host-storage-service-test.json'),
			new NullLogService(),
			writer,
		));

		service.set('first', true);
		await assert.rejects(service.whenIdle(), /disk is unavailable/);
		await assert.rejects(service.whenIdle(), /disk is unavailable/);

		service.set('second', true);
		await service.whenIdle();

		assert.deepStrictEqual({
			attempts,
			first: service.get<boolean>('first'),
			second: service.get<boolean>('second'),
		}, {
			attempts: 2,
			first: true,
			second: true,
		});
	});

	test('a corrupt storage file is never overwritten', async () => {
		const path = getRandomTestPath(tmpdir()) + '.json';
		await writeFile(path, 'not json', 'utf8');
		try {
			const service = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService()));

			assert.throws(() => service.set('automations', { catalog: { automations: [] } }), /persisted data could not be loaded/);
			await assert.rejects(service.whenIdle(), /persisted data could not be loaded/);
			assert.deepStrictEqual({
				hasLoadError: service.loadError instanceof Error,
				persisted: await readFile(path, 'utf8'),
			}, {
				hasLoadError: true,
				persisted: 'not json',
			});
		} finally {
			await unlink(path);
		}
	});

	test('a rejected flushed value cannot be resurrected by a later unrelated write', async () => {
		let fail = true;
		const writes: string[] = [];
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async (_path, contents) => {
				if (fail) {
					fail = false;
					throw new Error('disk unavailable');
				}
				writes.push(contents);
			},
		};
		const service = disposables.add(new AgentHostStorageService(
			URI.file('/agent-host-storage-service-test.json'),
			new NullLogService(),
			writer,
		));

		await assert.rejects(service.setAndFlush('automations', { value: 'rejected' }), /disk unavailable/);
		service.set('unrelated', true);
		await service.whenIdle();

		assert.deepStrictEqual({
			automationValue: service.get('automations'),
			persisted: JSON.parse(writes.at(-1)!),
		}, {
			automationValue: undefined,
			persisted: { unrelated: true },
		});
	});
});
