/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentPluginManager } from '../../common/agentPluginManager.js';
import { AgentHostCanvasPackagesService, type ICanvasPackageLimits } from '../../node/agentHostCanvasPackagesService.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';
import { canvasPackageCustomization, resolveCanvasPackagePlugins } from '../../node/copilot/copilotCanvasPackages.js';
import { createNoopCustomizationEnablementService } from './testCustomizationEnablementService.js';
import { CustomizationLoadStatus, CustomizationType } from '../../common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../common/state/protocol/channels-session/state.js';
import type { CustomizationEnablementResolution } from '../../node/agentHostCustomizationEnablementService.js';

suite('AgentHostCanvasPackagesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: URI;
	let source: URI;
	let workspace: URI;
	let otherWorkspace: URI;
	let storages: AgentHostStorageService[];
	const limits: ICanvasPackageLimits = { maxFiles: 32, maxBytes: 4096, maxDepth: 8, maxPackages: 8, maxSnapshots: 16 };

	setup(async () => {
		storages = [];
		const path = getRandomTestPath(tmpdir(), 'canvas-package');
		await mkdir(path, { recursive: true });
		root = URI.file(await realpath(path));
		source = URI.joinPath(root, 'source');
		workspace = URI.joinPath(root, 'workspace');
		otherWorkspace = URI.joinPath(root, 'other-workspace');
		for (const directory of [source, workspace, otherWorkspace]) {
			await mkdir(directory.fsPath);
		}
		await writeFile(URI.joinPath(source, 'extension.mjs').fsPath, 'throw new Error("Package preparation must not execute this");');
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":1}');
	});

	teardown(async () => {
		for (const storage of storages) {
			await storage.whenIdle();
		}
		await rm(root.fsPath, { recursive: true, force: true });
	});

	function create(options?: { limits?: ICanvasPackageLimits; writer?: IAgentHostStorageWriter; useDefaultLimits?: boolean }) {
		const log = disposables.add(new NullLogService());
		const storage = disposables.add(new AgentHostStorageService(
			URI.joinPath(root, 'state.json'),
			log,
			options?.writer,
		));
		storages.push(storage);
		const service = disposables.add(new AgentHostCanvasPackagesService(
			upcastPartial<IAgentPluginManager>({ basePath: URI.joinPath(root, 'plugins') }),
			storage,
			log,
			options?.useDefaultLimits ? undefined : options?.limits ?? limits,
		));
		return { service, storage };
	}

	function modulePath(plugin: URI): string {
		return URI.joinPath(plugin, 'com.github.copilot', 'extensions', 'main', 'extension.mjs').fsPath;
	}

	function extensionId(id: string): string {
		return `plugin:canvas-${id.slice(0, 48)}:main`;
	}

	test('prepares an inert revision and requires separate exact-workspace approval', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		const before = await service.getApprovedPluginDirectories(workspace);
		await service.approve(item.id, item.revision, workspace);
		const plugins = await service.getApprovedPluginDirectories(workspace);
		assert.strictEqual(plugins.length, 1);
		const launch = await service.resolveLaunch(extensionId(item.id), modulePath(plugins[0]), workspace);
		assert.ok(launch);
		const manifest = JSON.parse(await readFile(URI.joinPath(plugins[0], '.plugin', 'plugin.json').fsPath, 'utf8'));
		assert.deepStrictEqual({
			before,
			approved: service.isApproved(item.id, item.revision, workspace),
			other: await service.getApprovedPluginDirectories(otherWorkspace),
			remote: service.isApproved(item.id, item.revision, URI.parse('vscode-remote://host/workspace')),
			manifest,
			snapshotBody: await readFile(modulePath(plugins[0]), 'utf8'),
			dataOutsideSnapshot: !launch.dataDirectory.fsPath.startsWith(plugins[0].fsPath),
		}, {
			before: [],
			approved: true,
			other: [],
			remote: false,
			manifest: { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: `canvas-${item.id.slice(0, 48)}` },
			snapshotBody: 'throw new Error("Package preparation must not execute this");',
			dataOutsideSnapshot: true,
		});
	});

	test('source edits create a pending revision without changing the approved code', async () => {
		const { service } = create();
		const first = await service.prepare(source);
		await service.approve(first.id, first.revision, workspace);
		const [approved] = await service.getApprovedPluginDirectories(workspace);
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		const next = await service.prepare(source);
		assert.deepStrictEqual({
			sameId: next.id === first.id,
			changedRevision: next.revision !== first.revision,
			approval: service.list()[0].approval,
			unchangedApprovedPath: (await service.getApprovedPluginDirectories(workspace))[0].toString() === approved.toString(),
			approvedAsset: await readFile(URI.joinPath(approved, 'com.github.copilot', 'extensions', 'main', 'asset.json').fsPath, 'utf8'),
		}, {
			sameId: true,
			changedRevision: true,
			approval: { revision: first.revision, workspaces: [workspace.toString()] },
			unchangedApprovedPath: true,
			approvedAsset: '{"value":1}',
		});
	});

	test('approval of an update replaces the old revision and data location stays stable', async () => {
		const { service } = create();
		const first = await service.prepare(source);
		await service.approve(first.id, first.revision, workspace);
		const [beforePlugin] = await service.getApprovedPluginDirectories(workspace);
		const before = await service.resolveLaunch(extensionId(first.id), modulePath(beforePlugin), workspace);
		assert.ok(before);
		await writeFile(URI.joinPath(before.dataDirectory, 'document.json').fsPath, '{"value":7}');
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		const next = await service.prepare(source);
		await service.approve(next.id, next.revision, workspace);
		const [afterPlugin] = await service.getApprovedPluginDirectories(workspace);
		const after = await service.resolveLaunch(extensionId(next.id), modulePath(afterPlugin), workspace);
		assert.ok(after);
		assert.deepStrictEqual({
			oldApproved: service.isApproved(first.id, first.revision, workspace),
			oldLaunch: await service.resolveLaunch(extensionId(first.id), modulePath(beforePlugin), workspace),
			sameData: after.dataDirectory.toString() === before.dataDirectory.toString(),
			document: await readFile(URI.joinPath(after.dataDirectory, 'document.json').fsPath, 'utf8'),
		}, { oldApproved: false, oldLaunch: undefined, sameData: true, document: '{"value":7}' });
	});

	test('repeated preparation has stable identity and revision', async () => {
		const { service } = create();
		const first = await service.prepare(source);
		const next = await service.prepare(source);
		assert.deepStrictEqual(next, first);
	});

	test('SDK handoff uses the approved snapshot directly and preserves stable customization identity', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const [approved] = await service.getApprovedPluginDirectories(workspace);
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		const updated = await service.prepare(source);
		const plugins = await resolveCanvasPackagePlugins(service, createNoopCustomizationEnablementService(), URI.parse('copilotcli:/session'), workspace);
		assert.deepStrictEqual({
			paths: plugins.map(plugin => plugin.pluginDir?.toString()),
			sources: plugins.map(plugin => plugin.sourceUri?.toString()),
			customization: canvasPackageCustomization(updated),
		}, {
			paths: [approved.toString()],
			sources: [source.toString()],
			customization: { id: `canvas-package:${item.id}`, uri: source.toString(), name: 'source', type: CustomizationType.Plugin, load: { kind: CustomizationLoadStatus.Loaded }, children: [] },
		});
	});

	test('SDK handoff fails closed while enablement is pending and re-resolves scope changes', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		let resolution: CustomizationEnablementResolution = { kind: 'pending', reason: 'session' };
		const scopes: string[] = [];
		const enablement = {
			...createNoopCustomizationEnablementService(),
			resolve: (_session: string, _target: object, launchDirectory?: URI) => {
				scopes.push(launchDirectory?.toString() ?? 'none');
				return resolution;
			},
		};
		const session = URI.parse('copilotcli:/session');
		const pending = await resolveCanvasPackagePlugins(service, enablement, session, workspace);
		resolution = { kind: 'resolved', enabled: false, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }], workingDirectory: { kind: 'directory', uri: workspace } };
		const disabled = await resolveCanvasPackagePlugins(service, enablement, session, workspace);
		resolution = { kind: 'resolved', enabled: true, enablement: [], workingDirectory: { kind: 'directory', uri: workspace } };
		const enabled = await resolveCanvasPackagePlugins(service, enablement, session, workspace);
		await service.revoke(item.id);
		const revoked = await resolveCanvasPackagePlugins(service, enablement, session, workspace);
		assert.deepStrictEqual({
			counts: [pending.length, disabled.length, enabled.length, revoked.length],
			scopes,
		}, { counts: [0, 0, 1, 0], scopes: [workspace.toString(), workspace.toString(), workspace.toString()] });
	});

	test('an approved physical workspace remains eligible through a directory alias', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const alias = URI.joinPath(root, 'workspace-alias');
		await symlink(workspace.fsPath, alias.fsPath, 'junction');
		const snapshots = await service.getApprovedSnapshots(alias);
		const plugins = await resolveCanvasPackagePlugins(service, createNoopCustomizationEnablementService(), URI.parse('copilotcli:/session'), alias);
		assert.deepStrictEqual({ approvedWorkspace: snapshots[0].workspace.toString(), pluginCount: plugins.length }, { approvedWorkspace: workspace.toString(), pluginCount: 1 });
	});

	test('bounds retained snapshots without deleting active revisions or data', async () => {
		const { service } = create({ limits: { ...limits, maxSnapshots: 1 } });
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		const launch = await service.resolveLaunch(extensionId(item.id), modulePath(plugin), workspace);
		assert.ok(launch);
		await writeFile(URI.joinPath(launch.dataDirectory, 'document.json').fsPath, '{"value":7}');
		const repeated = await service.prepare(source);
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		await assert.rejects(service.prepare(source), /retained canvas package snapshots/);
		assert.deepStrictEqual({
			repeatedRevision: repeated.revision,
			currentRevision: service.list()[0].revision,
			approved: service.isApproved(item.id, item.revision, workspace),
			document: await readFile(URI.joinPath(launch.dataDirectory, 'document.json').fsPath, 'utf8'),
			code: await readFile(modulePath(plugin), 'utf8'),
		}, {
			repeatedRevision: item.revision,
			currentRevision: item.revision,
			approved: true,
			document: '{"value":7}',
			code: 'throw new Error("Package preparation must not execute this");',
		});
	});

	test('removed package revisions still count against the snapshot bound', async () => {
		const { service } = create({ limits: { ...limits, maxSnapshots: 1 } });
		const item = await service.prepare(source);
		await service.remove(item.id);
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		await assert.rejects(service.prepare(source), /retained canvas package snapshots/);
		assert.deepStrictEqual(service.list(), []);
	});

	test('the production snapshot budget preserves all 128 revisions and documents when full', async () => {
		const { service } = create({ useDefaultLimits: true });
		const first = await service.prepare(source);
		await service.approve(first.id, first.revision, workspace);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		const launch = await service.resolveLaunch(extensionId(first.id), modulePath(plugin), workspace);
		assert.ok(launch);
		const document = URI.joinPath(launch.dataDirectory, 'document.json');
		await writeFile(document.fsPath, '{"preserved":true}');
		const revisions = new Set([first.revision]);
		for (let index = 1; index < 128; index++) {
			await writeFile(URI.joinPath(source, 'asset.json').fsPath, JSON.stringify({ index }));
			revisions.add((await service.prepare(source)).revision);
		}
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"overflow":true}');
		await assert.rejects(service.prepare(source), /limit of 128 retained canvas package snapshots/);
		assert.deepStrictEqual({
			revisions: revisions.size,
			approved: service.isApproved(first.id, first.revision, workspace),
			firstAsset: await readFile(URI.joinPath(plugin, 'com.github.copilot', 'extensions', 'main', 'asset.json').fsPath, 'utf8'),
			document: await readFile(document.fsPath, 'utf8'),
		}, { revisions: 128, approved: true, firstAsset: '{"value":1}', document: '{"preserved":true}' });
	});

	test('production byte, file and depth overloads never publish a partial package', async () => {
		const { service } = create({ useDefaultLimits: true });
		const oversized = URI.joinPath(source, 'oversized');
		await writeFile(oversized.fsPath, new Uint8Array(16 * 1024 * 1024));
		await assert.rejects(service.prepare(source), /16777216-byte limit/);
		await rm(oversized.fsPath);
		const assets = Array.from({ length: 2048 }, (_, index) => URI.joinPath(source, `asset-${index}`));
		await Promise.all(assets.map(asset => writeFile(asset.fsPath, '')));
		await assert.rejects(service.prepare(source), /2048-file limit/);
		await Promise.all(assets.map(asset => rm(asset.fsPath)));
		const nested = URI.joinPath(source, ...Array.from({ length: 25 }, () => 'nested'));
		await mkdir(nested.fsPath, { recursive: true });
		await assert.rejects(service.prepare(source), /maximum folder depth of 24/);
		assert.deepStrictEqual(service.list(), []);
	});

	test('the production package budget admits 32 packages and refuses a thirty-third', async () => {
		const { service } = create({ useDefaultLimits: true });
		for (let index = 0; index < 32; index++) {
			const folder = URI.joinPath(root, `package-${index}`);
			await mkdir(folder.fsPath);
			await writeFile(URI.joinPath(folder, 'extension.mjs').fsPath, 'export {};');
			await service.prepare(folder);
		}
		await assert.rejects(service.prepare(source), /limit of 32 installed canvas packages/);
		assert.strictEqual(service.list().length, 32);
	});

	test('revocation blocks synchronously and remains revoked after reload', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const revoking = service.revoke(item.id);
		const blockedImmediately = !service.isApproved(item.id, item.revision, workspace);
		await revoking;
		const restored = create().service;
		assert.deepStrictEqual({ blockedImmediately, plugins: await restored.getApprovedPluginDirectories(workspace) }, { blockedImmediately: true, plugins: [] });
	});

	test('a pending approval cannot undo a newer revocation', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		const approving = service.approve(item.id, item.revision, workspace);
		const revoking = service.revoke(item.id);
		await assert.rejects(approving, /Canceled/);
		await revoking;
		assert.strictEqual(service.isApproved(item.id, item.revision, workspace), false);
	});

	test('uninstall leaves documents intact and reinstall reuses stable package identity', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		const launch = await service.resolveLaunch(extensionId(item.id), modulePath(plugin), workspace);
		assert.ok(launch);
		await writeFile(URI.joinPath(launch.dataDirectory, 'document.json').fsPath, 'valuable data');
		await service.remove(item.id);
		const afterRemoval = service.list();
		const again = await service.prepare(source);
		assert.deepStrictEqual({
			afterRemoval,
			sameId: again.id === item.id,
			approved: service.isApproved(item.id, item.revision, workspace),
			data: await readFile(URI.joinPath(launch.dataDirectory, 'document.json').fsPath, 'utf8'),
		}, { afterRemoval: [], sameId: true, approved: false, data: 'valuable data' });
	});

	test('host-wide approval is explicit, while separate workspaces receive separate data folders', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		const first = await service.resolveLaunch(extensionId(item.id), modulePath(plugin), workspace);
		const second = await service.resolveLaunch(extensionId(item.id), modulePath(plugin), otherWorkspace);
		assert.ok(first && second);
		assert.notStrictEqual(first.dataDirectory.toString(), second.dataDirectory.toString());
	});

	test('restored shared-host grants keep their exact persisted scope until explicitly revoked', async () => {
		const { service, storage } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		await service.approve(item.id, item.revision, otherWorkspace);
		const workspaceApproval = service.list()[0].approval;
		await service.approve(item.id, item.revision);
		const records = storage.get('canvasPackages.v1');
		const restored = create().service;
		const restoredApproval = restored.list()[0].approval;
		await restored.approve(item.id, item.revision, workspace);
		const unchangedHostApproval = restored.list()[0].approval;
		const persistedAfterWorkspaceApproval = create().storage.get('canvasPackages.v1');
		await restored.revoke(item.id);
		await restored.approve(item.id, item.revision, workspace);
		const narrowed = create().service;
		assert.deepStrictEqual({
			workspaceApproval,
			restoredApproval,
			unchangedHostApproval,
			persistedAfterWorkspaceApproval,
			narrowedApproval: narrowed.list()[0].approval,
			otherWorkspaceApproved: narrowed.isApproved(item.id, item.revision, otherWorkspace),
		}, {
			workspaceApproval: { revision: item.revision, workspaces: [workspace.toString(), otherWorkspace.toString()] },
			restoredApproval: { revision: item.revision },
			unchangedHostApproval: { revision: item.revision },
			persistedAfterWorkspaceApproval: records,
			narrowedApproval: { revision: item.revision, workspaces: [workspace.toString()] },
			otherWorkspaceApproved: false,
		});
	});

	test('persisted approval is not usable before its write finishes', async () => {
		let block = false;
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const { service } = create({
			writer: {
				mkdir: async () => { },
				writeFile: async () => {
					if (block) {
						void entered.complete();
						await release.p;
					}
				},
			},
		});
		const item = await service.prepare(source);
		block = true;
		const approval = service.approve(item.id, item.revision, workspace);
		await entered.p;
		const before = service.isApproved(item.id, item.revision, workspace);
		await release.complete();
		await approval;
		assert.deepStrictEqual({ before, after: service.isApproved(item.id, item.revision, workspace) }, { before: false, after: true });
	});

	test('changed or added installed files invalidate launch without executing them', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		await writeFile(URI.joinPath(plugin, 'unexpected.mjs').fsPath, 'throw new Error("do not run");');
		await assert.rejects(service.resolveLaunch(extensionId(item.id), modulePath(plugin), workspace), /has changed/);
		assert.strictEqual(service.isApproved(item.id, item.revision, workspace), false);
	});

	test('source symlinks are refused rather than copied or followed', async () => {
		const { service } = create();
		await symlink(otherWorkspace.fsPath, URI.joinPath(source, 'linked').fsPath, 'junction');
		await assert.rejects(service.prepare(source), /symbolic links/);
		assert.deepStrictEqual(service.list(), []);
	});

	test('entrypoint identity, path and scope cannot be substituted', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await service.approve(item.id, item.revision, workspace);
		const [plugin] = await service.getApprovedPluginDirectories(workspace);
		assert.deepStrictEqual([
			await service.resolveLaunch('plugin:foreign:main', modulePath(plugin), workspace),
			await service.resolveLaunch(extensionId(item.id), URI.joinPath(source, 'extension.mjs').fsPath, workspace),
			await service.resolveLaunch(extensionId(item.id), modulePath(plugin), otherWorkspace),
			await service.resolveLaunch(extensionId(item.id), 'relative/extension.mjs', workspace),
		], [undefined, undefined, undefined, undefined]);
	});

	test('a stale reviewed revision cannot approve a newer snapshot', async () => {
		const { service } = create();
		const item = await service.prepare(source);
		await writeFile(URI.joinPath(source, 'asset.json').fsPath, '{"value":2}');
		await service.prepare(source);
		await assert.rejects(service.approve(item.id, item.revision, workspace), /changed after review/);
	});

	test('preparation is bounded and cancellation leaves no installed record', async () => {
		const { service } = create({ limits: { ...limits, maxBytes: 32 } });
		await assert.rejects(service.prepare(source), /byte limit/);
		const cts = disposables.add(new CancellationTokenSource());
		cts.cancel();
		await assert.rejects(create().service.prepare(source, cts.token), /Canceled/);
		assert.deepStrictEqual(service.list(), []);
	});

	test('unknown packages, files, remote folders and missing entrypoints are rejected', async () => {
		const { service } = create();
		await assert.rejects(service.approve('../escape', 'anything'), /no longer installed/);
		await assert.rejects(service.prepare(URI.parse('vscode-remote://host/package')), /local folder/);
		await assert.rejects(service.prepare(URI.joinPath(source, 'extension.mjs')), /not a file/);
		await assert.rejects(service.prepare(otherWorkspace), /containing extension/);
	});

	test('invalid persisted identities isolate package execution without throwing from construction', async () => {
		const { storage } = create();
		const records = [{ id: '../escape', name: 'bad', source: source.toString(), revision: 'a'.repeat(64), fileCount: 1, byteLength: 1 }];
		await storage.setAndFlush('canvasPackages.v1', records);
		const service = disposables.add(new AgentHostCanvasPackagesService(
			upcastPartial<IAgentPluginManager>({ basePath: URI.joinPath(root, 'plugins') }),
			storage,
			disposables.add(new NullLogService()),
		));
		const error = service.unavailableError;
		assert.ok(error);
		assert.throws(() => service.list(), error);
		await assert.rejects(service.prepare(source), error);
		await assert.rejects(service.approve('../escape', 'a'.repeat(64), workspace), error);
		assert.throws(() => service.revoke('../escape'), error);
		assert.throws(() => service.remove('../escape'), error);
		await assert.rejects(service.getApprovedSnapshots(workspace), error);
		await assert.rejects(service.resolveLaunch('extension', '/entrypoint', workspace), error);
		assert.deepStrictEqual({
			supported: service.supported,
			approved: service.isApproved('../escape', 'a'.repeat(64), workspace),
			stored: storage.get('canvasPackages.v1'),
		}, { supported: false, approved: false, stored: records });
	});

	for (const invalid of [
		{ name: 'null registry', records: null },
		{ name: 'non-array registry', records: {} },
		{ name: 'missing fields', records: [{}] },
		{ name: 'invalid approval scope', records: [{ id: 'a'.repeat(64), name: 'bad', source: 'file:///source', revision: 'b'.repeat(64), fileCount: 1, byteLength: 1, approval: { revision: 'b'.repeat(64), workspaces: null } }] },
		{ name: 'non-local source', records: [{ id: 'a'.repeat(64), name: 'bad', source: 'https://example.invalid/source', revision: 'b'.repeat(64), fileCount: 1, byteLength: 1 }] },
		{ name: 'ambiguous workspace URI', records: [{ id: 'a'.repeat(64), name: 'bad', source: 'file:///source', revision: 'b'.repeat(64), fileCount: 1, byteLength: 1, approval: { revision: 'b'.repeat(64), workspaces: ['file:///workspace?different'] } }] },
	]) {
		test(`${invalid.name} is unavailable, not an empty or partly approved registry`, async () => {
			const { storage } = create();
			await storage.setAndFlush('canvasPackages.v1', invalid.records);
			const { service } = create();
			const error = service.unavailableError;
			assert.ok(error);
			const before = await readFile(URI.joinPath(root, 'state.json').fsPath, 'utf8');
			for (const operation of [
				() => service.list(),
				() => service.prepare(source),
				() => service.approve('a'.repeat(64), 'b'.repeat(64)),
				() => service.revoke('a'.repeat(64)),
				() => service.remove('a'.repeat(64)),
				() => service.getApprovedPluginDirectories(workspace),
			]) {
				await assert.rejects(async () => operation(), thrown => thrown === error);
			}
			assert.deepStrictEqual({
				supported: service.supported,
				approved: service.isApproved('a'.repeat(64), 'b'.repeat(64), workspace),
				unchanged: await readFile(URI.joinPath(root, 'state.json').fsPath, 'utf8'),
			}, { supported: false, approved: false, unchanged: before });
		});
	}
});
