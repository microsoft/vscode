/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppModulePath, resolveAppModulePathSync } from '../appNodeModules';

describe('appNodeModules', () => {
	let appRoot: string;

	beforeEach(async () => {
		appRoot = await mkdtemp(join(tmpdir(), 'copilot-app-node-modules-'));
	});

	afterEach(async () => {
		await rm(appRoot, { recursive: true, force: true });
	});

	it('prefers plain node_modules when present (sync)', async () => {
		const plain = join(appRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin');
		const unpacked = join(appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin');
		await mkdir(plain, { recursive: true });
		await mkdir(unpacked, { recursive: true });

		expect(resolveAppModulePathSync(appRoot, '@vscode', 'ripgrep-universal', 'bin')).toBe(plain);
	});

	it('falls back to node_modules.asar.unpacked in a packaged build (sync)', async () => {
		const unpacked = join(appRoot, 'node_modules.asar.unpacked', '@microsoft', 'mxc-sdk', 'bin');
		await mkdir(unpacked, { recursive: true });

		expect(resolveAppModulePathSync(appRoot, '@microsoft', 'mxc-sdk', 'bin')).toBe(unpacked);
	});

	it('returns the plain node_modules path when neither root exists (sync)', () => {
		expect(resolveAppModulePathSync(appRoot, '@vscode', 'ripgrep-universal', 'bin')).toBe(
			join(appRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin')
		);
	});

	it('resolves across both roots (async)', async () => {
		const unpacked = join(appRoot, 'node_modules.asar.unpacked', 'node-pty');
		await mkdir(unpacked, { recursive: true });

		await expect(resolveAppModulePath(appRoot, 'node-pty')).resolves.toBe(unpacked);
	});
});
