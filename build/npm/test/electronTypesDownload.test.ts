/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { afterEach, suite, test } from 'node:test';
import zlib from 'node:zlib';
import { sha256 } from '../../lib/download.ts';
import { downloadElectronTypes, extractFileFromTgz, packElectronFromNpm } from '../electronTypesDownload.ts';

function tgz(entries: { name: string; prefix?: string; contents: string; size?: string }[]): Uint8Array {
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const contents = Buffer.from(entry.contents);
		const header = Buffer.alloc(512);
		header.write(entry.name, 0, 100);
		header.write(entry.size ?? contents.length.toString(8).padStart(11, '0'), 124, 12);
		header.write('0', 156, 1);
		header.write('ustar\u000000', 257, 8);
		header.write(entry.prefix ?? '', 345, 155);
		blocks.push(header, contents, Buffer.alloc(Math.ceil(contents.length / 512) * 512 - contents.length));
	}
	blocks.push(Buffer.alloc(1024));
	return zlib.gzipSync(Buffer.concat(blocks));
}

const typings = 'declare namespace Electron {}\n'.repeat(40);
const npmTarball = tgz([
	{ name: 'package/package.json', contents: '{"name":"electron"}' },
	{ name: 'package/electron.d.ts', contents: typings },
]);

suite('electron.d.ts download', () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => { globalThis.fetch = originalFetch; });

	function stubFetch(responses: Record<string, () => Response>): string[] {
		const requested: string[] = [];
		globalThis.fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			requested.push(url);
			const host = new URL(url).host;
			return responses[host]();
		}) as typeof fetch;
		return requested;
	}

	test('extracts a file from a gzipped tar archive', () => {
		const archive = tgz([
			{ name: 'package/a.txt', contents: 'a'.repeat(700) },
			{ name: 'electron.d.ts', prefix: 'package', contents: 'typings' },
		]);
		assert.equal(Buffer.from(extractFileFromTgz(archive, 'package/a.txt')!).toString(), 'a'.repeat(700));
		assert.equal(Buffer.from(extractFileFromTgz(archive, 'package/electron.d.ts')!).toString(), 'typings');
		assert.equal(extractFileFromTgz(archive, 'package/missing.d.ts'), undefined);
	});

	test('rejects malformed entry sizes instead of looping or reading past the archive', () => {
		for (const size of ['-0000001000', '0000000001x', '77777777777']) {
			const archive = tgz([
				{ name: 'package/other.txt', contents: 'x'.repeat(10), size },
				{ name: 'package/electron.d.ts', contents: 'typings' },
			]);
			assert.throws(() => extractFileFromTgz(archive, 'package/electron.d.ts'), /Invalid tar entry size/, size);
		}
	});

	test('uses the GitHub release when it succeeds', async () => {
		const requested = stubFetch({ 'github.com': () => new Response(typings) });
		const packed: string[] = [];
		const contents = await downloadElectronTypes('1.2.3', sha256(Buffer.from(typings)), version => { packed.push(version); return npmTarball; });
		assert.equal(Buffer.from(contents).toString(), typings);
		assert.deepEqual(requested, ['https://github.com/electron/electron/releases/download/v1.2.3/electron.d.ts']);
		assert.deepEqual(packed, []);
	});

	test('falls back to the npm package when GitHub fails', async () => {
		stubFetch({ 'github.com': () => new Response('', { status: 504 }) });
		const packed: string[] = [];
		const contents = await downloadElectronTypes('1.2.3', sha256(Buffer.from(typings)), version => { packed.push(version); return npmTarball; });
		assert.equal(Buffer.from(contents).toString(), typings);
		assert.deepEqual(packed, ['1.2.3']);
	});

	test('rejects a fallback that does not match the pinned checksum', async () => {
		stubFetch({ 'github.com': () => new Response('', { status: 504 }) });
		await assert.rejects(downloadElectronTypes('1.2.3', '0'.repeat(64), () => npmTarball), /status code: 504.*Checksum mismatch/s);
	});

	test('reports both failures when the npm package cannot be fetched either', async () => {
		stubFetch({ 'github.com': () => new Response('', { status: 504 }) });
		await assert.rejects(downloadElectronTypes('1.2.3', sha256(Buffer.from(typings)), () => { throw new Error('npm pack failed'); }), /status code: 504.*npm pack failed/s);
	});

	test('rejects an unexpected Electron version before running npm', () => {
		assert.throws(() => packElectronFromNpm('1.2.3 && echo'), /Unexpected Electron version/);
	});
});