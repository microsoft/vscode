/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
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
			rename: async () => { },
			rm: async () => { },
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
			rename: async () => { },
			rm: async () => { },
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

			assert.throws(() => service.set('automations', { catalog: { entries: [] } }), /persisted data could not be loaded/);
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

	for (const fail of [false, true]) {
		test(`a ${fail ? 'failed' : 'pending'} write preserves the previous complete storage file`, async () => {
			const directory = getRandomTestPath(tmpdir());
			await mkdir(directory);
			const path = join(directory, 'storage.json');
			await writeFile(path, '{"previous":true}', 'utf8');
			const writeStarted = new DeferredPromise<void>();
			const releaseWrite = new DeferredPromise<void>();
			const writer: IAgentHostStorageWriter = {
				mkdir: async () => { },
				writeFile: async (target, contents) => {
					await writeFile(target, '{', 'utf8');
					writeStarted.complete();
					await releaseWrite.p;
					if (fail) {
						throw new Error('interrupted write');
					}
					await writeFile(target, contents, 'utf8');
				},
				rename,
				rm: path => rm(path, { force: true }),
			};
			const service = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService(), writer));
			try {
				service.set('next', true);
				await writeStarted.p;
				const before = await readFile(path, 'utf8');
				const reopened = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService()));
				releaseWrite.complete();
				if (fail) {
					await assert.rejects(service.whenIdle(), /interrupted write/);
				} else {
					await service.whenIdle();
				}
				assert.deepStrictEqual({
					before,
					reopenedLoadError: reopened.loadError,
					reopenedPrevious: reopened.get('previous'),
					after: await readFile(path, 'utf8'),
					files: await readdir(directory),
				}, {
					before: '{"previous":true}',
					reopenedLoadError: undefined,
					reopenedPrevious: true,
					after: fail ? '{"previous":true}' : '{"previous":true,"next":true}',
					files: ['storage.json'],
				});
			} finally {
				releaseWrite.complete();
				await Promise.allSettled([service.whenIdle()]);
				await rm(directory, { recursive: true, force: true });
			}
		});
	}

	test('a failed rename preserves storage, removes the temporary file, and permits a later write', async () => {
		const directory = getRandomTestPath(tmpdir());
		await mkdir(directory);
		const path = join(directory, 'storage.json');
		await writeFile(path, '{"previous":true}', 'utf8');
		let fail = true;
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: (target, contents) => writeFile(target, contents, 'utf8'),
			rename: async (from, to) => {
				if (fail) {
					throw new Error('storage file is locked');
				}
				await rename(from, to);
			},
			rm: target => rm(target, { force: true }),
		};
		const service = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService(), writer));
		try {
			service.set('next', true);
			await assert.rejects(service.whenIdle(), /storage file is locked/);
			await assert.rejects(service.whenIdle(), /storage file is locked/);
			const afterFailure = await readFile(path, 'utf8');
			const filesAfterFailure = await readdir(directory);
			const reopened = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService()));

			fail = false;
			service.set('retry', true);
			await service.whenIdle();

			assert.deepStrictEqual({
				afterFailure,
				filesAfterFailure,
				reopenedLoadError: reopened.loadError,
				reopenedPrevious: reopened.get('previous'),
				reopenedNext: reopened.get('next'),
				afterRetry: await readFile(path, 'utf8'),
				filesAfterRetry: await readdir(directory),
			}, {
				afterFailure: '{"previous":true}',
				filesAfterFailure: ['storage.json'],
				reopenedLoadError: undefined,
				reopenedPrevious: true,
				reopenedNext: undefined,
				afterRetry: '{"previous":true,"next":true,"retry":true}',
				filesAfterRetry: ['storage.json'],
			});
		} finally {
			await Promise.allSettled([service.whenIdle()]);
			await rm(directory, { recursive: true, force: true });
		}
	});

	test('a rejected rename rolls back a flushed replacement without resurrecting it', async () => {
		const directory = getRandomTestPath(tmpdir());
		await mkdir(directory);
		const path = join(directory, 'storage.json');
		await writeFile(path, '{"value":"previous"}', 'utf8');
		let fail = true;
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: (target, contents) => writeFile(target, contents, 'utf8'),
			rename: async (from, to) => {
				if (fail) {
					fail = false;
					throw new Error('storage file is locked');
				}
				await rename(from, to);
			},
			rm: target => rm(target, { force: true }),
		};
		const service = disposables.add(new AgentHostStorageService(URI.file(path), new NullLogService(), writer));
		try {
			await assert.rejects(service.setAndFlush('value', 'rejected'), /storage file is locked/);
			await service.whenIdle();
			const afterRollback = await readFile(path, 'utf8');
			service.set('unrelated', true);
			await service.whenIdle();

			assert.deepStrictEqual({
				value: service.get('value'),
				afterRollback,
				afterUnrelatedWrite: await readFile(path, 'utf8'),
				files: await readdir(directory),
			}, {
				value: 'previous',
				afterRollback: '{"value":"previous"}',
				afterUnrelatedWrite: '{"value":"previous","unrelated":true}',
				files: ['storage.json'],
			});
		} finally {
			await Promise.allSettled([service.whenIdle()]);
			await rm(directory, { recursive: true, force: true });
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
			rename: async () => { },
			rm: async () => { },
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
