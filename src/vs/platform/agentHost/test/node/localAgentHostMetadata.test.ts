/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostEndpointIdentity, IAgentHostEndpointMetadata, getAgentHostEndpointIdentityHashInput } from '../../common/agentHostEndpointRegistry.js';
import { ILocalAgentHostEndpointMetadata, cleanupLocalAgentHostEndpointMetadataSync, createLocalAgentHostEndpointMetadata, prepareLocalAgentHostEndpointMetadataDirectory, prepareLocalAgentHostEndpointSocketDirectory, publishLocalAgentHostEndpointMetadata, readLocalAgentHostEndpointRegistry } from '../../node/localAgentHostMetadata.js';

suite('Local Agent Host Endpoint Metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let userDataPath: string;
	let endpointDirectory: string;
	let entriesDirectory: string;
	let legacyMetadataPath: string;

	setup(async () => {
		userDataPath = await fs.promises.mkdtemp(join(os.tmpdir(), 'local-agent-host-metadata-test-'));
		endpointDirectory = join(userDataPath, 'agent-host', 'local-endpoint');
		entriesDirectory = join(endpointDirectory, 'entries');
		legacyMetadataPath = join(endpointDirectory, 'metadata.json');
		await prepareLocalAgentHostEndpointMetadataDirectory(userDataPath);
		await prepareLocalAgentHostEndpointSocketDirectory(userDataPath);
	});

	teardown(async () => {
		await fs.promises.rm(userDataPath, { recursive: true, force: true });
	});

	function entryFileName(identity: IAgentHostEndpointIdentity): string {
		return `${createHash('sha256').update(getAgentHostEndpointIdentityHashInput(identity), 'utf8').digest('hex')}.json`;
	}

	function makeEntry(identity: IAgentHostEndpointIdentity, connectionToken: string): IAgentHostEndpointMetadata {
		return {
			schemaVersion: 2,
			type: identity.type,
			pid: identity.pid,
			instanceId: identity.instanceId,
			protocolVersion: 'test-protocol',
			connectionToken,
			endpoint: { type: 'tcp', host: '127.0.0.1', port: 5123 },
		};
	}

	function identity(metadata: IAgentHostEndpointMetadata): IAgentHostEndpointIdentity {
		return { type: metadata.type, pid: metadata.pid, instanceId: metadata.instanceId };
	}

	async function readEntryFileNames(): Promise<string[]> {
		return (await fs.promises.readdir(entriesDirectory)).sort();
	}

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

	test('derives the entry file name from the (type, pid, instanceId) identity hash', async () => {
		const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, metadata);

		assert.deepStrictEqual({
			files: await readEntryFileNames(),
			content: JSON.parse(await fs.promises.readFile(join(entriesDirectory, entryFileName(identity(metadata))), 'utf8')),
		}, {
			files: [entryFileName(identity(metadata))],
			content: metadata,
		});
	});

	test('preserves distinct writers and removes only the exact owner', async () => {
		const first = createLocalAgentHostEndpointMetadata(userDataPath);
		const second = createLocalAgentHostEndpointMetadata(userDataPath);

		await publishLocalAgentHostEndpointMetadata(userDataPath, first);
		await publishLocalAgentHostEndpointMetadata(userDataPath, second);
		const filesWithBoth = await readEntryFileNames();

		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, first);
		const filesAfterFirstRemoved = await readEntryFileNames();
		cleanupLocalAgentHostEndpointMetadataSync(userDataPath, second);

		assert.deepStrictEqual({
			filesWithBoth,
			filesAfterFirstRemoved,
			filesAfterBothRemoved: await readEntryFileNames(),
			// The shared entries directory is left in place to avoid racing a concurrent publisher.
			entriesDirectoryRetained: fs.existsSync(entriesDirectory),
		}, {
			filesWithBoth: [entryFileName(identity(first)), entryFileName(identity(second))].sort(),
			filesAfterFirstRemoved: [entryFileName(identity(second))],
			filesAfterBothRemoved: [],
			entriesDirectoryRetained: true,
		});
	});

	test('concurrent writers preserve every entry (no lost updates, no lock)', async () => {
		const writers = Array.from({ length: 5 }, () => createLocalAgentHostEndpointMetadata(userDataPath));

		await Promise.all(writers.map(metadata => publishLocalAgentHostEndpointMetadata(userDataPath, metadata)));

		const registry = await readLocalAgentHostEndpointRegistry(userDataPath);
		assert.deepStrictEqual({
			registered: new Set(registry.map(entry => entry.instanceId)),
			files: (await readEntryFileNames()).length,
		}, {
			registered: new Set(writers.map(writer => writer.instanceId)),
			files: 5,
		});
	});

	test('never creates a .lock artifact', async () => {
		const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, metadata);

		const endpointEntries = await fs.promises.readdir(endpointDirectory);
		assert.deepStrictEqual(endpointEntries.filter(name => name.endsWith('.lock')), []);
	});

	test('ignores malformed, unsupported, temp, and non-entry files without hiding valid entries', async () => {
		const live = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, live);

		await fs.promises.writeFile(join(entriesDirectory, 'malformed.json'), '{ this is not json', 'utf8');
		await fs.promises.writeFile(join(entriesDirectory, 'unsupported.json'), JSON.stringify({ ...makeEntry({ type: 'standalone', pid: process.pid, instanceId: 'future' }, 'x'), schemaVersion: 999 }), 'utf8');
		await fs.promises.writeFile(join(entriesDirectory, 'staging.tmp'), 'partial write', 'utf8');
		await fs.promises.writeFile(join(entriesDirectory, 'notes.txt'), 'unrelated', 'utf8');

		const registry = await readLocalAgentHostEndpointRegistry(userDataPath);
		assert.deepStrictEqual(registry.map(entry => entry.instanceId), [live.instanceId]);
	});

	test('ignores entry files whose name does not match their identity hash', async () => {
		const live = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, live);

		const impostor = JSON.stringify(makeEntry(identity(live), 'impostor-token'));
		const otherIdentity: IAgentHostEndpointIdentity = { type: 'standalone', pid: process.pid, instanceId: 'other' };
		const upperIdentity: IAgentHostEndpointIdentity = { type: 'standalone', pid: process.pid, instanceId: 'upper' };
		const upperName = entryFileName(upperIdentity).replace(/\.json$/, '').toUpperCase() + '.json';
		const misnamed = ['wrong.json', entryFileName(otherIdentity), upperName];
		for (const name of misnamed) {
			await fs.promises.writeFile(join(entriesDirectory, name), impostor, 'utf8');
		}

		const registry = await readLocalAgentHostEndpointRegistry(userDataPath);
		assert.deepStrictEqual({
			registry: registry.map(entry => ({ instanceId: entry.instanceId, connectionToken: entry.connectionToken })),
			misnamedRetained: misnamed.every(name => fs.existsSync(join(entriesDirectory, name))),
		}, {
			registry: [{ instanceId: live.instanceId, connectionToken: live.connectionToken }],
			misnamedRetained: true,
		});
	});

	test('filters and best-effort removes an entry whose PID is dead', async () => {
		const deadPid = spawnSync(process.execPath, ['-e', '0'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).pid!;
		const deadIdentity: IAgentHostEndpointIdentity = { type: 'standalone', pid: deadPid, instanceId: 'dead-instance' };
		const deadEntry = makeEntry(deadIdentity, 'dead-token');
		await fs.promises.writeFile(join(entriesDirectory, entryFileName(deadIdentity)), JSON.stringify(deadEntry), 'utf8');

		const live = createLocalAgentHostEndpointMetadata(userDataPath);
		await publishLocalAgentHostEndpointMetadata(userDataPath, live);

		const registry = await readLocalAgentHostEndpointRegistry(userDataPath);
		assert.deepStrictEqual({
			registered: registry.map(entry => entry.instanceId),
			deadFileRemoved: !fs.existsSync(join(entriesDirectory, entryFileName(deadIdentity))),
		}, {
			registered: [live.instanceId],
			deadFileRemoved: true,
		});
	});

	test('merges legacy metadata.json read-only and prefers the new entry on identity collision', async () => {
		const sharedIdentity: IAgentHostEndpointIdentity = { type: 'editor', pid: process.pid, instanceId: 'shared-instance' };
		const legacyOnly = makeEntry({ type: 'standalone', pid: process.pid, instanceId: 'legacy-only' }, 'legacy-only-token');
		const legacyPayload = [makeEntry(sharedIdentity, 'legacy-token'), legacyOnly];
		await fs.promises.writeFile(legacyMetadataPath, JSON.stringify(legacyPayload), 'utf8');

		const winningEntry: ILocalAgentHostEndpointMetadata = {
			schemaVersion: 2,
			type: 'editor',
			pid: sharedIdentity.pid,
			instanceId: sharedIdentity.instanceId,
			protocolVersion: 'test-protocol',
			connectionToken: 'new-token',
			endpoint: { type: 'socket', path: join(userDataPath, 'ignored.sock') },
		};
		await publishLocalAgentHostEndpointMetadata(userDataPath, winningEntry);

		const registry = await readLocalAgentHostEndpointRegistry(userDataPath);
		assert.deepStrictEqual({
			registry: registry.map(entry => ({ type: entry.type, instanceId: entry.instanceId, connectionToken: entry.connectionToken })),
			legacyUntouched: JSON.parse(await fs.promises.readFile(legacyMetadataPath, 'utf8')),
		}, {
			registry: [
				{ type: 'standalone', instanceId: 'legacy-only', connectionToken: 'legacy-only-token' },
				{ type: 'editor', instanceId: 'shared-instance', connectionToken: 'new-token' },
			],
			legacyUntouched: legacyPayload,
		});
	});

	if (process.platform !== 'win32') {
		test('writes owner-only metadata and entry permissions', async () => {
			const metadata = createLocalAgentHostEndpointMetadata(userDataPath);
			await publishLocalAgentHostEndpointMetadata(userDataPath, metadata);

			assert.deepStrictEqual({
				metadataDirectory: (await fs.promises.stat(endpointDirectory)).mode & 0o777,
				entriesDirectory: (await fs.promises.stat(entriesDirectory)).mode & 0o777,
				entryFile: (await fs.promises.stat(join(entriesDirectory, entryFileName(identity(metadata))))).mode & 0o777,
			}, {
				metadataDirectory: 0o700,
				entriesDirectory: 0o700,
				entryFile: 0o600,
			});
		});
	}
});
