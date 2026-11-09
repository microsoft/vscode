/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { afterEach, suite, test } from 'node:test';
import zlib from 'node:zlib';
import { sha256 } from '../../lib/download.ts';
import { downloadElectronTypes, extractFileFromTgz } from '../electronTypes.ts';

function tgz(entries: { name: string; prefix?: string; contents: string }[]): Uint8Array {
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const contents = Buffer.from(entry.contents);
		const header = Buffer.alloc(512);
		header.write(entry.name, 0, 100);
		header.write(contents.length.toString(8).padStart(11, '0'), 124, 12);
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

	test('uses the GitHub release when it succeeds', async () => {
		const requested = stubFetch({ 'github.com': () => new Response(typings) });
		const contents = await downloadElectronTypes('1.2.3', sha256(Buffer.from(typings)));
		assert.equal(Buffer.from(contents).toString(), typings);
		assert.deepEqual(requested, ['https://github.com/electron/electron/releases/download/v1.2.3/electron.d.ts']);
	});

	test('falls back to the npm package when GitHub fails', async () => {
		const requested = stubFetch({
			'github.com': () => new Response('', { status: 504 }),
			'registry.npmjs.org': () => new Response(npmTarball),
		});
		const contents = await downloadElectronTypes('1.2.3', sha256(Buffer.from(typings)));
		assert.equal(Buffer.from(contents).toString(), typings);
		assert.equal(requested.at(-1), 'https://registry.npmjs.org/electron/-/electron-1.2.3.tgz');
	});

	test('rejects a fallback that does not match the pinned checksum', async () => {
		stubFetch({
			'github.com': () => new Response('', { status: 504 }),
			'registry.npmjs.org': () => new Response(npmTarball),
		});
		await assert.rejects(downloadElectronTypes('1.2.3', '0'.repeat(64)), /status code: 504.*Checksum mismatch/s);
	});
});