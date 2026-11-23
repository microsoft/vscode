/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { link, lstat, mkdir, mkdtemp, open, opendir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import type { Database } from '@vscode/sqlite3';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostDatabase, IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import type { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostWorktreeDiskUsageService, measureWorktreeDiskUsage } from '../../node/worktreeDiskUsage.js';

suite('HostWorktreeDiskUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const databases: AgentHostDatabase[] = [];
	const summaries = new Map<string, SessionSummary>();
	const stateManager = new class extends mock<AgentHostStateManager>() {
		override getSessionSummary(session: string) { return summaries.get(session); }
		override getSurfacedSessionSummary(session: string) { return summaries.get(session); }
	}();
	let root: string;

	setup(async () => {
		summaries.clear();
		root = URI.file(await mkdtemp(join(tmpdir(), 'worktree-disk-usage-'))).fsPath;
	});

	teardown(async () => {
		for (const database of databases.splice(0)) {
			await database.close();
		}
		await rm(root, { recursive: true, force: true });
	});

	function setStatus(session: URI, status: SessionStatus, modifiedAt = 'before'): void {
		summaries.set(session.toString(), {
			resource: session.toString(), provider: 'copilotcli', title: 'Test', status, createdAt: 'before', modifiedAt,
		});
	}

	async function sharedDatabase(worktree: URI, owners: readonly URI[]): Promise<AgentHostDatabase> {
		const path = join(root, 'agent-host.db');
		const database = disposables.add(new AgentHostDatabase(path));
		databases.push(database);
		for (const owner of owners) {
			await database.registerSessionV2(owner.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		}
		const sqlite3 = await import('@vscode/sqlite3');
		const raw = await new Promise<Database>((resolve, reject) => {
			const connection = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(connection));
		});
		try {
			await new Promise<void>((resolve, reject) => raw.run(`INSERT INTO worktree_co_owners (session_uri, worktree_path, repository_root, branch)
				SELECT session_uri, ?, ?, ? FROM sessions_v2`, [worktree.toString(), URI.file(root).toString(), 'main'], error => error ? reject(error) : resolve()));
		} finally {
			await new Promise<void>((resolve, reject) => raw.close(error => error ? reject(error) : resolve()));
		}
		return database;
	}

	test('persists sizes across host restarts and only scans changed sessions', async () => {
		const worktree = URI.file(join(root, 'worktree'));
		await mkdir(worktree.fsPath);
		await writeFile(join(worktree.fsPath, 'file'), 'contents');
		const expectedSize = Number((await lstat(join(worktree.fsPath, 'file'), { bigint: true })).blocks * 512n);
		const databasePath = join(root, 'agent-host.db');
		let database = new AgentHostDatabase(databasePath);
		const session = URI.parse('ahp-session:/cached');
		const other = URI.parse('ahp-session:/other');
		let scans = 0;
		const fileSystem = {
			lstat: (path: string) => lstat(path, { bigint: true }),
			opendir: (path: string) => { scans++; return opendir(path); },
		};
		try {
			for (const resource of [session, other]) {
				await database.registerSessionV2(resource.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			}
			const service = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, database, stateManager));
			const [initial] = await Promise.all([
				service.measure(worktree, CancellationToken.None, session),
				service.measure(worktree, CancellationToken.None, session),
				service.measure(worktree, CancellationToken.None, session),
			]);
			await database.close();
			database = new AgentHostDatabase(databasePath);
			const restarted = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, database, stateManager));
			const restored = await restarted.measure(worktree, CancellationToken.None, session);
			await database.updateSessionModifiedTime(other.toString(), 2);
			await restarted.measure(worktree, CancellationToken.None, session);
			const unchangedScans = scans;
			await database.updateSessionModifiedTime(session.toString(), 2);
			const changed = await restarted.measure(worktree, CancellationToken.None, session);
			await rm(worktree.fsPath, { recursive: true });
			const removed = await restarted.measure(worktree, CancellationToken.None, session);
			assert.deepStrictEqual({ initial, restored, changed, unchangedScans, scans, removed }, {
				initial: expectedSize, restored: expectedSize, changed: expectedSize, unchangedScans: 1, scans: 2, removed: undefined,
			});
		} finally {
			await database.close();
		}
	});

	for (const failure of ['cancelled', 'failed'] as const) {
		test(`does not persist ${failure} measurements`, async () => {
			let writes = 0;
			const cancellation = disposables.add(new CancellationTokenSource());
			const database = new class extends mock<IAgentHostDatabase>() {
				override async readWorktreeCoOwners() { return []; }
				override async getWorktreeDiskUsageRevision() { return 'revision'; }
				override async readWorktreeDiskUsage() { return undefined; }
				override async writeWorktreeDiskUsage() { writes++; }
			}();
			const service = disposables.add(new AgentHostWorktreeDiskUsageService({
				lstat: path => lstat(path, { bigint: true }),
				opendir: async path => {
					if (failure === 'cancelled') {
						cancellation.cancel();
						return opendir(path);
					}
					throw new Error('Cannot read directory');
				},
			}, database, stateManager));
			await assert.rejects(service.measure(URI.file(root), cancellation.token, URI.parse('session:/test')),
				failure === 'cancelled' ? isCancellationError : /Cannot read directory/);
			assert.strictEqual(writes, 0);
		});
	}

	test('does not cache a measurement when the session changes during its scan', async () => {
		let revision = 'before';
		let writes = 0;
		const database = new class extends mock<IAgentHostDatabase>() {
			override async readWorktreeCoOwners() { return []; }
			override async getWorktreeDiskUsageRevision() { return revision; }
			override async readWorktreeDiskUsage() { return undefined; }
			override async writeWorktreeDiskUsage() { writes++; }
		}();
		const service = disposables.add(new AgentHostWorktreeDiskUsageService({
			lstat: path => lstat(path, { bigint: true }),
			opendir: async path => { revision = 'after'; return opendir(path); },
		}, database, stateManager));
		assert.deepStrictEqual({
			size: await service.measure(URI.file(root), CancellationToken.None, URI.parse('session:/test')),
			writes,
		}, { size: 0, writes: 0 });
	});

	test('does not reuse a cached size after deletion and recreation even when the inode is reused', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const session = URI.parse('ahp-session:/recreated');
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		const worktree = URI.file(join(root, 'worktree'));
		await mkdir(worktree.fsPath);
		let scans = 0;
		let generation = 1n;
		const service = disposables.add(new AgentHostWorktreeDiskUsageService({
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				return path === worktree.fsPath ? Object.assign(stat, { ino: 1n, birthtimeNs: generation }) : stat;
			},
			opendir: path => { scans++; return opendir(path); },
		}, database, stateManager));
		await service.measure(worktree, CancellationToken.None, session);
		await rm(worktree.fsPath, { recursive: true });
		generation++;
		await mkdir(worktree.fsPath);
		await writeFile(join(worktree.fsPath, 'new-file'), 'contents');
		const expectedSize = Number((await lstat(join(worktree.fsPath, 'new-file'), { bigint: true })).blocks * 512n);
		setStatus(session, SessionStatus.InProgress);
		const active = await service.measure(worktree, CancellationToken.None, session);
		setStatus(session, SessionStatus.Idle);
		const size = await service.measure(worktree, CancellationToken.None, session);
		assert.deepStrictEqual({ active, size, scans }, { active: expectedSize, size: expectedSize, scans: 3 });
	});

	test('measures live without reading or writing the cache when creation time is unavailable', async () => {
		let scans = 0;
		let reads = 0;
		let writes = 0;
		const database = new class extends mock<IAgentHostDatabase>() {
			override async readWorktreeCoOwners() { return []; }
			override async getWorktreeDiskUsageRevision() { return 'revision'; }
			override async readWorktreeDiskUsage() { reads++; return 42; }
			override async writeWorktreeDiskUsage() { writes++; }
		}();
		const service = disposables.add(new AgentHostWorktreeDiskUsageService({
			lstat: async path => Object.assign(await lstat(path, { bigint: true }), { birthtimeNs: 0n }),
			opendir: path => { scans++; return opendir(path); },
		}, database, stateManager));
		const sizes = [];
		for (let i = 0; i < 2; i++) {
			sizes.push(await service.measure(URI.file(root), CancellationToken.None, URI.parse('session:/test')));
		}
		assert.deepStrictEqual({ sizes, scans, reads, writes }, { sizes: [0, 0], scans: 2, reads: 0, writes: 0 });
	});

	test('shares one cold scan between concurrent co-owners and reuses it after restart', async () => {
		const worktree = URI.file(join(root, 'worktree'));
		await mkdir(worktree.fsPath);
		const owners = [URI.parse('session:/first'), URI.parse('session:/second')];
		const database = await sharedDatabase(worktree, owners);
		let scans = 0;
		const fileSystem = {
			lstat: (path: string) => lstat(path, { bigint: true }),
			opendir: (path: string) => { scans++; return opendir(path); },
		};
		const service = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, database, stateManager));
		const sizes = await Promise.all(owners.map(owner => service.measure(worktree, CancellationToken.None, owner)));
		await database.close();
		const reopened = disposables.add(new AgentHostDatabase(join(root, 'agent-host.db')));
		databases.push(reopened);
		const restarted = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, reopened, stateManager));
		const restored = await restarted.measure(worktree, CancellationToken.None, owners[1]);
		const unchangedScans = scans;
		await reopened.updateSessionModifiedTime(owners[1].toString(), 2);
		const changed = await restarted.measure(worktree, CancellationToken.None, owners[0]);
		assert.deepStrictEqual({ sizes, restored, changed, unchangedScans, scans }, {
			sizes: [0, 0], restored: 0, changed: 0, unchangedScans: 1, scans: 2,
		});
	});

	for (const status of [SessionStatus.InProgress, SessionStatus.InputNeeded]) {
		test(`measures a new worktree on request while an owner has status ${status}`, async () => {
			const worktree = URI.file(join(root, 'worktree'));
			await mkdir(worktree.fsPath);
			const owner = URI.parse('session:/active');
			const database = await sharedDatabase(worktree, [owner]);
			setStatus(owner, status);
			let scans = 0;
			const service = disposables.add(new AgentHostWorktreeDiskUsageService({
				lstat: path => lstat(path, { bigint: true }),
				opendir: path => { scans++; return opendir(path); },
			}, database, stateManager));
			const active = await service.measure(worktree, CancellationToken.None, owner);
			const activeScans = scans;
			setStatus(owner, SessionStatus.Idle);
			const idle = await service.measure(worktree, CancellationToken.None, owner);
			assert.deepStrictEqual({ active, activeScans, idle, scans }, { active: 0, activeScans: 1, idle: 0, scans: 2 });
		});

		test(`refreshes the estimate on request while a co-owner has status ${status}`, async () => {
			const worktree = URI.file(join(root, 'worktree'));
			await mkdir(worktree.fsPath);
			const owners = [URI.parse('session:/idle'), URI.parse('session:/active')];
			const database = await sharedDatabase(worktree, owners);
			setStatus(owners[0], SessionStatus.Idle);
			setStatus(owners[1], SessionStatus.Idle);
			let scans = 0;
			const service = disposables.add(new AgentHostWorktreeDiskUsageService({
				lstat: path => lstat(path, { bigint: true }),
				opendir: path => { scans++; return opendir(path); },
			}, database, stateManager));
			await service.measure(worktree, CancellationToken.None, owners[0]);
			setStatus(owners[1], status);
			const sizes = [];
			const expectedSizes = [];
			for (const bytes of [8192, 16384]) {
				await writeFile(join(worktree.fsPath, 'file'), Buffer.alloc(bytes, 1));
				expectedSizes.push(Number((await lstat(join(worktree.fsPath, 'file'), { bigint: true })).blocks * 512n));
				sizes.push(await service.measure(worktree, CancellationToken.None, owners[0]));
			}
			const active = await service.measure(worktree, CancellationToken.None, owners[1]);
			const activeScans = scans;
			const expected = Number((await lstat(join(worktree.fsPath, 'file'), { bigint: true })).blocks * 512n);
			setStatus(owners[1], SessionStatus.Idle);
			const idle = await service.measure(worktree, CancellationToken.None, owners[0]);
			await service.measure(worktree, CancellationToken.None, owners[1]);
			assert.deepStrictEqual({ sizes, active, idle, activeScans, scans }, { sizes: expectedSizes, active: expected, idle: expected, activeScans: 4, scans: 5 });
		});
	}

	test('refreshes the active worktree on request while unchanged idle worktrees reuse the database after restart', async () => {
		const worktrees = [URI.file(join(root, 'first')), URI.file(join(root, 'second'))];
		const owners = [URI.parse('session:/first'), URI.parse('session:/second')];
		const path = join(root, 'agent-host.db');
		const database = disposables.add(new AgentHostDatabase(path));
		databases.push(database);
		for (let i = 0; i < owners.length; i++) {
			await mkdir(worktrees[i].fsPath);
			await database.registerSessionV2(owners[i].toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			setStatus(owners[i], SessionStatus.Idle);
		}
		const scans = [0, 0];
		const fileSystem = {
			lstat: (path: string) => lstat(path, { bigint: true }),
			opendir: (path: string) => { scans[worktrees.findIndex(worktree => worktree.fsPath === path)]++; return opendir(path); },
		};
		const service = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, database, stateManager));
		for (let i = 0; i < owners.length; i++) {
			await service.measure(worktrees[i], CancellationToken.None, owners[i]);
		}
		setStatus(owners[0], SessionStatus.InProgress);
		await writeFile(join(worktrees[0].fsPath, 'new-file'), 'changed');
		await database.updateSessionModifiedTime(owners[0].toString(), 2);
		const active = await service.measure(worktrees[0], CancellationToken.None, owners[0]);
		await database.close();
		const reopened = disposables.add(new AgentHostDatabase(path));
		databases.push(reopened);
		const restarted = disposables.add(new AgentHostWorktreeDiskUsageService(fileSystem, reopened, stateManager));
		setStatus(owners[0], SessionStatus.Idle);
		const expected = Number((await lstat(join(worktrees[0].fsPath, 'new-file'), { bigint: true })).blocks * 512n);
		for (let refresh = 0; refresh < 2; refresh++) {
			for (let i = 0; i < owners.length; i++) {
				await restarted.measure(worktrees[i], CancellationToken.None, owners[i]);
			}
		}
		assert.deepStrictEqual({ active, scans }, { active: expected, scans: [3, 1] });
	});

	for (const status of [SessionStatus.InProgress, SessionStatus.Idle]) {
		test(`does not save a scan when co-owner activity changes during measurement to status ${status}`, async () => {
			const worktree = URI.file(join(root, 'worktree'));
			await mkdir(worktree.fsPath);
			const owners = [URI.parse('session:/idle'), URI.parse('session:/changing')];
			const database = await sharedDatabase(worktree, owners);
			setStatus(owners[1], SessionStatus.Idle);
			let scans = 0;
			const service = disposables.add(new AgentHostWorktreeDiskUsageService({
				lstat: path => lstat(path, { bigint: true }),
				opendir: path => {
					if (++scans === 1) {
						setStatus(owners[1], status, 'after');
					}
					return opendir(path);
				},
			}, database, stateManager));
			const first = await service.measure(worktree, CancellationToken.None, owners[0]);
			setStatus(owners[1], SessionStatus.Idle, 'after');
			const second = await service.measure(worktree, CancellationToken.None, owners[0]);
			const cached = await service.measure(worktree, CancellationToken.None, owners[1]);
			assert.deepStrictEqual({ first, second, cached, scans }, { first: 0, second: 0, cached: 0, scans: 2 });
		});
	}

	test('scans instead of reusing or saving the cache if the owner starts work during lookup', async () => {
		const session = URI.parse('session:/changing');
		let invalidations = 0;
		let writes = 0;
		let scans = 0;
		const database = new class extends mock<IAgentHostDatabase>() {
			override async readWorktreeCoOwners() { return []; }
			override async getWorktreeDiskUsageRevision() { return 'revision'; }
			override async readWorktreeDiskUsage() {
				setStatus(session, SessionStatus.InProgress);
				return 42;
			}
			override async deleteWorktreeDiskUsage() { invalidations++; }
			override async writeWorktreeDiskUsage() { writes++; }
		}();
		const service = disposables.add(new AgentHostWorktreeDiskUsageService({
			lstat: path => lstat(path, { bigint: true }),
			opendir: async path => { scans++; return opendir(path); },
		}, database, stateManager));
		const size = await service.measure(URI.file(root), CancellationToken.None, session);
		assert.deepStrictEqual({ size, invalidations, writes, scans }, { size: 0, invalidations: 1, writes: 0, scans: 1 });
	});

	test('sums allocated bytes including dependencies without following directory symlinks', async () => {
		await mkdir(join(root, 'node_modules'));
		await writeFile(join(root, 'README.md'), '12345');
		await writeFile(join(root, 'node_modules', 'package.json'), '1234567890');
		await symlink(root, join(root, 'node_modules', 'cycle'), 'junction');

		const stats = await Promise.all(['README.md', 'node_modules/package.json'].map(path => lstat(join(root, path), { bigint: true })));
		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(stats.reduce((total, stat) => total + stat.blocks * 512n, 0n)));
	});

	test('counts sparse-file allocation rather than apparent size', async () => {
		const path = join(root, 'sparse');
		const file = await open(path, 'w');
		try {
			await file.truncate(64 * 1024 * 1024);
		} finally {
			await file.close();
		}
		const stat = await lstat(path, { bigint: true });
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None);
		assert.strictEqual(size, Number(stat.blocks * 512n));
		if (!isWindows) {
			assert.ok(stat.blocks * 512n < stat.size);
		}
	});

	test('measures asar files and directories as ordinary filesystem entries', async () => {
		await mkdir(join(root, 'directory.asar'));
		await writeFile(join(root, 'directory.asar', 'file'), 'data');
		await writeFile(join(root, 'file.asar'), 'not an asar archive');

		// Run with the host bootstrap's ASAR-unaware fs mapping, which the test renderer does not install.
		await promisify(execFile)(process.execPath, [
			'--import', new URL('../../../../../bootstrap-esm.js', import.meta.url).href,
			'--input-type=module',
			'--eval', `
				import assert from 'assert';
				import { promises as fs } from 'fs';
				import { CancellationToken } from ${JSON.stringify(new URL('../../../../base/common/cancellation.js', import.meta.url).href)};
				import { URI } from ${JSON.stringify(new URL('../../../../base/common/uri.js', import.meta.url).href)};
				import { measureWorktreeDiskUsage } from ${JSON.stringify(new URL('../../node/worktreeDiskUsage.js', import.meta.url).href)};

				const root = ${JSON.stringify(root)};
				try {
					const paths = [root + '/directory.asar/file', root + '/file.asar'];
					const stats = await Promise.all(paths.map(path => fs.lstat(path, { bigint: true })));
					assert.deepStrictEqual(await Promise.all([root, root + '/directory.asar'].map(path =>
						measureWorktreeDiskUsage(URI.file(path), CancellationToken.None)
					)), [
						Number(stats.reduce((total, stat) => total + stat.blocks * 512n, 0n)),
						Number(stats[0].blocks * 512n),
					]);
				} finally {
					await fs.rm(root, { recursive: true, force: true });
				}
			`,
		], { env: { ...process.env, ELECTRON_RUN_AS_NODE: process.versions.electron ? '1' : undefined, VSCODE_DEV: '1' } });
	});

	test('counts internal hard links once and excludes links outside the measured worktree', async () => {
		await mkdir(join(root, 'nested'));
		await writeFile(join(root, 'original'), 'data'.repeat(2048));
		await link(join(root, 'original'), join(root, 'nested', 'linked'));
		const stat = await lstat(join(root, 'original'), { bigint: true });

		assert.deepStrictEqual(await Promise.all([root, join(root, 'nested')].map(path =>
			measureWorktreeDiskUsage(URI.file(path), CancellationToken.None)
		)), [Number(stat.blocks * 512n), 0]);
	});

	test('tracks hard links across file-stat batches', async () => {
		await writeFile(join(root, 'original'), 'data'.repeat(2048));
		await Promise.all(Array.from({ length: 24 }, (_, index) => link(join(root, 'original'), join(root, `linked-${index}`))));
		const stat = await lstat(join(root, 'original'), { bigint: true });

		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(stat.blocks * 512n));
	});

	test('preserves distinct 64-bit file identities when accounting for hard links', async () => {
		await Promise.all(['a', 'b', 'c', 'd'].map(name => writeFile(join(root, name), 'data')));
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path !== root) {
					const first = path.endsWith('a') || path.endsWith('b');
					Object.assign(stat, { ino: 2n ** 53n + (first ? 0n : 1n), nlink: 2n, blocks: first ? 1n : 2n });
				}
				return stat;
			},
		});

		assert.strictEqual(size, 1536);
	});

	test('does not traverse nested filesystems or count files on another volume', async () => {
		await mkdir(join(root, 'mounted'));
		await writeFile(join(root, 'mounted', 'file'), 'data');
		await writeFile(join(root, 'other-volume-file'), 'data');
		await writeFile(join(root, 'local'), 'data');
		const opened: string[] = [];
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir: async path => {
				opened.push(path);
				return opendir(path);
			},
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path === join(root, 'mounted') || path === join(root, 'other-volume-file')) {
					stat.dev++;
				}
				stat.blocks = 1n;
				return stat;
			},
		});

		assert.deepStrictEqual({ size, opened }, { size: 512, opened: [root] });
	});

	test('does not fall back to logical bytes when allocated blocks are zero', async () => {
		await writeFile(join(root, 'file'), 'data');
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => Object.assign(await lstat(path, { bigint: true }), { blocks: 0n }),
		});

		assert.strictEqual(size, 0);
	});

	test('rejects unavailable allocation metadata and unsafe byte totals', async () => {
		await writeFile(join(root, 'file'), 'data');
		for (const blocks of [-1n, 2n ** 53n]) {
			await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
				opendir,
				lstat: async path => Object.assign(await lstat(path, { bigint: true }), { blocks }),
			}), blocks < 0n ? /Allocated file size is unavailable/ : /exceeds the supported byte range/);
		}
	});

	test('returns undefined for missing roots, files and symlink roots', async () => {
		await writeFile(join(root, 'file'), 'data');
		await symlink(root, join(root, 'link'), 'junction');
		assert.deepStrictEqual(await Promise.all(['missing', 'file', 'link'].map(name =>
			measureWorktreeDiskUsage(URI.file(join(root, name)), CancellationToken.None)
		)), [undefined, undefined, undefined]);
	});

	test('bounds file stat concurrency to eight and stops scheduling after cancellation', async () => {
		await Promise.all(Array.from({ length: 25 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		const cancellation = disposables.add(new CancellationTokenSource());
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		let active = 0;
		let maximum = 0;
		let fileStats = 0;
		const measurement = measureWorktreeDiskUsage(URI.file(root), cancellation.token, {
			opendir,
			lstat: async path => {
				if (path === root) {
					return lstat(path, { bigint: true });
				}
				fileStats++;
				active++;
				maximum = Math.max(maximum, active);
				if (active === 8) {
					saturated.complete();
				}
				await gate.p;
				try {
					return await lstat(path, { bigint: true });
				} finally {
					active--;
				}
			},
		});
		await saturated.p;
		cancellation.cancel();
		gate.complete();
		await assert.rejects(measurement, isCancellationError);
		assert.deepStrictEqual({ maximum, fileStats, active }, { maximum: 8, fileStats: 8, active: 0 });
	});

	test('sums more than one batch of file stats', async () => {
		await Promise.all(Array.from({ length: 25 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		const stat = await lstat(join(root, '0'), { bigint: true });
		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(25n * stat.blocks * 512n));
	});

	test('drains sibling file stats before propagating a batch failure', async () => {
		await Promise.all(Array.from({ length: 9 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		const denied = new Error('permission denied');
		let fileStats = 0;
		let active = 0;
		let settled = false;
		const measurement = measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => {
				if (path === root) {
					return lstat(path, { bigint: true });
				}
				fileStats++;
				if (fileStats === 1) {
					throw denied;
				}
				active++;
				if (fileStats === 8) {
					saturated.complete();
				}
				await gate.p;
				try {
					return await lstat(path, { bigint: true });
				} finally {
					active--;
				}
			},
		});
		const completed = measurement.then(() => { settled = true; }, () => { settled = true; });
		await saturated.p;
		await timeout(10);
		const beforeRelease = { settled, active, fileStats };
		gate.complete();
		await assert.rejects(measurement, error => error === denied);
		await completed;
		assert.deepStrictEqual({ beforeRelease, active, fileStats }, {
			beforeRelease: { settled: false, active: 7, fileStats: 8 }, active: 0, fileStats: 8,
		});
	});

	test('does not start I/O when already cancelled', async () => {
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.Cancelled), isCancellationError);
	});

	test('does not open a nested directory after cancellation during its volume check', async () => {
		await mkdir(join(root, 'nested'));
		const cancellation = disposables.add(new CancellationTokenSource());
		const opened: string[] = [];
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), cancellation.token, {
			opendir: async path => {
				opened.push(path);
				return opendir(path);
			},
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path !== root) {
					cancellation.cancel();
				}
				return stat;
			},
		}), isCancellationError);
		assert.deepStrictEqual(opened, [root]);
	});

	test('surfaces filesystem failures instead of returning a partial size', async () => {
		const denied = new Error('permission denied');
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async () => { throw denied; },
		}), error => error === denied);
	});
});
