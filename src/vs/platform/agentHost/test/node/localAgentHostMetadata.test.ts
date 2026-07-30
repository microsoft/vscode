/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cleanupLocalAgentHostEndpointMetadataSync, createLocalAgentHostEndpointMetadata, prepareLocalAgentHostEndpointMetadataDirectory, prepareLocalAgentHostEndpointSocketDirectory, publishLocalAgentHostEndpointMetadata } from '../../node/localAgentHostMetadata.js';

suite('Local Agent Host Endpoint Metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let userDataPath: string;
	let metadataPath: string;

	setup(async () => {
		userDataPath = await fs.promises.mkdtemp(join(os.tmpdir(), 'local-agent-host-metadata-test-'));
		metadataPath = join(userDataPath, 'agent-host', 'local-endpoint', 'metadata.json');
		await prepareLocalAgentHostEndpointMetadataDirectory(userDataPath);
		await prepareLocalAgentHostEndpointSocketDirectory(userDataPath);
	});

	teardown(async () => {
		await fs.promises.rm(userDataPath, { recursive: true, force: true });
	});

	test('creates scoped endpoint metadata', () => {
		const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
		const other = createLocalAgentHostEndpointMetadata(join(userDataPath, 'other'));

		assert.deepStrictEqual({
			type: metadata.type,
			schemaVersion: metadata.schemaVersion,
			pid: metadata.pid,
			protocolVersion: metadata.protocolVersion,
			tokenLength: metadata.connectionToken.length,
			isScoped: metadata.endpoint.path !== other.endpoint.path,
		}, {
			type: 'editor',
			schemaVersion: 2,
			pid: process.pid,
			protocolVersion: metadata.protocolVersion,
			tokenLength: 43,
			isScoped: true,
		});
	});

	if (process.platform !== 'win32') {
		test('uses a bounded path under the system temporary directory', () => {
			const deeplyNested = join(userDataPath, ...Array.from({ length: 40 }, (_, index) => `deep-${index}`));
			const metadata = createLocalAgentHostEndpointMetadata(deeplyNested);

			assert.deepStrictEqual({
				isUnderTemp: dirname(dirname(metadata.endpoint.path)) === os.tmpdir(),
				isShort: Buffer.byteLength(metadata.endpoint.path) < 104,
			}, {
				isUnderTemp: true,
				isShort: true,
			});
		});

		test('writes owner-only socket directory permissions', async () => {
			const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
			assert.strictEqual((await fs.promises.stat(dirname(metadata.endpoint.path))).mode & 0o777, 0o700);
		});
	}

	test('preserves distinct writers and removes only the exact owner', async () => {
		const first = createLocalAgentHostEndpointMetadata(userDataPath);
		const second = createLocalAgentHostEndpointMetadata(userDataPath);

		await publishLocalAgentHostEndpointMetadata(userDataPath, first);
		await publishLocalAgentHostEndpointMetadata(userDataPath, second);
		const publishedBoth = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));

		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, first);
		const publishedAfterFirstRemoved = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, second);

		assert.deepStrictEqual({
			publishedBoth,
			publishedAfterFirstRemoved,
			removed: !fs.existsSync(metadataPath),
			files: await fs.promises.readdir(dirname(metadataPath)),
		}, {
			publishedBoth: [first, second],
			publishedAfterFirstRemoved: [second],
			removed: true,
			files: [],
		});
	});

	test('concurrent writers preserve every entry (no lost updates)', async () => {
		const writers = Array.from({ length: 5 }, () => createLocalAgentHostEndpointMetadata(userDataPath));

		await Promise.all(writers.map(metadata => publishLocalAgentHostEndpointMetadata(userDataPath, metadata)));

		const published: Array<{ instanceId: string }> = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
		assert.deepStrictEqual(
			new Set(published.map(entry => entry.instanceId)),
			new Set(writers.map(writer => writer.instanceId)),
		);
	});

	test('reclaims a lock abandoned by a dead process', async () => {
		// A process that has already exited by the time spawnSync returns, so
		// its PID is guaranteed to no longer be alive. `process.execPath` is
		// Electron under the unit test runner, so it must be told to run as
		// plain Node (matching the pattern used elsewhere in this codebase,
		// e.g. node/claude/claudeSdkOptions.ts) rather than launch the full app.
		const deadPid = spawnSync(process.execPath, ['-e', '0'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).pid!;
		const lockDirectoryPath = `${metadataPath}.lock`;
		await fs.promises.mkdir(lockDirectoryPath);
		await fs.promises.writeFile(join(lockDirectoryPath, 'owner.json'), JSON.stringify({ pid: deadPid, instanceId: 'stale-owner' }), 'utf8');

		const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, metadata);

		assert.deepStrictEqual({
			published: JSON.parse(await fs.promises.readFile(metadataPath, 'utf8')).map((entry: { instanceId: string }) => entry.instanceId),
			lockRemoved: !fs.existsSync(lockDirectoryPath),
		}, {
			published: [metadata.instanceId],
			lockRemoved: true,
		});
	});

	test('fails closed (throws) rather than bypassing a lock a live process holds', async function () {
		this.timeout(10_000);

		// Our own PID is alive by definition, so recording it (with a different
		// instanceId) as the lock owner simulates another live writer holding
		// the lock for the entire bounded acquisition window.
		const lockDirectoryPath = `${metadataPath}.lock`;
		await fs.promises.mkdir(lockDirectoryPath);
		await fs.promises.writeFile(join(lockDirectoryPath, 'owner.json'), JSON.stringify({ pid: process.pid, instanceId: 'other-live-writer' }), 'utf8');

		const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
		await assert.rejects(() => publishLocalAgentHostEndpointMetadata(userDataPath, metadata));

		assert.deepStrictEqual({
			metadataFileWritten: fs.existsSync(metadataPath),
			lockStillHeld: fs.existsSync(lockDirectoryPath),
		}, {
			metadataFileWritten: false,
			lockStillHeld: true,
		});

		await fs.promises.rm(lockDirectoryPath, { recursive: true, force: true });
	});

	if (process.platform !== 'win32') {
		test('writes owner-only metadata permissions', async () => {
			const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
			await publishLocalAgentHostEndpointMetadata(userDataPath, metadata);

			assert.deepStrictEqual({
				directory: (await fs.promises.stat(dirname(metadataPath))).mode & 0o777,
				file: (await fs.promises.stat(metadataPath)).mode & 0o777,
			}, {
				directory: 0o700,
				file: 0o600,
			});
		});
	}
});
