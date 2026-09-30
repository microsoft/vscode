/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { BUNDLE_FILES, ensureModelDownloaded, ModelManifest, validateModelDirectory } from '../node/modelLocator';

function contentFor(file: string): Buffer {
	return Buffer.from(`contents of ${file}`);
}

function sha256(data: Buffer): string {
	return createHash('sha256').update(data).digest('hex');
}

suite('modelLocator', () => {

	let tmpDir: string;
	let server: http.Server;
	let baseUrl: string;
	let requests: string[];
	let served: Map<string, Buffer>;

	setup(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'laya-model-'));
		requests = [];
		served = new Map(BUNDLE_FILES.map(file => [file, contentFor(file)]));
		server = http.createServer((req, res) => {
			const file = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(1));
			requests.push(file);
			const data = served.get(file);
			if (!data) {
				res.statusCode = 404;
				res.end();
				return;
			}
			res.end(data);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
	});

	teardown(async () => {
		await new Promise(resolve => server.close(resolve));
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	function manifest(overrides: Partial<ModelManifest> = {}): ModelManifest {
		return {
			id: 'laya-test-int8',
			baseUrl,
			files: BUNDLE_FILES.map(file => ({ path: file, size: contentFor(file).length, sha256: sha256(contentFor(file)) })),
			...overrides,
		};
	}

	test('downloads and verifies every file, then reuses the verified copy', async () => {
		const progress: number[] = [];
		const dir = await ensureModelDownloaded(manifest(), tmpDir, { onProgress: received => progress.push(received) });
		await validateModelDirectory(dir);
		const firstRequests = [...requests].sort();

		const again = await ensureModelDownloaded(manifest(), tmpDir);
		assert.deepStrictEqual({
			dir,
			again,
			firstRequests,
			secondRequests: requests.length - firstRequests.length,
			contents: await fs.readFile(path.join(dir, 'laya_config.json'), 'utf8'),
			finalProgress: progress.at(-1),
		}, {
			dir: path.join(tmpDir, 'models', 'laya-test-int8'),
			again: dir,
			firstRequests: [...BUNDLE_FILES].sort(),
			secondRequests: 0,
			contents: 'contents of laya_config.json',
			finalProgress: BUNDLE_FILES.reduce((sum, file) => sum + contentFor(file).length, 0),
		});
	});

	test('rejects a file whose checksum does not match and leaves no partial file', async () => {
		served.set('laya.onnx', Buffer.from('contents of laya.onnY'));
		await assert.rejects(ensureModelDownloaded(manifest(), tmpDir), /Integrity check failed for laya\.onnx/);
		const dir = path.join(tmpDir, 'models', 'laya-test-int8');
		const entries = await fs.readdir(dir);
		assert.deepStrictEqual(entries.filter(entry => entry.endsWith('.part') || entry === '.verified.json' || entry === 'laya.onnx'), []);
	});

	test('rejects a file that is larger than expected', async () => {
		served.set('laya.onnx', Buffer.concat([contentFor('laya.onnx'), Buffer.from('extra')]));
		await assert.rejects(ensureModelDownloaded(manifest(), tmpDir), /larger than expected/);
	});

	test('re-downloads only the files that were modified after verification', async () => {
		const dir = await ensureModelDownloaded(manifest(), tmpDir);
		await fs.writeFile(path.join(dir, 'laya.onnx'), 'contents of laya.onnZ');
		requests = [];
		await ensureModelDownloaded(manifest(), tmpDir);
		assert.deepStrictEqual(requests, []);

		await fs.writeFile(path.join(dir, 'laya.onnx'), 'tampered');
		await ensureModelDownloaded(manifest(), tmpDir);
		assert.deepStrictEqual({ requests, contents: await fs.readFile(path.join(dir, 'laya.onnx'), 'utf8') }, {
			requests: ['laya.onnx'],
			contents: 'contents of laya.onnx',
		});
	});

	test('validates the manifest', async () => {
		const good = manifest();
		const invalid: [ModelManifest, RegExp][] = [
			[{ ...good, id: '../escape' }, /Invalid model manifest id/],
			[{ ...good, baseUrl: 'http://example.com/models/' }, /must use https/],
			[{ ...good, files: good.files.slice(1) }, /missing laya\.onnx/],
			[{ ...good, files: [...good.files, { path: '../evil', size: 1, sha256: good.files[0].sha256 }] }, /unexpected file/],
			[{ ...good, files: good.files.map((file, i) => i === 0 ? { ...file, sha256: 'abc' } : file) }, /invalid checksum/],
		];
		for (const [value, error] of invalid) {
			await assert.rejects(ensureModelDownloaded(value, tmpDir), error);
		}
		assert.deepStrictEqual(requests, []);
	});

	test('validateModelDirectory reports missing files', async () => {
		await fs.mkdir(path.join(tmpDir, 'tokenizer'));
		await fs.writeFile(path.join(tmpDir, 'laya.onnx'), '');
		await fs.writeFile(path.join(tmpDir, 'tokenizer', 'tokenizer.json'), '');
		await assert.rejects(validateModelDirectory(tmpDir), /missing: laya\.onnx\.data, laya_config\.json, tokenizer\/tokenizer_config\.json\./);
	});
});
