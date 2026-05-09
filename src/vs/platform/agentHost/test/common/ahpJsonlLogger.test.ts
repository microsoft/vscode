/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../../common/ahpJsonlLogger.js';

suite('AhpJsonlLogger', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('writes canonical JSON-RPC JSONL with metadata at the root', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));

		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'conn:1', transport: 'websocket' },
			fileService,
			new NullLogService(),
		));

		const requestText = '{"jsonrpc":"2.0","id":"request-1","method":"initialize","params":{"protocolVersion":1}}';
		logger.log(JSON.parse(requestText), 'c2s', getAhpLogByteLength(requestText));
		logger.log({ jsonrpc: '2.0', id: 2, result: { ok: true } }, 's2c');
		logger.log({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Nope' } }, 's2c');
		logger.log({ jsonrpc: '2.0', method: 'notification', params: { value: true } }, 's2c');
		await logger.flush();

		const content = (await fileService.readFile(logger.resource)).value.toString();
		const lines = content.split('\n').filter(Boolean);
		const parsed = lines.map(line => JSON.parse(line));

		assert.deepStrictEqual(parsed.map(entry => ({
			jsonrpc: entry.jsonrpc,
			id: entry.id,
			method: entry.method,
			hasResult: Object.hasOwn(entry, 'result'),
			hasError: Object.hasOwn(entry, 'error'),
			log: entry._ahpLog,
		})), [
			{
				jsonrpc: '2.0',
				id: 'request-1',
				method: 'initialize',
				hasResult: false,
				hasError: false,
				log: {
					ts: parsed[0]._ahpLog.ts,
					dir: 'c2s',
					connectionId: 'conn:1',
					transport: 'websocket',
					byteLength: getAhpLogByteLength(requestText),
				},
			},
			{
				jsonrpc: '2.0',
				id: 2,
				method: undefined,
				hasResult: true,
				hasError: false,
				log: {
					ts: parsed[1]._ahpLog.ts,
					dir: 's2c',
					connectionId: 'conn:1',
					transport: 'websocket',
				},
			},
			{
				jsonrpc: '2.0',
				id: null,
				method: undefined,
				hasResult: false,
				hasError: true,
				log: {
					ts: parsed[2]._ahpLog.ts,
					dir: 's2c',
					connectionId: 'conn:1',
					transport: 'websocket',
				},
			},
			{
				jsonrpc: '2.0',
				id: undefined,
				method: 'notification',
				hasResult: false,
				hasError: false,
				log: {
					ts: parsed[3]._ahpLog.ts,
					dir: 's2c',
					connectionId: 'conn:1',
					transport: 'websocket',
				},
			},
		]);

		for (const entry of parsed) {
			assert.strictEqual(entry.jsonrpc, '2.0');
			assert.ok(entry.method !== undefined || (entry.id !== undefined && (Object.hasOwn(entry, 'result') || Object.hasOwn(entry, 'error'))));
		}
	});

	test('rotates JSONL files and keeps bounded history', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));

		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'rotating', transport: 'websocket', maxFileSizeBytes: 1, maxFiles: 2 },
			fileService,
			new NullLogService(),
		));
		const firstResource = logger.resource;
		const currentBaseName = basename(firstResource, '.jsonl');
		const rotated1 = joinPath(dirname(firstResource), `${currentBaseName}.1.jsonl`);
		const rotated2 = joinPath(dirname(firstResource), `${currentBaseName}.2.jsonl`);

		logger.log({ jsonrpc: '2.0', id: 1, result: 'one' }, 's2c');
		logger.log({ jsonrpc: '2.0', id: 2, result: 'two' }, 's2c');
		logger.log({ jsonrpc: '2.0', id: 3, result: 'three' }, 's2c');
		await logger.flush();

		const lines = [
			...(await fileService.readFile(rotated1)).value.toString().split('\n').filter(Boolean),
			...(await fileService.readFile(rotated2)).value.toString().split('\n').filter(Boolean),
		];
		const parsed = lines.map(line => JSON.parse(line));

		assert.deepStrictEqual({
			firstFileExists: await fileService.exists(firstResource),
			ids: parsed.map(entry => entry.id),
			rootsAreJsonRpc: parsed.every(entry => entry.jsonrpc === '2.0' && (entry.method !== undefined || (entry.id !== undefined && (Object.hasOwn(entry, 'result') || Object.hasOwn(entry, 'error'))))),
		}, {
			firstFileExists: false,
			ids: [2, 3],
			rootsAreJsonRpc: true,
		});
	});
});
