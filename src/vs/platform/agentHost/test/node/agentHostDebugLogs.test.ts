/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomBytes } from 'crypto';
import { mkdtemp, mkdir, readdir, rm, truncate, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { URI } from '../../../../base/common/uri.js';
import { timeout } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { buffer } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDebugLogsCollector } from '../../node/agentHostDebugLogs.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_BYTES } from '../../common/agentService.js';

suite('AgentHostDebugLogsCollector', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testRoot: string;

	setup(async () => {
		testRoot = await mkdtemp(join(tmpdir(), 'agent-host-debug-logs-test-'));
	});

	teardown(async () => {
		await rm(testRoot, { recursive: true, force: true });
	});

	test('creates a flat archive from provider and host logs', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		await writeFile(join(logsHome, 'agenthost.log'), 'agent host');
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const result = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				await writeFile(join(outputDirectory.fsPath, 'events.jsonl'), 'event');
				return true;
			},
		}], URI.parse('test:/session-1'), 'archive');

		assert.deepStrictEqual({
			kind: result.kind,
			providerLogsIncluded: result.providerLogsIncluded,
			sizeIsBounded: result.size > 0 && result.uncompressedSize > 0
				&& result.size <= AGENT_HOST_DEBUG_LOGS_MAX_BYTES
				&& result.uncompressedSize <= AGENT_HOST_DEBUG_LOGS_MAX_BYTES,
			events: (await buffer(result.resource.fsPath, 'events.jsonl')).toString(),
			agentHost: (await buffer(result.resource.fsPath, 'agenthost.log')).toString(),
		}, {
			kind: 'archive',
			providerLogsIncluded: true,
			sizeIsBounded: true,
			events: 'event',
			agentHost: 'agent host',
		});
	});

	test('rejects and cleans an oversized directory artifact', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		await assert.rejects(collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				const largeLog = join(outputDirectory.fsPath, 'large.log');
				await writeFile(largeLog, '');
				await truncate(largeLog, AGENT_HOST_DEBUG_LOGS_MAX_BYTES + 1);
				return true;
			},
		}], undefined, 'directory'), /Agent Host debug logs are too large/);
		assert.deepStrictEqual(await readdir(outputRoot), []);
	});

	test('streams an archive artifact in bounded chunks and refuses foreign paths', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const artifact = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				// Incompressible, so the resulting archive spans several chunks.
				await writeFile(join(outputDirectory.fsPath, 'events.jsonl'), randomBytes(3 * 1024 * 1024));
				return true;
			},
		}], undefined, 'archive');

		const chunks: number[] = [];
		let position = 0;
		let eof = false;
		while (!eof) {
			const chunk = await collector.readArtifactChunk(artifact.resource, position);
			chunks.push(chunk.data.byteLength);
			position += chunk.data.byteLength;
			eof = chunk.eof;
		}

		const outsider = join(testRoot, 'outsider.txt');
		await writeFile(outsider, 'secret');

		assert.deepStrictEqual({
			transferred: position,
			matchesDeclaredSize: position === artifact.size,
			everyChunkBounded: chunks.every(size => size <= AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES),
			chunkCountAboveOne: chunks.length > 1,
			foreignRead: await collector.readArtifactChunk(URI.file(outsider), 0).then(() => 'resolved', () => 'rejected'),
			negativePosition: await collector.readArtifactChunk(artifact.resource, -1).then(() => 'resolved', () => 'rejected'),
			// The artifact URI must survive a protocol round-trip, which is how
			// a remote client sends it back (and which normalizes drive casing).
			afterUriRoundTrip: (await collector.readArtifactChunk(URI.parse(artifact.resource.toString(), true), 0)).data.byteLength > 0,
		}, {
			transferred: artifact.size,
			matchesDeclaredSize: true,
			everyChunkBounded: true,
			chunkCountAboveOne: true,
			foreignRead: 'rejected',
			negativePosition: 'rejected',
			afterUriRoundTrip: true,
		});
	});

	test('refuses to stream a directory artifact', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const artifact = await collector.collect([], undefined, 'directory');

		await assert.rejects(collector.readArtifactChunk(artifact.resource, 0), /Unknown or expired/);
	});

	test('accepts logs that exceed the transfer limit only before compression', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const result = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				// Highly compressible, like real log text: over the transfer
				// limit uncompressed, comfortably under it once zipped.
				await writeFile(join(outputDirectory.fsPath, 'huge.log'), Buffer.alloc(AGENT_HOST_DEBUG_LOGS_MAX_BYTES + 1024));
				return true;
			},
		}], undefined, 'archive');

		assert.deepStrictEqual({
			uncompressedOverLimit: result.uncompressedSize > AGENT_HOST_DEBUG_LOGS_MAX_BYTES,
			archiveUnderLimit: result.size < AGENT_HOST_DEBUG_LOGS_MAX_BYTES,
		}, {
			uncompressedOverLimit: true,
			archiveUnderLimit: true,
		});
	});

	test('expires an abandoned artifact', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService(), 5));

		await collector.collect([], undefined, 'directory');
		await timeout(20);

		assert.deepStrictEqual(await readdir(outputRoot), []);
	});

	test('removes retained artifacts when disposed', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		await collector.collect([], undefined, 'directory');
		collector.dispose();
		await timeout(20);

		assert.deepStrictEqual(await readdir(outputRoot), []);
	});
});
