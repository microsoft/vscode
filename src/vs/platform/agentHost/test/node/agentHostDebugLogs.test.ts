/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomBytes } from 'crypto';
import { mkdtemp, mkdir, readdir, rm, truncate, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { URI } from '../../../../base/common/uri.js';
import { join } from '../../../../base/common/path.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { buffer } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDebugLogsCollector } from '../../node/agentHostDebugLogs.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES } from '../../common/agentService.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../common/missionControlEnvironment.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';

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
		// The collector's disposal cleans retained artifacts without awaiting
		// (`dispose` is synchronous), and that teardown runs first. So this
		// delete can race a still-running recursive delete of the same tree,
		// which Windows reports as `EPERM` on `rmdir`. `maxRetries` is Node's
		// built-in backoff for exactly those errors.
		await rm(testRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	test('creates a flat archive from provider and host logs', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		const session = URI.parse('test:/session-1');
		const chat = URI.parse(buildChatUri(session, 'peer-1'));
		let collectedTarget: { session: string | undefined; chat: string | undefined } | undefined;
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		await writeFile(join(logsHome, 'agenthost.log'), 'agent host');
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const result = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (session, outputDirectory, chat) => {
				collectedTarget = { session: session?.toString(), chat: chat?.toString() };
				await writeFile(join(outputDirectory.fsPath, 'events.jsonl'), 'event');
				return true;
			},
		}], session, 'archive', chat);

		assert.deepStrictEqual({
			kind: result.kind,
			providerLogsIncluded: result.providerLogsIncluded,
			collectedTarget,
			sizesArePositive: result.size > 0 && result.uncompressedSize > 0,
			events: (await buffer(result.resource.fsPath, 'events.jsonl')).toString(),
			agentHost: (await buffer(result.resource.fsPath, 'agenthost.log')).toString(),
		}, {
			kind: 'archive',
			providerLogsIncluded: true,
			collectedTarget: { session: session.toString(), chat: chat.toString() },
			sizesArePositive: true,
			events: 'event',
			agentHost: 'agent host',
		});
	});

	test('collects a directory artifact larger than the previous 256 MiB limit', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		const largeLogSize = 300 * 1024 * 1024;
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const result = await collector.collect([{
			id: 'test',
			collectDebugLogs: async (_session, outputDirectory) => {
				const largeLog = join(outputDirectory.fsPath, 'large.log');
				await writeFile(largeLog, '');
				await truncate(largeLog, largeLogSize);
				return true;
			},
		}], URI.parse('test:/session-1'), 'directory');

		assert.deepStrictEqual({
			size: result.size,
			uncompressedSize: result.uncompressedSize,
			entries: result.entries,
		}, {
			size: largeLogSize,
			uncompressedSize: largeLogSize,
			entries: [{ path: 'large.log', size: largeLogSize }],
		});
		await collector.cleanup();
	});

	for (const kind of ['archive', 'directory'] as const) {
		test(`includes rotated Mission Control request and error logs in a session ${kind} export`, async () => {
			const logsHome = URI.file(join(testRoot, 'logs'));
			const log = new NullLogService();
			const files = disposables.add(new FileService(log));
			disposables.add(files.registerProvider('file', disposables.add(new DiskFileSystemProvider(log))));
			const logger = disposables.add(new AhpJsonlLogger({
				logsHome, logId: MISSION_CONTROL_AHP_LOG_ID, connectionId: 'mobile-client', transport: 'mission-control', maxFileSizeBytes: 1,
			}, files, log));
			const first = logger.resource;
			const request = { jsonrpc: '2.0', id: 7, method: 'authenticate', params: { resource: 'https://api.github.com', token: 'private-token' } };
			const response = { jsonrpc: '2.0', id: 7, error: { code: -32603, message: 'ENOENT: no such file or directory, realpath \'/missing/worktree\'' } };
			logger.log(request, 'c2s');
			logger.log(response, 's2c');
			await logger.flush();
			const collector = disposables.add(new AgentHostDebugLogsCollector({
				logsHome, tmpDir: URI.file(join(testRoot, 'tmp')),
			}, log));
			const artifact = await collector.collect([emptyProvider], URI.parse('copilotcli:/shared-session'), kind);
			const names = artifact.entries.map(entry => entry.path).sort();
			const contents = await Promise.all(names.map(async name => kind === 'archive'
				? (await buffer(artifact.resource.fsPath, name)).toString()
				: (await files.readFile(joinPath(artifact.resource, name))).value.toString()));
			const records = contents.flatMap(content => content.trim().split('\n').map(line => JSON.parse(line)))
				.sort((a, b) => a._ahpLog.dir.localeCompare(b._ahpLog.dir));
			assert.deepStrictEqual({
				names,
				records: records.map(entry => {
					const { _ahpLog, ...message } = entry;
					return { message, dir: _ahpLog.dir, connectionId: _ahpLog.connectionId, transport: _ahpLog.transport };
				}),
				containsCredential: contents.some(content => content.includes('private-token')),
			}, {
				names: [first, logger.resource].map(resource => `ahp/mission-control/${basename(resource)}`).sort(),
				records: [
					{ message: { ...request, params: { ...request.params, token: '<redacted>' } }, dir: 'c2s', connectionId: 'mobile-client', transport: 'mission-control' },
					{ message: response, dir: 's2c', connectionId: 'mobile-client', transport: 'mission-control' },
				],
				containsCredential: false,
			});
			await collector.cleanup();
		});
	}

	test('bounds Mission Control history by modification time and excludes unrelated logs and directories', async () => {
		const logsHome = join(testRoot, 'logs');
		const ahp = join(logsHome, 'ahp');
		await mkdir(ahp, { recursive: true });
		const hash = new StringSHA1();
		hash.update(MISSION_CONTROL_AHP_LOG_ID);
		const prefix = `ahp-${hash.digest()}-`;
		const names: string[] = [];
		for (let index = 0; index < 12; index++) {
			const name = `${prefix}client-${index}.jsonl`;
			names.push(name);
			const path = join(ahp, name);
			await writeFile(path, '{}\n');
			await utimes(path, 1000 + index, 1000 + index);
		}
		await mkdir(join(ahp, `${prefix}directory.jsonl`));
		await writeFile(join(ahp, 'unrelated.jsonl'), '{}\n');
		await writeFile(join(ahp, `${prefix}not-jsonl.log`), 'not a wire log');
		const warnings: string[] = [];
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome), tmpDir: URI.file(join(testRoot, 'tmp')),
		}, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}()));
		const artifact = await collector.collect([emptyProvider], undefined, 'directory');
		assert.deepStrictEqual({ paths: artifact.entries.map(entry => entry.path).sort(), warnings }, {
			paths: names.slice(2).map(name => `ahp/mission-control/${name}`).sort(),
			warnings: ['[AgentHostDebugLogs] Omitted 2 Mission Control AHP files; exporting the 10 most recent files'],
		});
		await collector.cleanup();
	});

	for (const entryCount of [990, 991, 999, 1000]) {
		test(`fits optional Mission Control logs in the remaining budget after ${entryCount} prior files`, async () => {
			const logsHome = join(testRoot, 'logs');
			const ahp = join(logsHome, 'ahp');
			await mkdir(ahp, { recursive: true });
			await writeFile(join(logsHome, 'agenthost.log'), 'host');
			const hash = new StringSHA1();
			hash.update(MISSION_CONTROL_AHP_LOG_ID);
			for (let index = 0; index < 10; index++) {
				await writeFile(join(ahp, `ahp-${hash.digest()}-client-${index}.jsonl`), '{}\n');
			}
			const warnings: string[] = [];
			const collector = disposables.add(new AgentHostDebugLogsCollector({
				logsHome: URI.file(logsHome), tmpDir: URI.file(join(testRoot, 'tmp')),
			}, new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}()));
			const artifact = await collector.collect([{
				id: 'test',
				collectDebugLogs: async (_session, output) => {
					const nested = join(output.fsPath, 'provider');
					await mkdir(nested);
					await Promise.all(Array.from({ length: entryCount - 1 }, (_, index) =>
						writeFile(join(nested, `${index}.log`), 'provider')));
					return true;
				},
			}], URI.parse('copilotcli:/shared-session'), 'directory');
			const included = 1000 - entryCount;
			assert.deepStrictEqual({
				count: artifact.entries.length,
				providerCount: artifact.entries.filter(entry => entry.path.startsWith('provider/')).length,
				missionControlCount: artifact.entries.filter(entry => entry.path.startsWith('ahp/mission-control/')).length,
				warnings,
			}, {
				count: 1000, providerCount: entryCount - 1, missionControlCount: included,
				warnings: included < 10 ? [`[AgentHostDebugLogs] Omitted ${10 - included} Mission Control AHP files; exporting the ${included} most recent files`] : [],
			});
			await collector.cleanup();
		});
	}

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

	test('accepts a large compressible archive', async () => {
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
				// Highly compressible, like real log text.
				for (let i = 0; i < 3; i++) {
					await writeFile(join(outputDirectory.fsPath, `big-${i}.log`), Buffer.alloc(8 * 1024 * 1024));
				}
				return true;
			},
		}], URI.parse('test:/session-1'), 'archive');

		assert.deepStrictEqual({
			uncompressedSize: result.uncompressedSize,
			archiveUnderLimit: result.size < result.uncompressedSize,
		}, {
			uncompressedSize: 24 * 1024 * 1024,
			archiveUnderLimit: true,
		});
	});

	test('preserves provider logs larger than 10 MiB', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const head = Buffer.alloc(12 * 1024 * 1024, 'A');
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
			size: kept.length,
			keptTheTail: kept.subarray(kept.length - tail.length).toString(),
		}, {
			size: head.length + tail.length,
			keptTheTail: 'THE-INTERESTING-END',
		});
	});

	test('includes all rotated Agent Host process logs', async () => {
		const logsHome = join(testRoot, 'logs');
		const outputRoot = join(testRoot, 'tmp');
		await mkdir(logsHome, { recursive: true });
		await mkdir(outputRoot, { recursive: true });
		await writeFile(join(logsHome, 'agenthost.log'), 'current');
		await writeFile(join(logsHome, 'agenthost.1.log'), 'previous');
		await writeFile(join(logsHome, 'agenthost.5.log'), 'oldest');
		await writeFile(join(logsHome, 'agenthost-server.log'), 'server current');
		await writeFile(join(logsHome, 'agenthost-server.1.log'), 'server previous');
		await writeFile(join(logsHome, 'agenthost.old.log'), 'not a rotated log');
		const collector = disposables.add(new AgentHostDebugLogsCollector({
			logsHome: URI.file(logsHome),
			tmpDir: URI.file(outputRoot),
		}, new NullLogService()));

		const artifact = await collector.collect([emptyProvider], URI.parse('test:/session-1'), 'archive');

		assert.deepStrictEqual({
			paths: artifact.entries.map(entry => entry.path).sort(),
			current: (await buffer(artifact.resource.fsPath, 'agenthost.log')).toString(),
			previous: (await buffer(artifact.resource.fsPath, 'agenthost.1.log')).toString(),
			oldest: (await buffer(artifact.resource.fsPath, 'agenthost.5.log')).toString(),
			serverCurrent: (await buffer(artifact.resource.fsPath, 'agenthost-server.log')).toString(),
			serverPrevious: (await buffer(artifact.resource.fsPath, 'agenthost-server.1.log')).toString(),
		}, {
			paths: ['agenthost-server.1.log', 'agenthost-server.log', 'agenthost.1.log', 'agenthost.5.log', 'agenthost.log'],
			current: 'current',
			previous: 'previous',
			oldest: 'oldest',
			serverCurrent: 'server current',
			serverPrevious: 'server previous',
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
