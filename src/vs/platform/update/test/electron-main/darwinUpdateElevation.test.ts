/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { isElevationRequiredToInstallUpdate } from '../../electron-main/darwinUpdateElevation.js';

// Folders cannot be made read-only on Windows and permissions are not enforced for the root user.
const canRestrictPermissions = !isWindows && process.getuid?.() !== 0;

(canRestrictPermissions ? suite : suite.skip)('DarwinUpdateElevation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;
	let readOnlyFolders: string[];

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'darwinupdateelevation');
		readOnlyFolders = [];
		await promises.mkdir(testDir, { recursive: true });
	});

	teardown(async () => {
		for (const folder of readOnlyFolders) {
			await promises.chmod(folder, 0o755);
		}
		await promises.rm(testDir, { recursive: true, force: true });
	});

	async function createBundle(name: string, options: { parentWritable: boolean; bundleWritable: boolean }): Promise<string> {
		const parent = join(testDir, name);
		const bundle = join(parent, 'Code.app');
		await promises.mkdir(bundle, { recursive: true });

		if (!options.bundleWritable) {
			await makeReadOnly(bundle);
		}
		if (!options.parentWritable) {
			await makeReadOnly(parent);
		}

		return bundle;
	}

	async function makeReadOnly(folder: string): Promise<void> {
		await promises.chmod(folder, 0o555);
		readOnlyFolders.push(folder);
	}

	test('requires elevation when the bundle or its parent folder is not writable', async () => {
		const readOnlyParent = await createBundle('readOnlyParent', { parentWritable: false, bundleWritable: true });
		const symlinkToReadOnlyParent = join(testDir, 'Link.app');
		await promises.symlink(readOnlyParent, symlinkToReadOnlyParent);

		const bundles: Record<string, string> = {
			writable: await createBundle('writable', { parentWritable: true, bundleWritable: true }),
			readOnlyParent,
			readOnlyBundle: await createBundle('readOnlyBundle', { parentWritable: true, bundleWritable: false }),
			symlinkToReadOnlyParent,
			missing: join(testDir, 'missing', 'Code.app'),
		};

		const actual: Record<string, { default: boolean; directContentsWrite: boolean }> = {};
		for (const [name, bundle] of Object.entries(bundles)) {
			actual[name] = {
				default: await isElevationRequiredToInstallUpdate(bundle, false),
				directContentsWrite: await isElevationRequiredToInstallUpdate(bundle, true),
			};
		}

		assert.deepStrictEqual(actual, {
			writable: { default: false, directContentsWrite: false },
			readOnlyParent: { default: true, directContentsWrite: false },
			readOnlyBundle: { default: true, directContentsWrite: true },
			symlinkToReadOnlyParent: { default: true, directContentsWrite: false },
			missing: { default: false, directContentsWrite: false },
		});
	});
});
