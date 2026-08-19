/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomBytes } from 'crypto';
import { mkdtemp, mkdir, readdir, rm, truncate, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { URI } from '../../../../base/common/uri.js';
import { join } from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { buffer } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDebugLogsCollector } from '../../node/agentHostDebugLogs.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, AGENT_HOST_DEBUG_LOGS_MAX_FILE_BYTES } from '../../common/agentService.js';

suite('AgentHostDebugLogsCollector', () => {
	const emptyProvider = { id: 'test', collectDebugLogs: async () => false };

	async function waitForEmptyDirectory(path: string): Promise<void> {
		for (let i = 0; i < 100; i++) {
			if ((await readdir(path)).length === 0) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		assert.deepStrictEqual(await readdir(path), []);
	}
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
				// A directory artifact is copied file-by-file, so its total
				// uncompressed size is what must stay bounded. No single file can
				// exceed the per-file cap, so it takes several to go over.
				for (let i = 0; i < 3; i++) {
					const largeLog = join(outputDirectory.fsPath, `large-${i}.log`);
					await writeFile(largeLog, '');
					await truncate(largeLog, AGENT_HOST_DEBUG_LOGS_MAX_FILE_BYTES - 1);
				}
				return true;
			},
		}], URI.parse('test:/session-1'), 'directory'), /Agent Host debug logs are too large/);
		assert.deepStrictEqual(await readdir(outputRoot), []);
	});

	test('rejects and cleans an artifact with too many files', async () => {
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
				for (let i = 0; i <= AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES; i++) {
					await writeFile(join(outputDirectory.fsPath, `${i}.log`), '');
				}
				return true;
			},
		}], URI.parse('test:/session-1'), 'archive'), /too many files/);
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
		}], URI.parse('test:/session-1'), 'archive');

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

	test('streams only files enumerated in a retained directory artifact', async () => {
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
				await mkdir(join(outputDirectory.fsPath, 'nested'));
				await writeFile(join(outputDirectory.fsPath, 'nested', 'debug.log'), 'directory artifact');
				return true;
			},
		}], URI.parse('test:/session-1'), 'directory');
		const file = joinPath(artifact.resource, 'nested', 'debug.log');
		const chunk = await collector.readArtifactChunk(file, 0);
		const foreignFile = URI.file(join(testRoot, 'foreign.log'));
		await writeFile(foreignFile.fsPath, 'foreign');

		assert.deepStrictEqual({
			data: chunk.data.toString(),
			eof: chunk.eof,
			rootRead: await collector.readArtifactChunk(artifact.resource, 0).then(() => 'resolved', () => 'rejected'),
			foreignRead: await collector.readArtifactChunk(foreignFile, 0).then(() => 'resolved', () => 'rejected'),
		}, {
			data: 'directory artifact',
			eof: true,
			rootRead: 'rejected',
			foreignRead: 'rejected',
		});
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
				// Highly compressible, like real log text: together these exceed
				// the transfer limit uncompressed while each stays under the
				// per-file cap, yet they compress to well under the limit.
				for (let i = 0; i < 3; i++) {
					await writeFile(join(outputDirectory.fsPath, `big-${i}.log`), Buffer.alloc(AGENT_HOST_DEBUG_LOGS_MAX_FILE_BYTES - 1024));
				}
				return true;
			},
		}], URI.parse('test:/session-1'), 'archive');

		assert.deepStrictEqual({
			uncompressedOverLimit: result.uncompressedSize > AGENT_HOST_DEBUG_LOGS_MAX_BYTES,
			archiveUnderLimit: result.size < AGENT_HOST_DEBUG_LOGS_MAX_BYTES,
		}, {
			uncompressedOverLimit: true,
			archiveUnderLimit: true,
		});
	});

	test('keeps the tail of a file that exceeds the per-file cap', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const head = Buffer.alloc(AGENT_HOST_DEBUG_LOGS_MAX_FILE_BYTES, 'A');
		const tail = Buffer.from('THE-INTERESTING-END');
		const artifact = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				await writeFile(join(outputDirectory.fsPath, 'huge.log'), Buffer.concat([head, tail]));
				return true;
			},
		}], URI.parse('test:/session-1'), 'archive');

		const kept = await buffer(artifact.resource.fsPath, 'huge.log');
		assert.deepStrictEqual({
			cappedToLimit: kept.length === AGENT_HOST_DEBUG_LOGS_MAX_FILE_BYTES,
			keptTheTail: kept.subarray(kept.length - tail.length).toString(),
		}, {
			cappedToLimit: true,
			keptTheTail: 'THE-INTERESTING-END',
		});
	});

	test('propagates provider collection failures and cleans staging', async () => {
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
			collectDebugLogs: async () => { throw new Error('SDK collection failed'); },
		}], URI.parse('test:/session-1'), 'archive'), /SDK collection failed/);
		assert.deepStrictEqual(await readdir(outputRoot), []);
	});

	test('collects host-wide logs without a session', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		await writeFile(join(logsHome, 'agenthost.log'), 'agent host');
		let receivedSession: URI | undefined;
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const artifact = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (session, outputDirectory) => {
				receivedSession = session;
				await writeFile(join(outputDirectory.fsPath, 'process.log'), 'process');
				return true;
			},
		}], undefined, 'archive');

		assert.deepStrictEqual({
			receivedSession,
			agentHost: (await buffer(artifact.resource.fsPath, 'agenthost.log')).toString(),
			process: (await buffer(artifact.resource.fsPath, 'process.log')).toString(),
		}, {
			receivedSession: undefined,
			agentHost: 'agent host',
			process: 'process',
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

		await collector.collect([emptyProvider], URI.parse('test:/session-1'), 'directory');
		await waitForEmptyDirectory(outputRoot);
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

		await collector.collect([emptyProvider], URI.parse('test:/session-1'), 'directory');
		collector.dispose();
		await waitForEmptyDirectory(outputRoot);
	});
});
