/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, afterEach } from 'node:test';
import { CODEX_INPUT_PREFIXES, diffGeneratedTrees, filterCodexInputs, listFiles } from '../check-protocol-sync.ts';

const GENERATED_DIR = 'src/vs/platform/agentHost/node/codex/protocol/generated';

const scratchDirs: string[] = [];
function makeDir(tree: Readonly<Record<string, string>>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-check-test-'));
	scratchDirs.push(root);
	for (const [rel, content] of Object.entries(tree)) {
		const abs = path.join(root, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, content);
	}
	return root;
}

afterEach(() => {
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, { recursive: true, force: true });
	}
});

suite('codex protocol freshness check helpers', () => {
	test('CODEX_INPUT_PREFIXES targets the generated dir and version pin', () => {
		assert.deepStrictEqual(CODEX_INPUT_PREFIXES, [
			`${GENERATED_DIR}/`,
			'build/codex/codex-version.txt',
		]);
	});

	test('filterCodexInputs keeps only codex generation inputs', () => {
		const changed = [
			`${GENERATED_DIR}/index.ts`,
			`${GENERATED_DIR}/nested/Thing.ts`,
			`${GENERATED_DIR}/README.md`,
			'build/codex/codex-version.txt',
			'build/codex/generate-protocol.mjs',
			'build/codex/check-protocol-sync.ts',
			'src/vs/platform/agentHost/node/codex/codexAgent.ts',
			'package.json',
			'README.md',
		];
		assert.deepStrictEqual(filterCodexInputs(changed), [
			`${GENERATED_DIR}/index.ts`,
			`${GENERATED_DIR}/nested/Thing.ts`,
			'build/codex/codex-version.txt',
		]);
	});

	test('listFiles lists files recursively, sorted, excluding README.md', () => {
		const dir = makeDir({
			'index.ts': 'a',
			'README.md': 'ignored',
			'nested/Thing.ts': 'b',
			'nested/deep/Other.ts': 'c',
		});
		assert.deepStrictEqual(listFiles(dir), ['index.ts', 'nested/Thing.ts', 'nested/deep/Other.ts']);
	});

	test('diffGeneratedTrees reports content, missing, and extra files (README ignored)', () => {
		const committed = makeDir({
			'index.ts': 'export const a = 1;',
			'Same.ts': 'same',
			'Changed.ts': 'old',
			'OnlyCommitted.ts': 'gone',
			'README.md': 'committed readme',
		});
		const fresh = makeDir({
			'index.ts': 'export const a = 1;',
			'Same.ts': 'same',
			'Changed.ts': 'new',
			'OnlyFresh.ts': 'added',
			'README.md': 'different readme',
		});
		assert.deepStrictEqual(diffGeneratedTrees(committed, fresh), [
			'Changed.ts (content differs from regeneration)',
			'OnlyCommitted.ts (committed but not produced by regeneration)',
			'OnlyFresh.ts (produced by regeneration but missing from the committed client)',
		]);
	});

	test('diffGeneratedTrees returns no differences for identical trees', () => {
		const tree = { 'index.ts': 'x', 'nested/Thing.ts': 'y', 'README.md': 'whatever' };
		assert.deepStrictEqual(diffGeneratedTrees(makeDir(tree), makeDir(tree)), []);
	});
});
