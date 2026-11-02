/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { spy, stub } from 'sinon';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DeferredPromise, Promises, timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname, join } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../common/agentHostChangesetOperationService.js';
import { buildSessionChangesetUri, buildTurnChangesetUri, buildWorkingSetChangesetUri } from '../../common/changesetUri.js';
import { NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { ChangesetOperationTargetKind } from '../../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, FileEditKind, SessionStatus, type TextRange } from '../../common/state/sessionState.js';
import { AgentHostAcceptChangesOperationHandler } from '../../node/agentHostAcceptChangesOperationHandler.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import { AgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { AgentHostFileEditRevert } from '../../node/agentHostFileEditRevert.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { getFileEditPathKey, isFileEditPath } from '../../node/fileEditIdentity.js';
import { SessionDbResourceProvider } from '../../node/resourceProviders/sessionDbResourceProvider.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeWorkingSetFiles } from '../../node/sessionDiffAggregator.js';
import { NullEditArcReporterService } from '../../node/shared/editArcReporter.js';
import { NullEditSurvivalReporterFactory } from '../../node/shared/editSurvivalReporter.js';
import { FileEditTracker } from '../../node/shared/fileEditTracker.js';
import { createNoopChangesetService, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';
import { chatTurnComplete, chatTurnStarted } from '../common/chatActionBuilders.js';

const SESSION = 'agent:/file-identity';

suite('Agent Host file edit identity', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(caseSensitiveProvider = false) {
		const directory = await fs.mkdtemp(join(tmpdir(), 'agent-host-file-identity-'));
		const root = join(directory, 'repo');
		const store = disposables.add(new DisposableStore());
		const log = new NullLogService();
		const fileService = store.add(new FileService(log));
		store.add(fileService.registerProvider(Schemas.file, caseSensitiveProvider ? store.add(new InMemoryFileSystemProvider()) : store.add(new DiskFileSystemProvider(log))));
		const coordinator = store.add(new AgentHostFileEditCoordinator(fileService));
		store.add(coordinator.registerCoordinatedProvider('copilotcli'));
		const diffService = new InProcessDiffComputeService();
		const databasePath = join(directory, 'session.db');
		let db = store.add(await SessionDatabase.open(databasePath, undefined, coordinator.uriIdentity));
		const stateManager = store.add(new AgentHostStateManager(log));
		const chat = buildDefaultChatUri(SESSION);
		const workingDirectories = [URI.file(root).toString()];
		stateManager.createSession({
			resource: SESSION, provider: 'copilotcli', title: 'Identity',
			status: SessionStatus.Idle, createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString(),
			workingDirectories, defaultChat: chat,
		});
		const changesets = createNoopChangesetService();
		changesets.openTrackedSessionDatabases = () => ({
			sources: [{ chat, storage: SESSION, db }], otherChatDatabases: [],
			workingDirectories, folderScope: [URI.file(root)], dispose: () => { },
		});
		changesets.openTrackedTurnDatabase = () => ({ db, folderScope: [URI.file(root)], otherChatDatabases: [], dispose: () => { } });
		const keep = new AgentHostAcceptChangesOperationHandler(log, stateManager, changesets, diffService, coordinator);
		const undo = new AgentHostDiscardChangesOperationHandler(
			session => stateManager.getSessionState(session), async () => { },
			new AgentHostFileEditRevert(fileService, diffService), createNoopGitService(),
			fileService, log, stateManager, changesets, diffService, coordinator,
		);
		const createTracker = () => store.add(new FileEditTracker(
			SESSION, () => SESSION, 'copilotcli', createSessionDataService(db), fileService, log, diffService,
			new NullEditSurvivalReporterFactory(), new NullAgentEditAttributionService(), new NullEditArcReporterService(), coordinator,
		));
		let tracker = createTracker();
		const workingSet = () => computeWorkingSetFiles([{ sessionUri: SESSION, db }], diffService);
		return {
			root, coordinator, fileService, keep, undo, stateManager, chat, diffService,
			get db() { return db; },
			get tracker() { return tracker; },
			workingSet,
			async edit(path: string, toolCallId: string, content: string) {
				await fileService.createFolder(URI.file(dirname(path)));
				await tracker.trackEditStart(path);
				await fileService.writeFile(URI.file(path), VSBuffer.fromString(content));
				await tracker.completeEdit(path);
				await tracker.takeCompletedEdit('turn', toolCallId, path, 'edit', undefined, 'model', false);
			},
			async resume() {
				tracker.dispose();
				await db.close();
				db = store.add(await SessionDatabase.open(databasePath, undefined, coordinator.uriIdentity));
				tracker = createTracker();
			},
			async contents() {
				const provider = new SessionDbResourceProvider(createSessionDataService(db), diffService);
				return Promise.all((await workingSet()).map(async ({ diff, nonce }) => ({
					resource: diff.after?.uri ?? diff.before?.uri,
					before: diff.before && (await provider.read(URI.parse(diff.before.content.uri))).data,
					after: diff.after && (await provider.read(URI.parse(diff.after.content.uri))).data,
					nonce,
				})));
			},
			async decide(operation: 'keep' | 'undo', path: string, range?: TextRange, token = CancellationToken.None) {
				const files = await workingSet();
				const file = files.find(file => isFileEditPath(path, URI.parse((file.diff.after ?? file.diff.before)!.uri), db.fileEditUriIdentity));
				assert.ok(file, 'the decision must target a published file');
				return (operation === 'keep' ? keep : undo).invoke({
					channel: buildWorkingSetChangesetUri(SESSION),
					operationId: operation === 'keep' ? AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID : AGENT_HOST_DISCARD_CHANGES_OPERATION_ID,
					target: {
						resource: URI.file(path).toString(), nonce: file.nonce,
						...(range ? { kind: ChangesetOperationTargetKind.Range, range } : { kind: ChangesetOperationTargetKind.Resource }),
					},
				}, token);
			},
			async dispose() {
				store.dispose();
				await db.close();
				await fs.rm(directory, { recursive: true, force: true });
			},
		};
	}

	const windowsAliases: { name: string; paths: (root: string) => readonly [string, string] }[] = [
		{ name: 'drive-letter case', paths: root => [join(root, 'a.md').replace(/^[a-z]:/i, drive => drive.toUpperCase()), join(root, 'a.md').replace(/^[a-z]:/i, drive => drive.toLowerCase())] },
		{ name: 'directory-segment case', paths: root => [join(root, 'src', 'b.md'), join(dirname(root), 'Repo', 'Src', 'b.md')] },
		{ name: 'backslash to slash', paths: root => [join(root, 'src', 'c.md'), join(root, 'src', 'c.md').replaceAll('\\', '/')] },
		{ name: 'slash to backslash', paths: root => [join(root, 'src', 'd.md').replaceAll('\\', '/'), join(root, 'src', 'd.md')] },
		{ name: 'combined', paths: root => [join(root, 'src', 'e.md'), join(dirname(root), 'REPO', 'src', 'e.md').replaceAll('\\', '/')] },
		{ name: 'mixed separators', paths: root => [`${root}\\alpha\\beta\\g.md`, `${root}\\alpha/beta\\g.md`] },
		{ name: 'identical spelling', paths: root => [join(root, 'f.md'), join(root, 'f.md')] },
	];

	for (const { name, paths } of windowsAliases) {
		for (const operation of ['keep', 'undo'] as const) {
			(isWindows ? test : test.skip)(`native Windows ${name}: ${operation} settles after reload with one ordered file history`, async () => {
				await exerciseAliases(paths, operation);
			});
		}
	}

	for (const operation of ['keep', 'undo'] as const) {
		test(`native identical spelling: ${operation} control`, async () => {
			await exerciseAliases(root => [join(root, 'file.md'), join(root, 'file.md')], operation);
		});
		(!isLinux ? test : test.skip)(`native case alias: ${operation} settles after reload`, async () => {
			await exerciseAliases(root => [join(root, 'file.md'), join(root, 'FILE.md')], operation);
		});
		(!isLinux ? test : test.skip)(`cancelled ${operation} preserves alias history and permits a later decision`, async () => {
			const harness = await createHarness();
			try {
				const first = join(harness.root, 'file.md');
				const alias = join(harness.root, 'FILE.md');
				await harness.edit(first, 'first', 'first\n');
				await harness.edit(alias, 'second', 'second\n');
				const before = await harness.contents();
				await assert.rejects(harness.decide(operation, first, undefined, CancellationToken.Cancelled), /cancelled/i);
				const after = await harness.contents();
				const content = await fs.readFile(alias, 'utf8');
				await harness.decide('undo', alias);
				assert.deepStrictEqual({ before, content, remaining: await harness.workingSet() }, { before: after, content: 'second\n', remaining: [] });
			} finally {
				await harness.dispose();
			}
		});
		(!isLinux ? test : test.skip)(`${operation} cancellation while awaiting another spelling's live edit settles without mutation`, async () => {
			const harness = await createHarness();
			try {
				const first = join(harness.root, 'file.md');
				const alias = join(harness.root, 'FILE.md');
				await harness.edit(first, 'first', 'content\n');
				const files = await harness.workingSet();
				const lease = disposables.add(await harness.coordinator.beginEdit(URI.file(alias)));
				const cancellation = disposables.add(new CancellationTokenSource());
				const decision = (operation === 'keep' ? harness.keep : harness.undo).invoke({
					channel: buildWorkingSetChangesetUri(SESSION),
					operationId: operation === 'keep' ? AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID : AGENT_HOST_DISCARD_CHANGES_OPERATION_ID,
					target: { kind: ChangesetOperationTargetKind.Resource, resource: URI.file(first).toString(), nonce: files[0].nonce },
				}, cancellation.token);
				await timeout(0);
				cancellation.cancel();
				await assert.rejects(decision, /cancelled/i);
				const cancelled = { files: (await harness.workingSet()).length, content: await fs.readFile(first, 'utf8'), editing: harness.coordinator.isEditing(URI.file(first)) };
				lease.dispose();
				await harness.decide('undo', alias);
				assert.deepStrictEqual({ cancelled, remaining: await harness.workingSet() }, {
					cancelled: { files: 1, content: 'content\n', editing: true }, remaining: [],
				});
			} finally {
				await harness.dispose();
			}
		});
	}

	async function exerciseAliases(paths: (root: string) => readonly [string, string], operation: 'keep' | 'undo') {
		const harness = await createHarness();
		try {
			const [first, second] = paths(harness.root);
			await harness.edit(first, 'first', 'one\n');
			await harness.edit(second, 'second', 'one\ntwo\n');
			const [firstStat, secondStat] = await Promise.all([fs.stat(first), fs.stat(second)]);
			const beforeReload = await harness.contents();
			const recorded = await harness.db.getAllFileEdits();
			await harness.resume();
			const afterReload = await harness.contents();
			await harness.edit(first, 'third', 'one\ntwo\nthree\n');
			await harness.decide(operation, second);
			const exists = await harness.fileService.exists(URI.file(first));
			assert.deepStrictEqual({
				sameFile: firstStat.ino === secondStat.ino && firstStat.dev === secondStat.dev,
				beforeReload: beforeReload.map(file => [file.resource, file.before, file.after]),
				reloaded: afterReload,
				recorded: recorded.map(record => [record.toolCallId, record.filePath]),
				history: (await harness.db.getAllFileEdits()).slice(0, 3).map(record => record.toolCallId),
				workingSet: await harness.workingSet(),
				content: exists ? await fs.readFile(first, 'utf8') : undefined,
				editing: harness.coordinator.isEditing(URI.file(second)),
			}, {
				sameFile: true,
				beforeReload: [[URI.file(second).toString(), undefined, 'one\ntwo\n']],
				reloaded: beforeReload,
				recorded: [['first', first], ['second', second]],
				history: ['first', 'second', 'third'],
				workingSet: [],
				content: operation === 'keep' ? 'one\ntwo\nthree\n' : undefined,
				editing: false,
			});
		} finally {
			await harness.dispose();
		}
	}

	(!isLinux ? test : test.skip)('native aliases keep only selected hunks and undo the remainder after another reload', async () => {
		const harness = await createHarness();
		try {
			const first = join(harness.root, 'file.md');
			const alias = join(harness.root, 'FILE.md');
			const original = 'one\ntwo\nthree\nfour\nfive\nsix\n';
			await harness.fileService.writeFile(URI.file(first), VSBuffer.fromString(original));
			await harness.edit(first, 'first', original.replace('one', 'ONE'));
			await harness.edit(alias, 'second', original.replace('one', 'ONE').replace('six', 'SIX'));
			await harness.resume();
			await harness.decide('keep', first, { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } });
			const partial = await harness.contents();
			await harness.resume();
			await harness.decide('undo', alias);
			assert.deepStrictEqual({
				partial: partial.map(file => [file.before, file.after]),
				content: await fs.readFile(first, 'utf8'),
				workingSet: await harness.workingSet(),
			}, {
				partial: [[original.replace('one', 'ONE'), original.replace('one', 'ONE').replace('six', 'SIX')]],
				content: original.replace('one', 'ONE'),
				workingSet: [],
			});
		} finally {
			await harness.dispose();
		}
	});

	for (const { name, enabled, paths } of [
		{ name: 'case-sensitive host', enabled: isLinux, paths: (root: string) => [join(root, 'file.md'), join(root, 'FILE.md')] },
		{ name: 'literal POSIX backslash', enabled: !isWindows, paths: (root: string) => [join(root, 'a', 'b.md'), join(root, 'a\\b.md')] },
	]) {
		(enabled ? test : test.skip)(`native ${name} files remain independent`, async () => {
			const harness = await createHarness();
			try {
				const [first, second] = paths(harness.root);
				await harness.edit(first, 'first', 'first\n');
				await harness.edit(second, 'second', 'second\n');
				await harness.resume();
				const before = await harness.workingSet();
				await harness.decide('keep', first);
				const kept = await harness.workingSet();
				await harness.decide('undo', second);
				assert.deepStrictEqual({
					distinct: getFileEditPathKey(first, harness.db.fileEditUriIdentity) !== getFileEditPathKey(second, harness.db.fileEditUriIdentity),
					counts: [before.length, kept.length, (await harness.workingSet()).length],
					first: await fs.readFile(first, 'utf8'),
					secondExists: await harness.fileService.exists(URI.file(second)),
				}, { distinct: true, counts: [2, 1, 0], first: 'first\n', secondExists: false });
			} finally {
				await harness.dispose();
			}
		});
	}

	test('a declared case-sensitive provider keeps files independent on every host OS', async () => {
		const harness = await createHarness(true);
		try {
			const first = join(harness.root, 'file.md');
			const second = join(harness.root, 'FILE.md');
			await harness.edit(first, 'first', 'first\n');
			await harness.edit(second, 'second', 'second\n');
			await harness.resume();
			const before = await harness.workingSet();
			await harness.decide('keep', first);
			const kept = await harness.workingSet();
			await harness.decide('undo', second);
			assert.deepStrictEqual({
				counts: [before.length, kept.length, (await harness.workingSet()).length],
				first: (await harness.fileService.readFile(URI.file(first))).value.toString(),
				secondExists: await harness.fileService.exists(URI.file(second)),
			}, { counts: [2, 1, 0], first: 'first\n', secondExists: false });
		} finally {
			await harness.dispose();
		}
	});

	for (const operation of ['keep', 'undo'] as const) {
		test(`${operation} refuses a displayed range whose baseline changed behind its last record`, async () => {
			const harness = await createHarness();
			try {
				const path = join(harness.root, 'file.md');
				const alias = isLinux ? path : join(harness.root, 'FILE.md');
				await harness.fileService.writeFile(URI.file(path), VSBuffer.fromString('final\n'));
				const first = await harness.db.reserveFileEditOrder();
				const second = await harness.db.reserveFileEditOrder();
				const row = (toolCallId: string, filePath: string, before: string, after: string) => ({
					turnId: 'turn', toolCallId, filePath, kind: FileEditKind.Edit,
					beforeContent: new TextEncoder().encode(before), afterContent: new TextEncoder().encode(after),
					addedLines: undefined, removedLines: undefined,
				});
				await harness.db.storeFileEdit(row('second', path, 'middle\n', 'final\n'), second);
				const files = await harness.workingSet();
				const lease = disposables.add(await harness.coordinator.beginEdit(URI.file(alias)));
				const decision = (operation === 'keep' ? harness.keep : harness.undo).invoke({
					channel: buildWorkingSetChangesetUri(SESSION),
					operationId: operation === 'keep' ? AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID : AGENT_HOST_DISCARD_CHANGES_OPERATION_ID,
					target: {
						kind: ChangesetOperationTargetKind.Range, resource: URI.file(path).toString(), nonce: files[0].nonce,
						range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
					},
				}, CancellationToken.None);
				const rejected = assert.rejects(decision, error => error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict);
				await harness.db.storeFileEdit(row('first', alias, 'original\n', 'middle\n'), first);
				lease.dispose();
				await rejected;
				assert.deepStrictEqual({
					content: await fs.readFile(path, 'utf8'),
					baselines: (await harness.contents()).map(file => file.before),
				}, { content: 'final\n', baselines: ['original\n'] });
			} finally {
				await harness.dispose();
			}
		});
	}

	for (const scope of ['session', 'turn'] as const) {
		test(`${scope} Undo waits for a late reserved snapshot before changing the file`, async () => {
			const harness = await createHarness();
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			let restoreDiff: (() => void) | undefined;
			const exclusive = spy(harness.coordinator, 'runExclusive');
			try {
				const path = join(harness.root, 'file.md');
				const alias = isLinux ? path : join(harness.root, 'FILE.md');
				const original = 'a\nb\nc\nd\ne\nf\n';
				await harness.fileService.writeFile(URI.file(path), VSBuffer.fromString(original));
				await harness.edit(path, 'first', original.replace('a', 'A'));
				harness.stateManager.dispatchServerAction(harness.chat, chatTurnStarted('turn', 'Edit', new Date(1).toISOString()));
				harness.stateManager.dispatchServerAction(harness.chat, chatTurnComplete('turn', 1));
				await harness.tracker.trackEditStart(alias);
				await harness.fileService.writeFile(URI.file(alias), VSBuffer.fromString(original.replace('a', 'A').replace('f', 'F')));
				await harness.tracker.completeEdit(alias);
				const diff = stub(harness.diffService, 'computeDiffCounts').callsFake(async () => {
					started.complete();
					await release.p;
					return { added: 1, removed: 1, changes: [] };
				});
				restoreDiff = () => diff.restore();
				const saving = harness.tracker.takeCompletedEdit('turn', 'late', alias, 'edit', undefined, 'model', false);
				await started.p;
				const decision = harness.undo.invoke({
					channel: scope === 'session' ? buildSessionChangesetUri(SESSION) : buildTurnChangesetUri(SESSION, 'turn'),
					operationId: AGENT_HOST_DISCARD_CHANGES_OPERATION_ID,
					target: { kind: ChangesetOperationTargetKind.Resource, resource: URI.file(path).toString() },
				}, CancellationToken.None);
				const coordinated = exclusive.callCount;
				release.complete();
				await Promises.settled([saving.then(() => undefined), decision.then(() => undefined)]);
				assert.deepStrictEqual({ coordinated, content: await fs.readFile(path, 'utf8'), files: await harness.workingSet() }, {
					coordinated: 1, content: original, files: [],
				});
			} finally {
				release.complete();
				restoreDiff?.();
				exclusive.restore();
				await harness.dispose();
			}
		});
	}
});
