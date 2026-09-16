/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { computeNLSMetadataHash } from '../nlsMetadata.ts';

suite('NLS metadata identity', () => {
	let directory: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'vscode-nls-metadata-'));
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	function writeMetadata(name: string, keys: Array<[string, string[]]>, messages: string[]): string {
		const metadataPath = join(directory, name);
		mkdirSync(metadataPath);
		writeFileSync(join(metadataPath, 'nls.keys.json'), JSON.stringify(keys));
		writeFileSync(join(metadataPath, 'nls.messages.json'), JSON.stringify(messages));
		return metadataPath;
	}

	test('identical tables have the same identity regardless of output location', () => {
		const first = writeMetadata('first', [['module', ['key']]], ['Message']);
		const second = writeMetadata('second', [['module', ['key']]], ['Message']);
		const hash = computeNLSMetadataHash(first, 'commit');

		assert.deepStrictEqual({
			hashLength: hash.length,
			sameIdentity: hash === computeNLSMetadataHash(second, 'commit')
		}, {
			hashLength: 64,
			sameIdentity: true
		});
	});

	test('the identity includes key order, default messages and commit', () => {
		const original = writeMetadata('original', [['module', ['first', 'second']]], ['Same', 'Same']);
		const reordered = writeMetadata('reordered', [['module', ['second', 'first']]], ['Same', 'Same']);
		const changedMessages = writeMetadata('changed', [['module', ['first', 'second']]], ['Changed', 'Same']);
		const identities = [
			computeNLSMetadataHash(original, 'commit'),
			computeNLSMetadataHash(reordered, 'commit'),
			computeNLSMetadataHash(changedMessages, 'commit'),
			computeNLSMetadataHash(original, 'another-commit')
		];

		assert.strictEqual(new Set(identities).size, identities.length);
	});

	test('missing metadata fails packaging instead of producing a shared fallback identity', () => {
		assert.throws(() => computeNLSMetadataHash(directory, 'commit'), { code: 'ENOENT' });
	});
});
