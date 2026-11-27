/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { normalizeCommentDashes, resolveCodexBinary } from '../generate-protocol.mjs';

suite('codex protocol binary resolution', () => {
	let root: string;
	let originalCodexBin: string | undefined;

	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), 'codex-binary-test-')));
		originalCodexBin = process.env.CODEX_BIN;
		delete process.env.CODEX_BIN;
	});

	afterEach(() => {
		if (originalCodexBin === undefined) {
			delete process.env.CODEX_BIN;
		} else {
			process.env.CODEX_BIN = originalCodexBin;
		}
		rmSync(root, { recursive: true, force: true });
	});

	const triples: Record<string, string> = {
		'linux-x64': 'x86_64-unknown-linux-musl',
		'linux-arm64': 'aarch64-unknown-linux-musl',
		'darwin-x64': 'x86_64-apple-darwin',
		'darwin-arm64': 'aarch64-apple-darwin',
		'win32-x64': 'x86_64-pc-windows-msvc',
		'win32-arm64': 'aarch64-pc-windows-msvc',
	};
	const target = `${process.platform}-${process.arch}`;
	const alias = `@openai/codex-${target}`;
	const binaryRelativePath = path.join('vendor', triples[target], 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');

	function createPackage(directory: string, binary = false): string {
		mkdirSync(directory, { recursive: true });
		writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@openai/codex' }));
		const file = path.join(directory, binaryRelativePath);
		if (binary) {
			mkdirSync(path.dirname(file), { recursive: true });
			writeFileSync(file, '');
		}
		return file;
	}

	for (const layout of ['hoisted', 'nested', 'isolated']) {
		test(`finds the installed platform binary in the ${layout} layout before PATH`, () => {
			const modules = path.join(root, 'node_modules');
			const packageRoot = layout === 'isolated'
				? path.join(modules, '.pnpm', '@openai+codex@1.0.0', 'node_modules', '@openai', 'codex')
				: path.join(modules, '@openai', 'codex');
			createPackage(packageRoot);
			const platformRoot = layout === 'nested'
				? path.join(packageRoot, 'node_modules', alias)
				: layout === 'isolated'
					? path.join(modules, '.pnpm', '@openai+codex@1.0.0-test', 'node_modules', '@openai', 'codex')
					: path.join(modules, alias);
			const binary = createPackage(platformRoot, true);
			if (layout === 'isolated') {
				mkdirSync(path.join(modules, '@openai'), { recursive: true });
				symlinkSync(packageRoot, path.join(modules, '@openai', 'codex'), 'junction');
				symlinkSync(platformRoot, path.join(path.dirname(packageRoot), `codex-${target}`), 'junction');
			}
			assert.strictEqual(resolveCodexBinary(root), binary);
		});
	}
});

suite('codex protocol comment normalization', () => {
	test('normalizes the generated user-verification documentation', () => {
		const source = [
			'export type UserVerificationVerifyParams = {',
			'\t/**',
			'\t * Unpadded base64url encoding of 1\u20134096 challenge bytes.',
			'\t */',
			'\tchallenge: string,',
			'\t/**',
			'\t * Display context already approved by the UI; 1\u2013256 UTF-8 bytes.',
			'\t */',
			'\ttitle: string,',
			'};',
		].join('\n');
		assert.strictEqual(normalizeCommentDashes(source), source.replace(/\u2013/g, '-'));
	});

	test('normalizes line, block, inline and end-of-file comments without changing line endings', () => {
		const source = [
			'// Leading 1\u20132',
			'export type Range = { /* Inline 1\u20132 */',
			'\tvalue: /* Before a type 1\u20132 */ string, /* After a comma 1\u20132 */',
			'}; // Trailing 1\u20132',
			'/* End of file 1\u20132 */',
		].join('\r\n');
		assert.strictEqual(normalizeCommentDashes(source), source.replace(/\u2013/g, '-'));
	});

	test('preserves quoted literals containing en dashes and comment delimiters', () => {
		const source = [
			'export type Single = \'/* 1\u20132 */\';',
			'export type Double = "// 1\u20132";',
			'export type Escaped = "\\\" /* 1\u20132 */";',
			'export type PlainTemplate = `/* 1\u20132 */`;',
			'export type Template = `${string}/* 1\u20132 */${number}// 1\u20132`;',
			'const pattern = /[/*]\u2013[*/]/;',
		].join('\n');
		assert.strictEqual(normalizeCommentDashes(source), source);
	});

	test('normalizes actual comments inside template expressions but preserves template text', () => {
		const source = 'const value = `/* 1\u20132 */ ${ /* Comment 1\u20132 */ 1 } // 1\u20132`;';
		assert.strictEqual(normalizeCommentDashes(source), source.replace('Comment 1\u20132', 'Comment 1-2'));
	});

	test('is idempotent and leaves other punctuation unchanged', () => {
		const source = '// Range 1\u20132; other punctuation \u2014\u2026\nexport type Range = "1\u20132";';
		const expected = source.replace('Range 1\u20132', 'Range 1-2');
		assert.strictEqual(normalizeCommentDashes(normalizeCommentDashes(source)), expected);
	});
});
