/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFile, rename, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isWindows, OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { NullLogService } from '../../../log/common/log.js';
import { SandboxSettingsResolutionHelper } from '../../../sandbox/common/sandboxSettingsResolutionHelper.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { applySessionSandboxPathGrant, parseSessionSandboxPaths, resolveSessionSandboxPaths } from '../../common/sandboxPathGrant.js';
import { AgentHostStorageService, IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';
import { getWorkspaceSandboxScopeId, WorkspaceSandboxPathService } from '../../node/workspaceSandboxPathService.js';

suite('Workspace sandbox path storage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const roots = [URI.file('/project/app'), URI.file('/project/library')];
	let resource: URI;

	setup(async () => {
		resource = URI.file(getRandomTestPath(tmpdir()) + '.json');
		await writeFile(resource.fsPath, '{}', 'utf8');
	});

	teardown(async () => {
		await rm(resource.fsPath, { force: true });
	});

	function create(writer?: IAgentHostStorageWriter) {
		const storage = disposables.add(new AgentHostStorageService(resource, new NullLogService(), writer));
		return { storage, service: new WorkspaceSandboxPathService(storage) };
	}

	test('shares exact folder sets across consumers and restart, not subsets, worktrees or hosts', async () => {
		const { storage, service } = create();
		const changes: string[] = [];
		disposables.add(service.onDidChange(scope => changes.push(scope)));
		await service.grant(roots, { path: '/external/data', access: 'read' });
		storage.set('unrelated', true);
		await storage.whenIdle();
		const sameHost = new WorkspaceSandboxPathService(storage);
		const otherHost = new WorkspaceSandboxPathService(disposables.add(new AgentHostStorageService(undefined, new NullLogService())));
		const expected = { readonlyPaths: ['/external/data'], readwritePaths: [], removedReadonlyPaths: [] };
		assert.deepStrictEqual({
			peer: sameHost.getPaths([roots[1], roots[0], roots[1]]),
			restarted: create().service.getPaths(roots),
			subset: service.getPaths([roots[0]]),
			superset: service.getPaths([...roots, URI.file('/project/extra')]),
			worktree: service.getPaths([URI.file('/project/app.worktrees/feature'), roots[1]]),
			otherHost: otherHost.getPaths(roots),
			changes,
		}, {
			peer: expected,
			restarted: expected,
			subset: undefined,
			superset: undefined,
			worktree: undefined,
			otherHost: undefined,
			changes: [getWorkspaceSandboxScopeId(roots)],
		});
	});

	test('normalizes equivalent folder spellings before deduplicating workspace scopes', async () => {
		const { service } = create();
		const changes: string[] = [];
		disposables.add(service.onDidChange(scope => changes.push(scope)));
		const alternateRoots = [
			roots[1].with({ path: '/project/./library//' }),
			roots[0].with({ path: '/project/app/./' }),
			roots[0],
		];
		await service.grant(alternateRoots, { path: '/external', access: 'read' });
		const restored = create().service.getPaths(roots);
		await service.removeReadonlyPaths(roots, ['/external'], OperatingSystem.Linux);
		const cleaned = create().service.getPaths(alternateRoots);
		await service.clear(alternateRoots);
		assert.deepStrictEqual({
			restored, cleaned,
			cleared: create().service.getPaths(roots),
			changes,
		}, {
			restored: { readonlyPaths: ['/external'], readwritePaths: [], removedReadonlyPaths: [] },
			cleaned: { readonlyPaths: [], readwritePaths: [], removedReadonlyPaths: [] },
			cleared: undefined,
			changes: Array(3).fill(getWorkspaceSandboxScopeId(roots)),
		});
	});

	test('normalizing workspace spellings preserves filesystem roots', async () => {
		const { service } = create();
		const filesystemRoots = isWindows ? [URI.file('C:\\'), URI.file('\\\\server\\share\\')] : [URI.file('/')];
		const restored = [];
		for (const root of filesystemRoots) {
			await service.grant([root.with({ path: `${root.path}./` })], { path: '/external', access: 'read' });
			restored.push(create().service.getPaths([root]));
		}
		assert.deepStrictEqual(restored, filesystemRoots.map(() => ({
			readonlyPaths: ['/external'], readwritePaths: [], removedReadonlyPaths: [],
		})));
	});

	test('keeps parent traversal spellings separate rather than collapsing possible symlinks', async () => {
		const { service } = create();
		const parent = URI.file('/project');
		const traversalRoots = [
			URI.file('/project/link/..'),
			...(isWindows ? [parent.with({ path: '/project/link\\..' })] : []),
		];
		for (const root of traversalRoots) {
			await service.grant([root], { path: '/traversal-only', access: 'read' });
		}
		const parentBeforeGrant = service.getPaths([parent]);
		await service.grant([parent], { path: '/parent-only', access: 'read' });
		const restarted = create().service;
		assert.deepStrictEqual({
			parentBeforeGrant,
			traversal: traversalRoots.map(root => restarted.getPaths([root])),
			parent: restarted.getPaths([parent]),
		}, {
			parentBeforeGrant: undefined,
			traversal: traversalRoots.map(() => ({ readonlyPaths: ['/traversal-only'], readwritePaths: [], removedReadonlyPaths: [] })),
			parent: { readonlyPaths: ['/parent-only'], readwritePaths: [], removedReadonlyPaths: [] },
		});
	});

	test('concurrent grants compose before persistence without losing paths or changing SDK spelling', async () => {
		const { service } = create();
		await Promise.all([
			service.grant(roots, { path: '/external/$literal', access: 'read' }),
			service.grant([...roots].reverse(), { path: '/external/write', persistedPath: '${HOME}/write', access: 'readWrite' }),
			service.grant(roots, { path: '/external/upgrade', access: 'readWrite', removedReadonlyPaths: ['/external/upgrade'] }),
		]);
		assert.deepStrictEqual(create().service.getPaths(roots), {
			readonlyPaths: ['/external/$$literal'],
			readwritePaths: ['${HOME}/write', '/external/upgrade'],
			removedReadonlyPaths: ['/external/upgrade'],
		});
	});

	test('keeps differently cased workspace roots isolated across grants, clear and restart', async () => {
		const { service } = create();
		const upper = [URI.file('/project/App')];
		const lower = [URI.file('/project/app')];
		await service.grant(upper, { path: '/upper-only', access: 'read' });
		const lowerBeforeGrant = service.getPaths(lower);
		await service.grant(lower, { path: '/lower-only', access: 'readWrite' });
		const restarted = create().service;
		const beforeClear = [restarted.getPaths(upper), restarted.getPaths(lower)];
		await service.clear(lower);
		const afterClear = create().service;
		const upperPaths = { readonlyPaths: ['/upper-only'], readwritePaths: [], removedReadonlyPaths: [] };
		assert.deepStrictEqual({
			lowerBeforeGrant,
			beforeClear,
			afterClear: [afterClear.getPaths(upper), afterClear.getPaths(lower)],
		}, {
			lowerBeforeGrant: undefined,
			beforeClear: [upperPaths, { readonlyPaths: [], readwritePaths: ['/lower-only'], removedReadonlyPaths: [] }],
			afterClear: [upperPaths, undefined],
		});
	});

	test('does not reuse legacy workspace grants whose original path casing is unknown', async () => {
		const { storage } = create();
		const key = `agentHost.workspaceSandboxPaths.${getWorkingDirectoryScopeId(roots.map(root => root.toString()))}`;
		storage.set(key, JSON.stringify({ readonlyPaths: ['/legacy'], readwritePaths: [], removedReadonlyPaths: [] }));
		await storage.whenIdle();
		assert.strictEqual(create().service.getPaths(roots), undefined);
	});

	test('pending and failed saves retain live grants and a later save includes them', async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let fail = true;
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async (path, contents) => {
				if (fail) {
					started.complete();
					await release.p;
					throw new Error('test disk failure');
				}
				await writeFile(path, contents, 'utf8');
			},
			rename,
			rm: path => rm(path, { force: true }),
		};
		const { service } = create(writer);
		const save = service.grant(roots, { path: '/external/first', access: 'read' });
		const rejected = assert.rejects(save, /test disk failure/);
		await started.p;
		const pending = service.getPaths(roots);
		const whilePending = create().service.getPaths(roots);
		release.complete();
		await rejected;
		const afterFailure = service.getPaths(roots);
		const coldAfterFailure = create().service.getPaths(roots);
		fail = false;
		await service.grant(roots, { path: '/external/second', access: 'read' });
		const first = { readonlyPaths: ['/external/first'], readwritePaths: [], removedReadonlyPaths: [] };
		assert.deepStrictEqual({
			pending, whilePending, afterFailure, coldAfterFailure,
			recovered: create().service.getPaths(roots),
		}, {
			pending: first, whilePending: undefined, afterFailure: first, coldAfterFailure: undefined,
			recovered: { ...first, readonlyPaths: ['/external/first', '/external/second'] },
		});
	});

	test('read-only cleanup removes only exact OS-normalized additions and survives restart', async () => {
		const { service } = create();
		await service.grant(roots, { path: 'C:\\shared', access: 'read' });
		await service.grant(roots, { path: 'C:\\shared\\child', access: 'read' });
		await service.grant(roots, { path: 'C:\\write', access: 'readWrite', removedReadonlyPaths: ['C:\\inherited'] });
		await service.removeReadonlyPaths(roots, ['C:/shared'], OperatingSystem.Windows);
		assert.deepStrictEqual(create().service.getPaths(roots), {
			readonlyPaths: ['C:\\shared\\child'],
			readwritePaths: ['C:\\write'],
			removedReadonlyPaths: ['C:\\inherited'],
		});
	});

	test('clearing one workspace persists without removing other workspaces or host data', async () => {
		const { storage, service } = create();
		const otherRoots = [URI.file('/other')];
		storage.set('unrelated', { enabled: true });
		await service.grant(roots, { path: '/external/first', access: 'read' });
		await service.grant(otherRoots, { path: '/external/second', access: 'read' });
		const changes: string[] = [];
		disposables.add(service.onDidChange(scope => changes.push(scope)));
		await service.clear(roots);
		const reopened = create();
		assert.deepStrictEqual({
			live: service.getPaths(roots),
			restarted: reopened.service.getPaths(roots),
			other: reopened.service.getPaths(otherRoots),
			unrelated: reopened.storage.get('unrelated'),
			changes,
		}, {
			live: undefined,
			restarted: undefined,
			other: { readonlyPaths: ['/external/second'], readwritePaths: [], removedReadonlyPaths: [] },
			unrelated: { enabled: true },
			changes: [getWorkspaceSandboxScopeId(roots)],
		});
	});

	test('stored workspace deltas compose with Session paths before managed restrictions', async () => {
		const { service } = create();
		await service.grant(roots, { path: '/upgrade', access: 'readWrite', removedReadonlyPaths: ['/upgrade'] });
		await service.grant(roots, { path: '/workspace-read', access: 'read' });
		const base = { readonlyPaths: ['/upgrade', '/keep'], readwritePaths: ['/user-write'], deniedPaths: ['/secret'] };
		const session = applySessionSandboxPathGrant(parseSessionSandboxPaths(undefined), { path: '/session-write', access: 'readWrite' });
		const personal = resolveSessionSandboxPaths(resolveSessionSandboxPaths(base, service.getPaths(roots)!, OperatingSystem.Linux), session, OperatingSystem.Linux);
		const managed = SandboxSettingsResolutionHelper.resolveFileSystemPaths(personal, { readwritePaths: [], readonlyPaths: ['/upgrade'], deniedPaths: ['/managed-secret'] });
		assert.deepStrictEqual({
			personal,
			managed,
			stored: create().service.getPaths(roots),
			base,
		}, {
			personal: { readonlyPaths: ['/keep', '/workspace-read'], readwritePaths: ['/user-write', '/upgrade', '/session-write'], deniedPaths: ['/secret'] },
			managed: { readonlyPaths: ['/upgrade'], readwritePaths: [], deniedPaths: ['/secret', '/managed-secret'] },
			stored: { readonlyPaths: ['/workspace-read'], readwritePaths: ['/upgrade'], removedReadonlyPaths: ['/upgrade'] },
			base: { readonlyPaths: ['/upgrade', '/keep'], readwritePaths: ['/user-write'], deniedPaths: ['/secret'] },
		});
	});

	for (const operation of ['cleanup', 'clear'] as const) {
		test(`failed ${operation} keeps the live removal and a later save persists it`, async () => {
			let fail = false;
			const writer: IAgentHostStorageWriter = {
				mkdir: async () => { },
				writeFile: async (path, contents) => {
					if (fail) {
						throw new Error('test disk failure');
					}
					await writeFile(path, contents, 'utf8');
				},
				rename,
				rm: path => rm(path, { force: true }),
			};
			const { storage, service } = create(writer);
			await service.grant(roots, { path: '/external', access: 'read' });
			fail = true;
			await assert.rejects(operation === 'clear' ? service.clear(roots) : service.removeReadonlyPaths(roots, ['/external'], OperatingSystem.Linux), /test disk failure/);
			const live = new WorkspaceSandboxPathService(storage).getPaths(roots);
			const cold = create().service.getPaths(roots);
			fail = false;
			await service.grant([URI.file('/another-workspace')], { path: '/another-path', access: 'read' });
			const expected = operation === 'clear' ? undefined : { readonlyPaths: [], readwritePaths: [], removedReadonlyPaths: [] };
			assert.deepStrictEqual({ live, cold, recovered: create().service.getPaths(roots) }, {
				live: expected,
				cold: { readonlyPaths: ['/external'], readwritePaths: [], removedReadonlyPaths: [] },
				recovered: expected,
			});
		});
	}

	test('rejects missing or non-filesystem roots and invalid grants without writing', async () => {
		const { service } = create();
		for (const invalidRoots of [[], [URI.parse('https://example.com/project')], [roots[0].with({ query: 'other' })]]) {
			await assert.rejects(service.grant(invalidRoots, { path: '/external', access: 'read' }), /resolved filesystem workspace folders/);
		}
		await assert.rejects(service.grant(roots, { path: '', access: 'read' }), /Invalid workspace sandbox path grant/);
		assert.strictEqual(await readFile(resource.fsPath, 'utf8'), '{}');
	});

	test('malformed persisted grants fail explicitly and are not overwritten by an approval', async () => {
		const { service } = create();
		await service.grant(roots, { path: '/external', access: 'read' });
		const contents: Record<string, string> = JSON.parse(await readFile(resource.fsPath, 'utf8'));
		contents[Object.keys(contents)[0]] = '{"readonlyPaths":false}';
		const corrupt = JSON.stringify(contents);
		await writeFile(resource.fsPath, corrupt);
		const reopened = create().service;
		assert.throws(() => reopened.getPaths(roots), /Invalid persisted workspace sandbox paths/);
		await assert.rejects(reopened.grant(roots, { path: '/new', access: 'read' }), /Invalid persisted workspace sandbox paths/);
		assert.strictEqual(await readFile(resource.fsPath, 'utf8'), corrupt);
	});

	test('a corrupt host store is not mistaken for an empty workspace grant list', async () => {
		await writeFile(resource.fsPath, 'invalid json');
		const { service } = create();
		assert.throws(() => service.getPaths(roots), /Workspace sandbox permissions could not be loaded/);
		await assert.rejects(service.grant(roots, { path: '/external', access: 'read' }), /Workspace sandbox permissions could not be loaded/);
		assert.strictEqual(await readFile(resource.fsPath, 'utf8'), 'invalid json');
	});
});
