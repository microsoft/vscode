/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactIntegrationStore } from '../../common/artifactIntegrationStore.js';
import { ArtifactStorageCommitError } from '../../common/artifactRuntime.js';
import { FileArtifactIntegrationStorage } from '../../node/artifactIntegrationStorage.js';

suite('Artifact file storage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let resource: URI;

	setup(async () => {
		directory = await fs.mkdtemp(join(tmpdir(), 'vscode-artifact-ledger-'));
		resource = URI.file(join(directory, 'ledger.json'));
	});

	teardown(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('a failure before replacement leaves storage and the published state unchanged', async () => {
		const storage = new FileArtifactIntegrationStorage(resource, {
			...fs,
			rename: async () => { throw new Error('Rename failed'); },
		});
		const ledger = new ArtifactIntegrationStore('authority', storage, () => true);
		await assert.rejects(ledger.transact(state => { state.revision = 1; }), /Rename failed/);
		assert.deepStrictEqual({
			stored: await storage.read(), revision: ledger.state.get().revision, files: await fs.readdir(directory),
		}, { stored: undefined, revision: 0, files: [] });
	});

	for (const operation of ['open', 'sync', 'close'] as const) {
		(isWindows ? test.skip : test)(`a directory ${operation} failure publishes the committed state and blocks further writes`, async () => {
			const failure = new Error(`Directory ${operation} failed`);
			const storage = new FileArtifactIntegrationStorage(resource, {
				...fs,
				open: async (path, flags, mode) => {
					if (path === directory && operation === 'open') {
						throw failure;
					}
					const handle = await fs.open(path, flags, mode);
					return path !== directory ? handle : new class extends mock<fs.FileHandle>() {
						override async sync() {
							if (operation === 'sync') {
								throw failure;
							}
							await handle.sync();
						}
						override async close() {
							await handle.close();
							if (operation === 'close') {
								throw failure;
							}
						}
					}();
				},
			});
			const ledger = new ArtifactIntegrationStore('authority', storage, () => true);
			await assert.rejects(ledger.transact(state => { state.revision = 1; }), error =>
				error instanceof ArtifactStorageCommitError && error.cause === failure);
			await assert.rejects(ledger.transact(state => { state.revision = 100; }), ArtifactStorageCommitError);
			const restored = new ArtifactIntegrationStore('authority', new FileArtifactIntegrationStorage(resource), () => true);
			await restored.initialize();
			assert.deepStrictEqual({
				revision: ledger.state.get().revision,
				stored: JSON.parse((await storage.read())!),
				restored: restored.state.get(),
				files: await fs.readdir(directory),
			}, {
				revision: 2, stored: ledger.state.get(), restored: ledger.state.get(), files: ['ledger.json'],
			});
		});
	}
});
