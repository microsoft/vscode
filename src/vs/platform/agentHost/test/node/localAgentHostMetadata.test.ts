/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
			isScoped: metadata.endpointPath !== other.endpointPath,
		}, {
			type: 'editor',
			schemaVersion: 1,
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
				isUnderTemp: dirname(dirname(metadata.endpointPath)) === os.tmpdir(),
				isShort: Buffer.byteLength(metadata.endpointPath) < 104,
			}, {
				isUnderTemp: true,
				isShort: true,
			});
		});

		test('writes owner-only socket directory permissions', async () => {
			const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
			assert.strictEqual((await fs.promises.stat(dirname(metadata.endpointPath))).mode & 0o777, 0o700);
		});
	}

	test('atomically replaces and owner-checks metadata', async () => {
		const first = createLocalAgentHostEndpointMetadata(userDataPath);
		const second = createLocalAgentHostEndpointMetadata(userDataPath);

		await publishLocalAgentHostEndpointMetadata(userDataPath, first);
		await publishLocalAgentHostEndpointMetadata(userDataPath, second);
		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, first);
		const published = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, second);

		assert.deepStrictEqual({
			published,
			removed: !fs.existsSync(metadataPath),
			files: await fs.promises.readdir(dirname(metadataPath)),
		}, {
			published: [second],
			removed: true,
			files: [],
		});
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
