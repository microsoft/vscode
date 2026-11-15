/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { findMissingNativeOptionalDep } from '../../azure-pipelines/common/checkNativeOptionalDeps.ts';

suite('findMissingNativeOptionalDep', () => {

	let root: string;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'native-optional-deps-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function createPackage(...segments: string[]): void {
		mkdirSync(path.join(root, ...segments), { recursive: true });
	}

	test('finds the platform package in a flat or symlinked node_modules', () => {
		// Flat: next to the base package.
		createPackage('flat', 'node_modules', '@openai', 'codex');
		createPackage('flat', 'node_modules', '@openai', 'codex-linux-x64');
		// Flat: in the base package's own node_modules.
		createPackage('nested', 'node_modules', '@openai', 'codex');
		createPackage('nested', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-linux-x64');
		// Symlinked (pnpm's isolated layout): next to the real folder of the base package.
		createPackage('isolated', 'node_modules', '.pnpm', '@openai+codex@1.0.0', 'node_modules', '@openai', 'codex');
		createPackage('isolated', 'node_modules', '.pnpm', '@openai+codex@1.0.0', 'node_modules', '@openai', 'codex-linux-x64');
		createPackage('isolated', 'node_modules', '@openai');
		symlinkSync(path.join(root, 'isolated', 'node_modules', '.pnpm', '@openai+codex@1.0.0', 'node_modules', '@openai', 'codex'), path.join(root, 'isolated', 'node_modules', '@openai', 'codex'), 'junction');
		// Missing.
		createPackage('missing', 'node_modules', '@openai', 'codex');

		assert.deepStrictEqual(
			['flat', 'nested', 'isolated', 'missing', 'absent'].map(layout => findMissingNativeOptionalDep(path.join(root, layout, 'node_modules'), '@openai/codex', 'linux-x64')),
			[undefined, undefined, undefined, '@openai/codex-linux-x64', undefined]
		);
	});
});
