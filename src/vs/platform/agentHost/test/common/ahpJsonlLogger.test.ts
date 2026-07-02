/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileWriteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AhpJsonlLogger, getAhpLogByteLength, stringifyAhpLogEntry } from '../../common/ahpJsonlLogger.js';

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
		const uri = URI.parse('ahp-session:/session-1');
		logger.log(JSON.parse(requestText), 'c2s', getAhpLogByteLength(requestText));
		logger.log({ jsonrpc: '2.0', id: 2, result: { ok: true } }, 's2c');
		logger.log({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Nope' } }, 's2c');
		logger.log({ jsonrpc: '2.0', method: 'notification', params: { uri } }, 's2c');
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
			params: entry.params,
			log: entry._ahpLog,
		})), [
			{
				jsonrpc: '2.0',
				id: 'request-1',
				method: 'initialize',
				hasResult: false,
				hasError: false,
				params: { protocolVersion: 1 },
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
				params: undefined,
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
				params: undefined,
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
				params: { uri: uri.toString() },
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

	test('coalesces synchronously queued log calls into a single write', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new RecordingInMemoryFileSystemProvider());
		store.add(fileService.registerProvider('file', provider));

		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'batched', transport: 'websocket' },
			fileService,
			new NullLogService(),
		));

		const messageCount = 50;
		for (let i = 0; i < messageCount; i++) {
			logger.log({ jsonrpc: '2.0', id: i, result: { ok: true } }, 's2c');
		}
		await logger.flush();

		const content = (await fileService.readFile(logger.resource)).value.toString();
		const lines = content.split('\n').filter(Boolean);
		const ids = lines.map(line => JSON.parse(line).id);

		// All 50 log() calls are queued synchronously, so they all land in the
		// first drain and must be coalesced into exactly one writeFile.
		assert.deepStrictEqual({
			lineCount: lines.length,
			idsInOrder: ids,
			writeCount: provider.writeCount,
		}, {
			lineCount: messageCount,
			idsInOrder: Array.from({ length: messageCount }, (_, i) => i),
			writeCount: 1,
		});
	});

	test('flush waits for batched writes and ordering is preserved across drains', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));

		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'flush-order', transport: 'websocket' },
			fileService,
			new NullLogService(),
		));

		// Submit a batch, partially flush, then submit another batch interleaved
		// with the flush — ordering must be preserved.
		logger.log({ jsonrpc: '2.0', id: 1, result: 'a' }, 's2c');
		logger.log({ jsonrpc: '2.0', id: 2, result: 'b' }, 's2c');
		const firstFlush = logger.flush();
		logger.log({ jsonrpc: '2.0', id: 3, result: 'c' }, 's2c');
		await firstFlush;
		logger.log({ jsonrpc: '2.0', id: 4, result: 'd' }, 's2c');
		await logger.flush();

		const content = (await fileService.readFile(logger.resource)).value.toString();
		const ids = content.split('\n').filter(Boolean).map(line => JSON.parse(line).id);
		assert.deepStrictEqual(ids, [1, 2, 3, 4]);
	});

	test('elides oversized string payloads while keeping the line valid JSONL', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));

		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'conn:1', transport: 'websocket' },
			fileService,
			new NullLogService(),
		));

		// A normal small message is written verbatim and is not marked truncated.
		logger.log({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'c2s');
		// A message carrying a multi-MB string (e.g. a base64 resourceRead) is trimmed.
		const huge = 'x'.repeat(4 * 1024 * 1024);
		logger.log({ jsonrpc: '2.0', id: 2, result: { data: huge } }, 's2c');
		await logger.flush();

		const content = (await fileService.readFile(logger.resource)).value.toString();
		const lines = content.split('\n').filter(Boolean);
		// Both lines must be valid JSON (the trimmed line stays well-formed JSONL).
		const parsed = lines.map(line => JSON.parse(line));

		assert.strictEqual(parsed[0]._ahpLog.truncated, undefined);
		assert.strictEqual(parsed[1]._ahpLog.truncated, true);
		// The huge string was elided rather than written in full.
		assert.ok(parsed[1].result.data.length < huge.length);
		assert.ok(parsed[1].result.data.includes('chars elided'));
		// The whole serialized line stays modest in size.
		assert.ok(lines[1].length < 1024 * 1024);
	});

	suite('stringifyAhpLogEntry', () => {

		test('serialises a top-level URI as its string form', () => {
			const uri = URI.parse('file:///tmp/example.txt');
			const result = JSON.parse(stringifyAhpLogEntry({ uri }));
			assert.strictEqual(result.uri, uri.toString());
		});

		test('serialises URIs nested in arrays and objects', () => {
			const a = URI.parse('file:///a');
			const b = URI.parse('https://example.com/b?x=1');
			const c = URI.parse('untitled:Untitled-1');
			const payload = {
				items: [a, { nested: b }, [c]],
			};
			const result = JSON.parse(stringifyAhpLogEntry(payload));
			assert.deepStrictEqual(result, {
				items: [a.toString(), { nested: b.toString() }, [c.toString()]],
			});
		});

		test('round-trips raw UriComponents marked with $mid', () => {
			const uri = URI.parse('vscode://example/path');
			const components = uri.toJSON();
			// Simulate a value that came back over IPC and was never revived
			const result = JSON.parse(stringifyAhpLogEntry({ uri: components }));
			assert.strictEqual(result.uri, uri.toString());
		});

		test('leaves URI-shaped objects without $mid as plain objects', () => {
			// A user payload that happens to have URI-like fields but is not a
			// URI must not be silently rewritten.
			const payload = {
				scheme: 'not-a-uri',
				path: '/something',
			};
			const result = JSON.parse(stringifyAhpLogEntry(payload));
			assert.deepStrictEqual(result, payload);
		});

		test('does not misidentify non-URI objects that carry $mid: 1', () => {
			// $mid is only safely a URI marker when the object also has the
			// UriComponents shape (scheme: string). Non-conforming payloads
			// must pass through unchanged.
			const payload = { $mid: 1, label: 'not a uri' };
			const result = JSON.parse(stringifyAhpLogEntry(payload));
			assert.deepStrictEqual(result, payload);
		});
	});
});

class RecordingInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
	writeCount = 0;
	override async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		this.writeCount++;
		return super.writeFile(resource, content, opts);
	}
}
