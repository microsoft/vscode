/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { createPackageWithOptions, extractFile } from 'asar';
import { mergeASARs } from 'vscode-universal-bundler/dist/cjs/asar-utils.js';
import { singleArchFiles } from '../../darwin/create-universal-app.ts';

async function createArchive(root: string, arch: string, files: Record<string, string>): Promise<string> {
	const source = path.join(root, arch);
	for (const [file, contents] of Object.entries(files)) {
		const target = path.join(source, file);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, contents);
	}
	const archive = path.join(root, `${arch}.asar`);
	await createPackageWithOptions(source, archive, { dot: true, unpackDir: '@github' });
	return archive;
}

suite('universal app ASAR merge', () => {
	test('preserves hidden SDK plugin metadata for both architectures', async t => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'vscode-universal-test-'));
		t.after(() => rm(root, { recursive: true, force: true }));

		const filesForArch = (arch: string) => ({
			[`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.mcp.json`]: `{"arch":"${arch}"}`,
			[`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.plugin/plugin.json`]: `{"name":"browser-use-${arch}"}`,
			[`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.release-target`]: `darwin-${arch}`,
			[`@github/copilot-sdk-darwin-${arch}/copilot-sdk/index.js`]: `export const arch = '${arch}';`,
		});
		const x64Files = filesForArch('x64');
		const arm64Files = filesForArch('arm64');
		const x64AsarPath = await createArchive(root, 'x64', x64Files);
		const arm64AsarPath = await createArchive(root, 'arm64', arm64Files);
		const outputAsarPath = path.join(root, 'universal.asar');

		await mergeASARs({ x64AsarPath, arm64AsarPath, outputAsarPath, singleArchFiles });

		const expected = { ...x64Files, ...arm64Files };
		assert.deepStrictEqual(
			Object.fromEntries(Object.keys(expected).map(file => [file, extractFile(outputAsarPath, file).toString()])),
			expected,
		);
	});

	test('still rejects architecture-only files outside the allowlist', async t => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'vscode-universal-test-'));
		t.after(() => rm(root, { recursive: true, force: true }));

		const x64AsarPath = await createArchive(root, 'x64', {
			'shared.json': '{}',
			'other-package/plugins/browser-use/.mcp.json': '{}',
		});
		const arm64AsarPath = await createArchive(root, 'arm64', { 'shared.json': '{}' });

		await assert.rejects(
			mergeASARs({ x64AsarPath, arm64AsarPath, outputAsarPath: path.join(root, 'universal.asar'), singleArchFiles }),
			/not covered by allowList rule/,
		);
	});
});
