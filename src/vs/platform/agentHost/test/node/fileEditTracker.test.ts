/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Schemas } from '../../../../base/common/network.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { createFileEditContentDigest, getFileEditAttributionMarker, IAgentEditAttribution, IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { parseSessionDbUri } from '../../common/sessionDbUri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildChatUri, ToolResultContentType } from '../../common/state/sessionState.js';
import { createSessionDataService, TestDiffComputeService } from '../common/sessionTestHelpers.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory, type IEditSurvivalReporterLaunchParams } from '../../node/shared/editSurvivalReporter.js';
import { FileEditTracker } from '../../node/shared/fileEditTracker.js';
import { computeWorkingSetFiles } from '../../node/sessionDiffAggregator.js';
import { IEditArcReporterLaunchParams, IEditArcReporterService, NullEditArcReporterService } from '../../node/shared/editArcReporter.js';
import { AgentHostFileEditCoordinator, IAgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { createTestFileEditCoordinator } from './fileEditTestUtils.js';

suite('FileEditTracker', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let db: SessionDatabase;
	let tracker: FileEditTracker;
	let diffComputeService: TestDiffComputeService;
	let fileEditCoordinator: AgentHostFileEditCoordinator;
	let instantiationService: IInstantiationService;

	test('attributes each edit to the session that owns the chat when the edit lands', async () => {
		const owners: string[] = [];
		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IFileService, fileService],
			[IAgentHostFileEditCoordinator, fileEditCoordinator],
			[ISessionDataService, createSessionDataService(db)],
			[IDiffComputeService, diffComputeService],
			[IAgentEditAttributionService, new NullAgentEditAttributionService()],
			[IEditSurvivalReporterFactory, { _serviceBrand: undefined, launch: (params: IEditSurvivalReporterLaunchParams) => { owners.push(`survival ${params.ownerSessionUri}`); return Disposable.None; } }],
			[IEditArcReporterService, { _serviceBrand: undefined, reportEdit: async (params: IEditArcReporterLaunchParams) => { owners.push(`arc ${params.ownerSessionUri}`); } }],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		let owner = 'copilot:/first-owner';
		const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/storage', () => owner, undefined));
		for (const [index, path] of ['/workspace/first.txt', '/workspace/second.txt'].entries()) {
			if (index === 1) {
				// The chat changed owner between the two edits.
				owner = 'copilot:/second-owner';
			}
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			await localTracker.trackEditStart(path);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
			await localTracker.completeEdit(path);
			await localTracker.takeCompletedEdit('turn-1', `tc-${index}`, path, 'edit', undefined, 'model', false);
		}

		assert.deepStrictEqual(owners.sort(), ['arc copilot:/first-owner', 'arc copilot:/second-owner', 'survival copilot:/first-owner', 'survival copilot:/second-owner']);
	});

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		test(`standard sessions forward explicit ${provider} edit attribution and telemetry`, async () => {
			const providers: (string | undefined)[] = [];
			const services = new ServiceCollection(
				[ILogService, new NullLogService()],
				[IFileService, fileService],
				[IAgentHostFileEditCoordinator, fileEditCoordinator],
				[ISessionDataService, createSessionDataService(db)],
				[IDiffComputeService, diffComputeService],
				[IAgentEditAttributionService, new class extends NullAgentEditAttributionService {
					override async recordEdit(edit: IAgentEditAttribution) { providers.push(edit.provider); return undefined; }
				}()],
				[IEditSurvivalReporterFactory, { _serviceBrand: undefined, launch: (params: IEditSurvivalReporterLaunchParams) => { providers.push(params.provider); return Disposable.None; } }],
				[IEditArcReporterService, { _serviceBrand: undefined, reportEdit: async (params: IEditArcReporterLaunchParams) => { providers.push(params.provider); } }],
			);
			const instantiationService = disposables.add(new InstantiationService(services));
			const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'ahp-session:/standard', () => 'ahp-session:/standard', provider));
			await fileService.writeFile(URI.file('/workspace/standard.txt'), VSBuffer.fromString('before'));
			await localTracker.trackEditStart('/workspace/standard.txt');
			const afterStart = fileEditCoordinator.isEditing(URI.file('/workspace/standard.txt'));
			await fileService.writeFile(URI.file('/workspace/standard.txt'), VSBuffer.fromString('after'));
			await localTracker.completeEdit('/workspace/standard.txt');
			const afterSnapshot = fileEditCoordinator.isEditing(URI.file('/workspace/standard.txt'));
			await localTracker.takeCompletedEdit('turn-1', 'tc-standard', '/workspace/standard.txt', 'edit', undefined, 'model', false);
			assert.deepStrictEqual({ providers, afterStart, afterSnapshot, afterPersistence: fileEditCoordinator.isEditing(URI.file('/workspace/standard.txt')) }, {
				providers: [provider, provider, provider], afterStart: true, afterSnapshot: true, afterPersistence: false,
			});
		});
	}

	setup(async () => {
		fileEditCoordinator = createTestFileEditCoordinator(disposables);
		fileService = createInMemoryFileService(disposables, Schemas.file);

		db = disposables.add(await SessionDatabase.open(':memory:'));
		await db.createTurn('turn-1');

		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IAgentHostFileEditCoordinator, fileEditCoordinator);
		services.set(ISessionDataService, createSessionDataService(db));
		diffComputeService = new TestDiffComputeService();
		services.set(IDiffComputeService, diffComputeService);
		services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		services.set(IEditArcReporterService, new NullEditArcReporterService());
		instantiationService = disposables.add(new InstantiationService(services));
		tracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', undefined));
	});

	teardown(async () => {
		disposables.clear();
		await db.close();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	(isLinux ? test.skip : test)('settles an edit completed and claimed through a case alias', async () => {
		const startedPath = '/workspace/File.txt';
		const completedPath = '/workspace/file.txt';
		await fileService.writeFile(URI.file(startedPath), VSBuffer.fromString('before'));
		await tracker.trackEditStart(startedPath);
		await fileService.writeFile(URI.file(completedPath), VSBuffer.fromString('after'));
		await tracker.completeEdit(completedPath);
		const result = await tracker.takeCompletedEdit('turn-1', 'alias', completedPath, 'edit', undefined, 'model', false);

		assert.deepStrictEqual({
			recorded: await readRecordedEdit('alias', completedPath),
			hasResult: result !== undefined,
			editing: fileEditCoordinator.isEditing(URI.file(startedPath)),
		}, { recorded: 'before -> after', hasResult: true, editing: false });
	});

	(isLinux ? test.skip : test)('orders batched alias snapshots and their asynchronous persistence by the physical file', async () => {
		const paths = ['/workspace/File.txt', '/workspace/file.txt'];
		for (const path of paths) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('original'));
			await tracker.trackEditStart(path, undefined, { path });
		}
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const order: string[] = [];
		const compute = stub(diffComputeService, 'computeDiffCounts').callsFake(async before => {
			order.push(before);
			if (before === 'original') {
				started.complete();
				await release.p;
				order.push('first persisted');
			}
			return { added: 1, removed: 1, changes: [] };
		});
		try {
			await fileService.writeFile(URI.file(paths[0]), VSBuffer.fromString('first'));
			await tracker.completeEdit(paths[0], { path: paths[0] });
			const first = tracker.takeCompletedEdit('turn-1', 'first', paths[0], 'edit', { path: paths[0] }, 'model', false);
			await started.p;
			await fileService.writeFile(URI.file(paths[1]), VSBuffer.fromString('second'));
			await tracker.completeEdit(paths[1], { path: paths[1] });
			const second = tracker.takeCompletedEdit('turn-1', 'second', paths[1], 'edit', { path: paths[1] }, 'model', false);
			release.complete();
			await Promise.all([first, second]);

			assert.deepStrictEqual({
				order,
				recorded: await Promise.all(paths.map((path, index) => readRecordedEdit(index === 0 ? 'first' : 'second', path))),
				editing: paths.map(path => fileEditCoordinator.isEditing(URI.file(path))),
			}, { order: ['original', 'first persisted', 'first'], recorded: ['original -> first', 'first -> second'], editing: [false, false] });
		} finally {
			release.complete();
			compute.restore();
		}
	});

	(isLinux ? test.skip : test)('releases failed and disposed edits through aliases', async () => {
		const first = '/workspace/File.txt';
		const alias = '/workspace/file.txt';
		await tracker.trackEditStart(first);
		const failed = await tracker.takeCompletedEdit('turn-1', 'failed', alias, 'edit', undefined, 'model', false);
		const afterFailure = fileEditCoordinator.isEditing(URI.file(first));
		await tracker.trackEditStart(alias);
		tracker.dispose();
		assert.deepStrictEqual({ failed, afterFailure, afterDisposal: fileEditCoordinator.isEditing(URI.file(first)) }, {
			failed: undefined, afterFailure: false, afterDisposal: false,
		});
	});

	for (const withToolInput of [true, false]) {
		(isLinux ? test.skip : test)(`retains a concurrently running alias when another spelling finishes first (tool input: ${withToolInput})`, async () => {
			const paths = ['/workspace/File.txt', '/workspace/file.txt'];
			const inputs = paths.map(path => withToolInput ? { path } : undefined);
			for (const [index, path] of paths.entries()) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('original'));
				await tracker.trackEditStart(path, undefined, inputs[index]);
			}
			await fileService.writeFile(URI.file(paths[1]), VSBuffer.fromString('second call'));
			await tracker.completeEdit(paths[1], inputs[1]);
			await tracker.takeCompletedEdit('turn-1', 'second', paths[1], 'edit', inputs[1], 'model', false);
			const whileFirstRuns = fileEditCoordinator.isEditing(URI.file(paths[0]));
			await fileService.writeFile(URI.file(paths[0]), VSBuffer.fromString('first call'));
			await tracker.completeEdit(paths[0], inputs[0]);
			await tracker.takeCompletedEdit('turn-1', 'first', paths[0], 'edit', inputs[0], 'model', false);

			assert.deepStrictEqual({
				whileFirstRuns,
				recorded: [await readRecordedEdit('second', paths[1]), await readRecordedEdit('first', paths[0])],
				afterBoth: fileEditCoordinator.isEditing(URI.file(paths[0])),
			}, { whileFirstRuns: true, recorded: ['original -> second call', 'second call -> first call'], afterBoth: false });
		});
	}

	for (const phase of ['pending', 'completed'] as const) {
		(isLinux ? test.skip : test)(`a failed alias callback cannot consume another ${phase} edit`, async () => {
			const first = '/workspace/File.txt';
			const alias = '/workspace/file.txt';
			const firstInput = { path: first };
			const failedInput = { path: alias };
			await fileService.writeFile(URI.file(first), VSBuffer.fromString('original'));
			await tracker.trackEditStart(first, undefined, firstInput);
			await fileService.writeFile(URI.file(first), VSBuffer.fromString('changed'));
			if (phase === 'completed') {
				await tracker.completeEdit(first, firstInput);
			}
			const failedRead = stub(fileService, 'readFile').rejects(new Error('snapshot failed'));
			try {
				await assert.rejects(tracker.trackEditStart(alias, undefined, failedInput), /snapshot failed/);
			} finally {
				failedRead.restore();
			}
			await tracker.completeEdit(alias, failedInput);
			const failed = await tracker.takeCompletedEdit('turn-1', 'failed', alias, 'edit', failedInput, 'model', false);
			const stillEditing = fileEditCoordinator.isEditing(URI.file(first));
			if (phase === 'pending') {
				await tracker.completeEdit(first, firstInput);
			}
			await tracker.takeCompletedEdit('turn-1', 'first', first, 'edit', firstInput, 'model', false);
			assert.deepStrictEqual({ failed, stillEditing, records: (await db.getAllFileEdits()).map(record => record.toolCallId), contents: await readRecordedEdit('first', first) }, {
				failed: undefined, stillEditing: true, records: ['first'], contents: 'original -> changed',
			});
		});
	}

	(isLinux ? test.skip : test)('a claimed failed spelling does not block a later successful alias callback', async () => {
		const first = '/workspace/File.txt';
		const alias = '/workspace/file.txt';
		const input = { paths: [first, alias] };
		await fileService.writeFile(URI.file(alias), VSBuffer.fromString('original'));
		const snapshot = await fileService.readFile(URI.file(alias));
		let text = 'original';
		const read = stub(fileService, 'readFile').callsFake(async resource => {
			if (resource.toString() === URI.file(first).toString()) {
				throw new Error('snapshot failed');
			}
			return { ...snapshot, value: VSBuffer.fromString(text) };
		});
		try {
			const failedStart = assert.rejects(tracker.trackEditStart(first, undefined, input), /snapshot failed/);
			await Promise.all([failedStart, tracker.trackEditStart(alias, undefined, input)]);
			text = 'first';
			await Promise.all([tracker.completeEdit(first, input), tracker.completeEdit(alias, input)]);
			const failed = await tracker.takeCompletedEdit('turn-1', 'failed', first, 'apply_patch', input, 'model', false);
			read.restore();
			await fileService.writeFile(URI.file(alias), VSBuffer.fromString('first'));
			await tracker.trackEditStart(alias, undefined, input);
			await tracker.takeCompletedEdit('turn-1', 'first', alias, 'apply_patch', input, 'model', false);
			await fileService.writeFile(URI.file(first), VSBuffer.fromString('second'));
			await tracker.completeEdit(first, input);
			await tracker.takeCompletedEdit('turn-1', 'second', first, 'apply_patch', input, 'model', false);
			assert.deepStrictEqual({
				failed,
				recorded: [await readRecordedEdit('first', alias), await readRecordedEdit('second', first)],
				editing: fileEditCoordinator.isEditing(URI.file(alias)),
			}, { failed: undefined, recorded: ['original -> first', 'first -> second'], editing: false });
		} finally {
			read.restore();
		}
	});

	for (const [aliasedCompletion, withToolInput] of [[false, false], [false, true], [true, false], [true, true]]) {
		(isLinux ? test.skip : test)(`retires every spelling of a claimed failed operation (aliased completion: ${aliasedCompletion}, input: ${withToolInput})`, async () => {
			const first = '/workspace/File.txt';
			const callback = aliasedCompletion ? '/workspace/FILE.txt' : first;
			const keeper = '/workspace/fILE.txt';
			const input = withToolInput ? { edit: 'retry' } : undefined;
			const keeperInput = { edit: 'keeper' };
			for (const path of [first, callback, keeper]) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			}
			await tracker.trackEditStart(first, undefined, input);
			await tracker.trackEditStart(keeper, undefined, keeperInput);
			const read = stub(fileService, 'readFile').rejects(new Error('snapshot failed'));
			try {
				await assert.rejects(tracker.completeEdit(callback, input), /snapshot failed/);
			} finally {
				read.restore();
			}
			const failed = await tracker.takeCompletedEdit('turn-1', 'failed', callback, 'edit', input, 'model', false);
			await tracker.trackEditStart(callback, undefined, input);
			await tracker.completeEdit(keeper, keeperInput);
			await tracker.takeCompletedEdit('turn-1', 'keeper', keeper, 'edit', keeperInput, 'model', false);
			await fileService.writeFile(URI.file(first), VSBuffer.fromString('after'));
			await tracker.completeEdit(first, input);
			await tracker.takeCompletedEdit('turn-1', 'retry', first, 'edit', input, 'model', false);
			const decision = await fileEditCoordinator.runExclusive(URI.file(first), async () => 'settled', 0).catch(error => error.message);
			assert.deepStrictEqual({
				failed,
				retry: await readRecordedEdit('retry', first),
				editing: fileEditCoordinator.isEditing(URI.file(first)),
				decision,
			}, { failed: undefined, retry: 'before -> after', editing: false, decision: 'settled' });
		});
	}

	for (const [earlyCallback, withToolInput] of [['complete', false], ['complete', true], ['claim', false], ['claim', true]] as const) {
		(isLinux ? test.skip : test)(`a rejected before-read cannot leave a failure after its result is claimed (${earlyCallback}, input: ${withToolInput})`, async () => {
			const first = '/workspace/File.txt';
			const callback = '/workspace/FILE.txt';
			const keeper = '/workspace/fILE.txt';
			const input = withToolInput ? { edit: 'retry' } : undefined;
			const keeperInput = { edit: 'keeper' };
			for (const path of [first, callback, keeper]) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			}
			const snapshot = await fileService.readFile(URI.file(first));
			const started = new DeferredPromise<void>();
			const beforeRead = new DeferredPromise<typeof snapshot>();
			const read = stub(fileService, 'readFile').callsFake(async resource => {
				if (resource.toString() === URI.file(first).toString()) {
					started.complete();
					return beforeRead.p;
				}
				return snapshot;
			});
			const rejectedStart = assert.rejects(tracker.trackEditStart(first, undefined, input), /snapshot failed/);
			try {
				await started.p;
				await tracker.trackEditStart(keeper, undefined, keeperInput);
				const rejectedCompletion = earlyCallback === 'complete'
					? assert.rejects(tracker.completeEdit(callback, input), /snapshot failed/)
					: undefined;
				if (earlyCallback === 'claim') {
					await tracker.takeCompletedEdit('turn-1', 'failed', callback, 'edit', input, 'model', false);
				}
				beforeRead.error(new Error('snapshot failed'));
				await Promise.all([rejectedStart, rejectedCompletion]);
				read.restore();
				if (earlyCallback === 'complete') {
					await tracker.takeCompletedEdit('turn-1', 'failed', callback, 'edit', input, 'model', false);
				}
				await tracker.trackEditStart(callback, undefined, input);
				await tracker.completeEdit(keeper, keeperInput);
				await tracker.takeCompletedEdit('turn-1', 'keeper', keeper, 'edit', keeperInput, 'model', false);
				await fileService.writeFile(URI.file(first), VSBuffer.fromString('after'));
				await tracker.completeEdit(first, input);
				await tracker.takeCompletedEdit('turn-1', 'retry', first, 'edit', input, 'model', false);
				const decision = await fileEditCoordinator.runExclusive(URI.file(first), async () => 'settled', 0).catch(error => error.message);
				assert.deepStrictEqual({
					retry: await readRecordedEdit('retry', first),
					editing: fileEditCoordinator.isEditing(URI.file(first)),
					decision,
				}, { retry: 'before -> after', editing: false, decision: 'settled' });
			} finally {
				beforeRead.error(new Error('snapshot failed'));
				read.restore();
				await rejectedStart;
			}
		});
	}

	for (const [reverseClaims, withToolInput] of [[false, false], [false, true], [true, false], [true, true]]) {
		(isLinux ? test.skip : test)(`failed results prefer callback ownership over another failure's original spelling (reverse: ${reverseClaims}, input: ${withToolInput})`, async () => {
			const first = '/workspace/FILE.txt';
			const second = '/workspace/File.txt';
			const firstCallback = '/workspace/FIlE.txt';
			const healthy = '/workspace/file.txt';
			const input = withToolInput ? { paths: [first, second, healthy] } : undefined;
			for (const path of [first, second, firstCallback, healthy]) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			}
			for (const path of [first, second, healthy]) {
				await tracker.trackEditStart(path, undefined, input);
			}
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const read = stub(fileService, 'readFile').callsFake(async resource => {
				if (resource.toString() === URI.file(firstCallback).toString()) {
					started.complete();
					await release.p;
				}
				throw new Error('snapshot failed');
			});
			const firstFailure = assert.rejects(tracker.completeEdit(firstCallback, input), /snapshot failed/);
			try {
				await started.p;
				const secondFailure = assert.rejects(tracker.completeEdit(first, input), /snapshot failed/);
				release.complete();
				await Promise.all([firstFailure, secondFailure]);
				read.restore();
				const claims = reverseClaims ? [first, firstCallback] : [firstCallback, first];
				const failed = await Promise.all(claims.map(path => tracker.takeCompletedEdit('turn-1', 'patch', path, 'apply_patch', input, 'model', false)));
				const editingBeforeHealthyCompletion = fileEditCoordinator.isEditing(URI.file(healthy));
				await fileService.writeFile(URI.file(healthy), VSBuffer.fromString('after'));
				await tracker.completeEdit(healthy, input);
				await tracker.takeCompletedEdit('turn-1', 'patch', healthy, 'apply_patch', input, 'model', false);
				assert.deepStrictEqual({
					failed,
					editingBeforeHealthyCompletion,
					recorded: await readRecordedEdit('patch', healthy),
					editingAfter: fileEditCoordinator.isEditing(URI.file(healthy)),
				}, { failed: [undefined, undefined], editingBeforeHealthyCompletion: true, recorded: 'before -> after', editingAfter: false });
			} finally {
				release.complete();
				read.restore();
				await firstFailure;
			}
		});
	}

	for (const [reverseFailures, withToolInput] of [[false, false], [false, true], [true, false], [true, true]]) {
		(isLinux ? test.skip : test)(`same-callback failures retain completion-claim order when before-reads reject (reverse: ${reverseFailures}, input: ${withToolInput})`, async () => {
			const first = '/workspace/File.txt';
			const second = '/workspace/FILE.txt';
			const callback = '/workspace/FIlE.txt';
			const healthy = '/workspace/file.txt';
			const input = withToolInput ? { paths: [first, second, healthy] } : undefined;
			for (const path of [first, second, callback, healthy]) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			}
			const snapshot = await fileService.readFile(URI.file(healthy));
			const reads = [first, second].map(filePath => ({ filePath, resource: URI.file(filePath), started: new DeferredPromise<void>(), result: new DeferredPromise<typeof snapshot>() }));
			const read = stub(fileService, 'readFile').callsFake(async resource => {
				const pending = reads.find(read => read.resource.toString() === resource.toString());
				if (pending) {
					pending.started.complete();
					return pending.result.p;
				}
				return snapshot;
			});
			const rejected = reads.map(read => assert.rejects(tracker.trackEditStart(read.filePath, undefined, input), /snapshot failed/));
			try {
				await Promise.all(reads.map(read => read.started.p));
				await tracker.trackEditStart(healthy, undefined, input);
				rejected.push(assert.rejects(tracker.completeEdit(callback, input), /snapshot failed/));
				rejected.push(assert.rejects(tracker.completeEdit(callback, input), /snapshot failed/));
				const firstFailure = reverseFailures ? 1 : 0;
				reads[firstFailure].result.error(new Error('snapshot failed'));
				await rejected[firstFailure];
				reads[1 - firstFailure].result.error(new Error('snapshot failed'));
				await Promise.all(rejected);
				read.restore();
				const failed = await Promise.all([callback, second].map(path => tracker.takeCompletedEdit('turn-1', 'patch', path, 'apply_patch', input, 'model', false)));
				const editingBeforeHealthyCompletion = fileEditCoordinator.isEditing(URI.file(healthy));
				await fileService.writeFile(URI.file(healthy), VSBuffer.fromString('after'));
				await tracker.completeEdit(healthy, input);
				await tracker.takeCompletedEdit('turn-1', 'patch', healthy, 'apply_patch', input, 'model', false);
				assert.deepStrictEqual({
					failed,
					editingBeforeHealthyCompletion,
					recorded: await readRecordedEdit('patch', healthy),
					editingAfter: fileEditCoordinator.isEditing(URI.file(healthy)),
				}, { failed: [undefined, undefined], editingBeforeHealthyCompletion: true, recorded: 'before -> after', editingAfter: false });
			} finally {
				for (const read of reads) {
					read.result.error(new Error('snapshot failed'));
				}
				read.restore();
				await Promise.all(rejected);
			}
		});
	}

	(isLinux ? test.skip : test)('persists alias snapshots in completion order even when claimed in reverse order', async () => {
		const paths = ['/workspace/File.txt', '/workspace/file.txt'];
		for (const path of paths) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('original'));
			await tracker.trackEditStart(path, undefined, { path });
		}
		await fileService.writeFile(URI.file(paths[0]), VSBuffer.fromString('first'));
		await tracker.completeEdit(paths[0], { path: paths[0] });
		await fileService.writeFile(URI.file(paths[1]), VSBuffer.fromString('second'));
		await tracker.completeEdit(paths[1], { path: paths[1] });
		await tracker.takeCompletedEdit('turn-1', 'second', paths[1], 'edit', { path: paths[1] }, 'model', false);
		await tracker.takeCompletedEdit('turn-1', 'first', paths[0], 'edit', { path: paths[0] }, 'model', false);

		assert.deepStrictEqual({
			order: (await db.getAllFileEdits()).map(record => record.toolCallId),
			files: (await computeWorkingSetFiles([{ sessionUri: 'copilot:/test-session', db }], diffComputeService)).length,
			editing: fileEditCoordinator.isEditing(URI.file(paths[0])),
		}, { order: ['first', 'second'], files: 1, editing: false });
	});

	for (const [useAlias, delayReservation] of [[false, false], [false, true], [true, false], [true, true]]) {
		(useAlias && isLinux ? test.skip : test)(`serializes overlapping snapshot reads before recording completion order (alias: ${useAlias}, delayed reservation: ${delayReservation})`, async () => {
			const paths = ['/workspace/File.txt', useAlias ? '/workspace/file.txt' : '/workspace/File.txt'];
			const inputs = paths.map((path, index) => ({ path, index }));
			const resource = URI.file(paths[0]);
			const unrelated = URI.file('/workspace/unrelated.txt');
			for (const [index, path] of paths.entries()) {
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('original'));
				await tracker.trackEditStart(path, undefined, inputs[index]);
			}
			await tracker.trackEditStart(unrelated.fsPath);
			await fileService.writeFile(unrelated, VSBuffer.fromString('unrelated'));
			const unrelatedSnapshot = await fileService.readFile(unrelated);
			await fileService.writeFile(resource, VSBuffer.fromString('first'));
			const firstSnapshot = await fileService.readFile(resource);
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const reservedOrders = delayReservation ? [await db.reserveFileEditOrder(), await db.reserveFileEditOrder(), await db.reserveFileEditOrder()] : [];
			let reservationCalls = 0;
			const reserve = delayReservation ? stub(db, 'reserveFileEditOrder').callsFake(async () => {
				const order = reservedOrders[reservationCalls++];
				if (order === undefined) {
					throw new Error('Unexpected snapshot order reservation');
				}
				if (reservationCalls === 1) {
					started.complete();
					await release.p;
				}
				return order;
			}) : undefined;
			let snapshotReads = 0;
			const read = stub(fileService, 'readFile').callsFake(async target => {
				if (fileEditCoordinator.uriIdentity.isEqual(target, unrelated)) {
					return unrelatedSnapshot;
				}
				if (++snapshotReads === 1) {
					if (!delayReservation) {
						started.complete();
						await release.p;
					}
					return firstSnapshot;
				}
				return { ...firstSnapshot, value: VSBuffer.fromString('second') };
			});
			try {
				const first = tracker.completeEdit(paths[0], inputs[0]);
				await started.p;
				await fileService.writeFile(resource, VSBuffer.fromString('second'));
				const second = tracker.completeEdit(paths[1], inputs[1]);
				await tracker.completeEdit(unrelated.fsPath);
				const readsWhileFirstIsPending = snapshotReads;
				release.complete();
				await Promise.all([first, second]);
				for (const [index, path] of paths.entries()) {
					await tracker.takeCompletedEdit('turn-1', index === 0 ? 'first' : 'second', path, 'edit', inputs[index], 'model', false);
				}
				await tracker.takeCompletedEdit('turn-1', 'unrelated', unrelated.fsPath, 'edit', undefined, 'model', false);
				read.restore();
				const files = await computeWorkingSetFiles([{ sessionUri: 'copilot:/test-session', db }], diffComputeService);
				const file = files.find(file => file.diff.after && fileEditCoordinator.uriIdentity.isEqual(URI.parse(file.diff.after.uri), resource))!;
				const after = parseSessionDbUri(file.diff.after!.content.uri)!;
				const content = await db.readFileEditContent(after.toolCallId, after.filePath);
				assert.deepStrictEqual({
					readsWhileFirstIsPending,
					recorded: [await readRecordedEdit('first', paths[0]), await readRecordedEdit('second', paths[1])],
					order: (await db.getAllFileEdits()).filter(record => record.toolCallId !== 'unrelated').map(record => record.toolCallId),
					workingSetAfter: new TextDecoder().decode(content?.afterContent),
					fileAfter: (await fileService.readFile(resource)).value.toString(),
					editing: fileEditCoordinator.isEditing(resource),
				}, {
					readsWhileFirstIsPending: 1,
					recorded: ['original -> first', 'first -> second'],
					order: ['first', 'second'],
					workingSetAfter: 'second',
					fileAfter: 'second',
					editing: false,
				});
			} finally {
				release.complete();
				read.restore();
				reserve?.restore();
			}
		});
	}

	for (const dispose of [false, true]) {
		test(`queued snapshot completions settle after the first read ${dispose ? 'is disposed' : 'fails'}`, async () => {
			const resource = URI.file('/workspace/queued.txt');
			const inputs = [{ index: 0 }, { index: 1 }];
			await fileService.writeFile(resource, VSBuffer.fromString('original'));
			for (const input of inputs) {
				await tracker.trackEditStart(resource.fsPath, undefined, input);
			}
			await fileService.writeFile(resource, VSBuffer.fromString('first'));
			const snapshot = await fileService.readFile(resource);
			const started = new DeferredPromise<void>();
			const readResult = new DeferredPromise<typeof snapshot>();
			let snapshotReads = 0;
			const read = stub(fileService, 'readFile').callsFake(async () => {
				if (++snapshotReads === 1) {
					started.complete();
					return readResult.p;
				}
				return { ...snapshot, value: VSBuffer.fromString('second') };
			});
			try {
				const first = tracker.completeEdit(resource.fsPath, inputs[0]).then(() => 'completed', error => error.message);
				await started.p;
				await fileService.writeFile(resource, VSBuffer.fromString('second'));
				const second = tracker.completeEdit(resource.fsPath, inputs[1]);
				if (dispose) {
					tracker.dispose();
					readResult.complete(snapshot);
				} else {
					readResult.error(new Error('snapshot failed'));
				}
				const firstOutcome = await first;
				await second;
				const result = await tracker.takeCompletedEdit('turn-1', 'second', resource.fsPath, 'edit', inputs[1], 'model', false);
				assert.deepStrictEqual({
					firstOutcome,
					snapshotReads,
					hasResult: result !== undefined,
					recorded: await readRecordedEdit('second', resource.fsPath),
					editing: fileEditCoordinator.isEditing(resource),
				}, {
					firstOutcome: dispose ? 'completed' : 'snapshot failed',
					snapshotReads: dispose ? 1 : 2,
					hasResult: !dispose,
					recorded: dispose ? 'not recorded' : 'original -> second',
					editing: false,
				});
			} finally {
				readResult.complete(snapshot);
				read.restore();
			}
		});
	}

	test('preserves missed-result cleanup for ordered callbacks using the identical spelling', async () => {
		const path = '/workspace/file.txt';
		for (const text of ['missed', 'last']) {
			await tracker.trackEditStart(path, undefined, { text });
			await fileService.writeFile(URI.file(path), VSBuffer.fromString(text));
			await tracker.completeEdit(path, { text });
		}
		await tracker.takeCompletedEdit('turn-1', 'last', path, 'edit', { text: 'last' }, 'model', false);
		assert.deepStrictEqual({ editing: fileEditCoordinator.isEditing(URI.file(path)), records: (await db.getAllFileEdits()).map(record => record.toolCallId) }, {
			editing: false, records: ['last'],
		});
	});

	for (const [postFailure, withToolInput] of [[false, false], [false, true], [true, false], [true, true]]) {
		test(`a failed first start cannot consume a healthy same-spelling operation (post: ${postFailure}, input: ${withToolInput})`, async () => {
			const path = '/workspace/same.txt';
			const input = withToolInput ? { path, new_str: 'after' } : undefined;
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			const snapshot = await fileService.readFile(URI.file(path));
			const firstRead = new DeferredPromise<typeof snapshot>();
			let readCount = 0;
			const read = stub(fileService, 'readFile').callsFake(async () => ++readCount === 1 ? firstRead.p : snapshot);
			const rejected = assert.rejects(tracker.trackEditStart(path, undefined, input), /before failed/);
			try {
				await tracker.trackEditStart(path, undefined, input);
				firstRead.error(new Error('before failed'));
				await rejected;
				read.restore();
				if (postFailure) {
					await tracker.completeEdit(path, input);
				}
				const failed = await tracker.takeCompletedEdit('turn-1', 'failed', path, 'edit', input, 'model', false);
				const editingBeforeHealthyCompletion = fileEditCoordinator.isEditing(URI.file(path));
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
				await tracker.completeEdit(path, input);
				await tracker.takeCompletedEdit('turn-1', 'healthy', path, 'edit', input, 'model', false);
				assert.deepStrictEqual({
					failed,
					editingBeforeHealthyCompletion,
					healthy: await readRecordedEdit('healthy', path),
					records: (await db.getAllFileEdits()).map(record => record.toolCallId),
					editingAfter: fileEditCoordinator.isEditing(URI.file(path)),
				}, { failed: undefined, editingBeforeHealthyCompletion: true, healthy: 'before -> after', records: ['healthy'], editingAfter: false });
			} finally {
				firstRead.error(new Error('before failed'));
				read.restore();
				await rejected;
			}
		});
	}

	for (const [phase, withToolInput] of [['start', false], ['start', true], ['complete', false], ['complete', true]] as const) {
		test(`an isolated ${phase} failure remains owned until its late result is retired (input: ${withToolInput})`, async () => {
			const path = '/workspace/isolated.txt';
			const input = withToolInput ? { path, new_str: 'after' } : undefined;
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			if (phase === 'complete') {
				await tracker.trackEditStart(path, undefined, input);
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('unrecorded first'));
			}
			const read = stub(fileService, 'readFile').rejects(new Error('snapshot failed'));
			try {
				await assert.rejects(phase === 'start' ? tracker.trackEditStart(path, undefined, input) : tracker.completeEdit(path, input), /snapshot failed/);
			} finally {
				read.restore();
			}
			await tracker.trackEditStart(path, undefined, input);
			const failed = await tracker.takeCompletedEdit('turn-1', 'failed', path, 'edit', input, 'model', false);
			const editingBeforeHealthyCompletion = fileEditCoordinator.isEditing(URI.file(path));
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
			await tracker.completeEdit(path, input);
			await tracker.takeCompletedEdit('turn-1', 'healthy', path, 'edit', input, 'model', false);
			assert.deepStrictEqual({
				failed,
				editingBeforeHealthyCompletion,
				healthy: await readRecordedEdit('healthy', path),
				records: (await db.getAllFileEdits()).map(record => record.toolCallId),
				editingAfter: fileEditCoordinator.isEditing(URI.file(path)),
			}, {
				failed: undefined, editingBeforeHealthyCompletion: true,
				healthy: `${phase === 'start' ? 'before' : 'unrecorded first'} -> after`,
				records: ['healthy'], editingAfter: false,
			});
		});
	}

	test('an earlier completed edit stays ahead of a later failed identical operation', async () => {
		const path = '/workspace/same.txt';
		const input = { path, new_str: 'after' };
		await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
		await tracker.trackEditStart(path, undefined, input);
		await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
		await tracker.completeEdit(path, input);
		const read = stub(fileService, 'readFile').rejects(new Error('before failed'));
		try {
			await assert.rejects(tracker.trackEditStart(path, undefined, input), /before failed/);
		} finally {
			read.restore();
		}
		await tracker.takeCompletedEdit('turn-1', 'healthy', path, 'edit', input, 'model', false);
		const failed = await tracker.takeCompletedEdit('turn-1', 'failed', path, 'edit', input, 'model', false);
		assert.deepStrictEqual({
			failed, healthy: await readRecordedEdit('healthy', path),
			records: (await db.getAllFileEdits()).map(record => record.toolCallId),
			editing: fileEditCoordinator.isEditing(URI.file(path)),
		}, { failed: undefined, healthy: 'before -> after', records: ['healthy'], editing: false });
	});

	test('a result waits for its completing snapshot without consuming a newer identical edit', async () => {
		const path = '/workspace/completing.txt';
		const input = { path, new_str: 'after' };
		await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
		await tracker.trackEditStart(path, undefined, input);
		await fileService.writeFile(URI.file(path), VSBuffer.fromString('first'));
		const snapshot = await fileService.readFile(URI.file(path));
		const started = new DeferredPromise<void>();
		const afterRead = new DeferredPromise<typeof snapshot>();
		let reads = 0;
		const read = stub(fileService, 'readFile').callsFake(async () => {
			if (++reads === 1) {
				started.complete();
				return afterRead.p;
			}
			return snapshot;
		});
		const completion = tracker.completeEdit(path, input);
		try {
			await started.p;
			await tracker.trackEditStart(path, undefined, input);
			let claimed = false;
			const result = tracker.takeCompletedEdit('turn-1', 'first', path, 'edit', input, 'model', false).then(edit => { claimed = true; return edit; });
			await timeout(0);
			const claimedBeforeSnapshot = claimed;
			afterRead.complete(snapshot);
			await completion;
			await result;
			read.restore();
			const editingBeforeSecond = fileEditCoordinator.isEditing(URI.file(path));
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('second'));
			await tracker.completeEdit(path, input);
			await tracker.takeCompletedEdit('turn-1', 'second', path, 'edit', input, 'model', false);
			assert.deepStrictEqual({
				claimedBeforeSnapshot, editingBeforeSecond,
				recorded: [await readRecordedEdit('first', path), await readRecordedEdit('second', path)],
				editingAfter: fileEditCoordinator.isEditing(URI.file(path)),
			}, { claimedBeforeSnapshot: false, editingBeforeSecond: true, recorded: ['before -> first', 'first -> second'], editingAfter: false });
		} finally {
			afterRead.complete(snapshot);
			read.restore();
			await completion;
		}
	});

	for (const inputKind of ['equal', 'omitted', 'distinct'] as const) {
		for (const concurrent of [false, true]) {
			test(`result waiters reserve separate operations (${inputKind} inputs, concurrent: ${concurrent})`, async () => {
				const path = '/workspace/waiters.txt';
				const calls = [0, 1].map(index => ({
					id: index === 0 ? 'first' : 'second',
					input: inputKind === 'omitted' ? undefined : { value: inputKind === 'equal' ? 'same' : String(index) },
				}));
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
				for (const call of calls) {
					await tracker.trackEditStart(path, undefined, call.input);
				}
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('first'));
				const snapshot = await fileService.readFile(URI.file(path));
				const started = new DeferredPromise<void>();
				const afterRead = new DeferredPromise<typeof snapshot>();
				let reads = 0;
				const read = stub(fileService, 'readFile').callsFake(async () => {
					if (++reads === 1) {
						started.complete();
						return afterRead.p;
					}
					return { ...snapshot, value: VSBuffer.fromString('second') };
				});
				const completions = [tracker.completeEdit(path, calls[0].input)];
				const take = (index: number) => tracker.takeCompletedEdit('turn-1', calls[index].id, path, 'edit', calls[index].input, 'model', false);
				try {
					await started.p;
					await fileService.writeFile(URI.file(path), VSBuffer.fromString('second'));
					completions.push(tracker.completeEdit(path, calls[1].input));
					const claims = concurrent ? [take(0), take(1)] : undefined;
					afterRead.complete(snapshot);
					await Promise.all(completions);
					const results = claims ? await Promise.all(claims) : [await take(0), await take(1)];
					read.restore();
					assert.deepStrictEqual({
						results: results.map(result => result?.type),
						recorded: await Promise.all(calls.map(call => readRecordedEdit(call.id, path))),
						order: (await db.getAllFileEdits()).map(record => record.toolCallId),
						current: (await fileService.readFile(URI.file(path))).value.toString(),
						editing: fileEditCoordinator.isEditing(URI.file(path)),
					}, {
						results: [ToolResultContentType.FileEdit, ToolResultContentType.FileEdit],
						recorded: ['before -> first', 'first -> second'],
						order: ['first', 'second'], current: 'second', editing: false,
					});
				} finally {
					afterRead.complete(snapshot);
					read.restore();
					await Promise.all(completions);
				}
			});
		}
	}

	test('disposal releases a result waiting behind another snapshot after its before-read fails', async () => {
		const path = '/workspace/disposal.txt';
		const firstInput = { edit: 'first' };
		const secondInput = { edit: 'second' };
		await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
		const snapshot = await fileService.readFile(URI.file(path));
		await tracker.trackEditStart(path, undefined, firstInput);
		const secondBefore = new DeferredPromise<typeof snapshot>();
		const firstAfter = new DeferredPromise<typeof snapshot>();
		const afterStarted = new DeferredPromise<void>();
		let reads = 0;
		const read = stub(fileService, 'readFile').callsFake(async () => {
			if (++reads === 1) {
				return secondBefore.p;
			}
			afterStarted.complete();
			return firstAfter.p;
		});
		const failedStart = assert.rejects(tracker.trackEditStart(path, undefined, secondInput), /before failed/);
		const firstCompletion = tracker.completeEdit(path, firstInput);
		let secondCompletion: Promise<void> | undefined;
		try {
			await afterStarted.p;
			secondCompletion = assert.rejects(tracker.completeEdit(path, secondInput), /before failed/);
			let resultSettled = false;
			const result = tracker.takeCompletedEdit('turn-1', 'second', path, 'edit', secondInput, 'model', false).then(edit => { resultSettled = true; return edit; });
			secondBefore.error(new Error('before failed'));
			await failedStart;
			tracker.dispose();
			await timeout(0);
			const settledBeforeReadRelease = resultSettled;
			firstAfter.complete(snapshot);
			await Promise.all([firstCompletion, secondCompletion]);
			assert.deepStrictEqual({
				settledBeforeReadRelease, result: await result,
				records: await db.getAllFileEdits(),
				editing: fileEditCoordinator.isEditing(URI.file(path)),
			}, { settledBeforeReadRelease: true, result: undefined, records: [], editing: false });
		} finally {
			secondBefore.error(new Error('before failed'));
			firstAfter.complete(snapshot);
			read.restore();
			await Promise.all([failedStart, firstCompletion, secondCompletion]);
		}
	});

	for (const fail of [false, true]) {
		test(`disposing the tracker keeps a claimed persistence lease until it settles (failure: ${fail})`, async () => {
			const path = '/workspace/file.txt';
			await tracker.trackEditStart(path);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('first'));
			await tracker.completeEdit(path);
			await tracker.takeCompletedEdit('turn-1', 'first', path, 'edit', undefined, 'model', false);
			await tracker.trackEditStart(path);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('second'));
			await tracker.completeEdit(path);
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const diff = stub(diffComputeService, 'computeDiffCounts').callsFake(async () => {
				started.complete();
				await release.p;
				return { added: 1, removed: 1, changes: [] };
			});
			const failingWrite = fail ? stub(db, 'storeFileEdit').rejects(new Error('persist failed')) : undefined;
			try {
				const saving = tracker.takeCompletedEdit('turn-1', 'second', path, 'edit', undefined, 'model', false).then(() => 'saved', error => error.message);
				await started.p;
				tracker.dispose();
				const editingAfterDisposal = fileEditCoordinator.isEditing(URI.file(path));
				const decision = fileEditCoordinator.runExclusive(URI.file(path), async () => (await db.getAllFileEdits()).map(record => record.toolCallId));
				release.complete();
				assert.deepStrictEqual({
					editingAfterDisposal, outcome: await saving, decision: await decision,
					editingAfterPersistence: fileEditCoordinator.isEditing(URI.file(path)),
				}, {
					editingAfterDisposal: true, outcome: fail ? 'persist failed' : 'saved',
					decision: fail ? ['first'] : ['first', 'second'], editingAfterPersistence: false,
				});
			} finally {
				release.complete();
				diff.restore();
				failingWrite?.restore();
			}
		});
	}

	(isLinux ? test.skip : test)('retains the last snapshot for concurrent completions of one multi-path tool call', async () => {
		const paths = ['/workspace/File.txt', '/workspace/file.txt'];
		const input = { paths };
		for (const path of paths) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('original'));
			await tracker.trackEditStart(path, undefined, input);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('changed'));
		}
		await Promise.all(paths.map(path => tracker.completeEdit(path, input)));
		for (const path of paths) {
			await tracker.takeCompletedEdit('turn-1', 'same-call', path, 'apply_patch', input, 'model', false);
		}
		assert.deepStrictEqual(await Promise.all(paths.map(path => readRecordedEdit('same-call', path))), ['original -> changed', 'changed -> changed']);
	});

	(isLinux ? test.skip : test)('claims an input-less completed alias before a newer pending edit', async () => {
		const first = '/workspace/File.txt';
		const alias = '/workspace/file.txt';
		await fileService.writeFile(URI.file(first), VSBuffer.fromString('original'));
		await tracker.trackEditStart(first);
		await fileService.writeFile(URI.file(first), VSBuffer.fromString('first'));
		await tracker.completeEdit(first);
		await fileService.writeFile(URI.file(alias), VSBuffer.fromString('first'));
		await tracker.trackEditStart(alias);
		await tracker.takeCompletedEdit('turn-1', 'first', alias, 'edit', undefined, 'model', false);
		await fileService.writeFile(URI.file(alias), VSBuffer.fromString('second'));
		await tracker.completeEdit(alias);
		await tracker.takeCompletedEdit('turn-1', 'second', alias, 'edit', undefined, 'model', false);
		assert.deepStrictEqual({
			recorded: [await readRecordedEdit('first', alias), await readRecordedEdit('second', alias)],
			editing: fileEditCoordinator.isEditing(URI.file(first)),
		}, { recorded: ['original -> first', 'first -> second'], editing: false });
	});

	for (const phase of ['start', 'complete', 'persist'] as const) {
		test(`snapshot ${phase} failures surface and release the file for a later edit`, async () => {
			const path = '/workspace/failure.txt';
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			if (phase !== 'start') {
				await tracker.trackEditStart(path);
				await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
			}
			if (phase === 'persist') {
				await tracker.completeEdit(path);
			}
			const failure = new Error(`${phase} failed`);
			const failing = phase === 'persist' ? stub(db, 'storeFileEdit').rejects(failure) : stub(fileService, 'readFile').rejects(failure);
			try {
				await assert.rejects(phase === 'start' ? tracker.trackEditStart(path)
					: phase === 'complete' ? tracker.completeEdit(path)
						: tracker.takeCompletedEdit('turn-1', 'failed', path, 'edit', undefined, 'model', false), failure);
			} finally {
				failing.restore();
			}
			const afterFailure = fileEditCoordinator.isEditing(URI.file(path));
			if (phase !== 'persist') {
				await tracker.takeCompletedEdit('turn-1', 'failed', path, 'edit', undefined, 'model', false);
			}
			await tracker.trackEditStart(path);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('retry'));
			await tracker.completeEdit(path);
			await tracker.takeCompletedEdit('turn-1', 'retry', path, 'edit', undefined, 'model', false);
			assert.deepStrictEqual({ afterFailure, afterRetry: fileEditCoordinator.isEditing(URI.file(path)), recorded: await readRecordedEdit('retry', path) }, {
				afterFailure: false, afterRetry: false, recorded: `${phase === 'start' ? 'before' : 'after'} -> retry`,
			});
		});
	}

	test('releases an unsuccessful tool without requiring a post-tool snapshot', async () => {
		const resource = URI.file('/workspace/failed.txt');
		await tracker.trackEditStart(resource.fsPath);
		const beforeCompletion = fileEditCoordinator.isEditing(resource);
		const result = await tracker.takeCompletedEdit('turn-1', 'failed', resource.fsPath, 'edit', undefined, 'model', false);

		assert.deepStrictEqual({ beforeCompletion, result, afterCompletion: fileEditCoordinator.isEditing(resource) }, {
			beforeCompletion: true, result: undefined, afterCompletion: false,
		});
	});

	test('disposing a tracker releases an edit acquired after waiting for an exclusive change', async () => {
		const resource = URI.file('/workspace/waiting.txt');
		disposables.add(fileEditCoordinator.registerCoordinatedProvider('copilotcli'));
		const coordinated = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', 'copilotcli'));
		const release = new DeferredPromise<void>();
		const exclusive = fileEditCoordinator.runExclusive(resource, () => release.p);
		const started = coordinated.trackEditStart(resource.fsPath);
		const rejected = assert.rejects(started, CancellationError);
		coordinated.dispose();
		release.complete();
		await Promise.all([exclusive, rejected]);

		assert.strictEqual(fileEditCoordinator.isEditing(resource), false);
	});

	test('retains independent leases for the next edit while the previous edit is persisting', async () => {
		const resource = URI.file('/workspace/sequential.txt');
		const gate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		const compute = stub(diffComputeService, 'computeDiffCounts').callsFake(async () => {
			gate.started.complete();
			await gate.release.p;
			return { added: 1, removed: 1, changes: [] };
		});
		try {
			await fileService.writeFile(resource, VSBuffer.fromString('before'));
			await tracker.trackEditStart(resource.fsPath);
			await fileService.writeFile(resource, VSBuffer.fromString('first'));
			await tracker.completeEdit(resource.fsPath);
			const first = tracker.takeCompletedEdit('turn-1', 'first', resource.fsPath, 'edit', undefined, 'model', false);
			await gate.started.p;
			await tracker.trackEditStart(resource.fsPath);
			gate.release.complete();
			await first;
			const afterFirst = fileEditCoordinator.isEditing(resource);
			await fileService.writeFile(resource, VSBuffer.fromString('second'));
			await tracker.completeEdit(resource.fsPath);
			await tracker.takeCompletedEdit('turn-1', 'second', resource.fsPath, 'edit', undefined, 'model', false);

			assert.deepStrictEqual({ afterFirst, afterSecond: fileEditCoordinator.isEditing(resource) }, { afterFirst: true, afterSecond: false });
		} finally {
			gate.release.complete();
			compute.restore();
		}
	});

	/** The contents an edit recorded, as `before -> after`. */
	async function readRecordedEdit(toolCallId: string, filePath: string): Promise<string> {
		const content = await db.readFileEditContent(toolCallId, filePath);
		const decoder = new TextDecoder();
		return content ? `${decoder.decode(content.beforeContent)} -> ${decoder.decode(content.afterContent)}` : 'not recorded';
	}

	for (const withToolInput of [true, false]) {
		test(`records each edit of a file in a batch of tool calls, which all start before any runs (tool input: ${withToolInput})`, async () => {
			const resource = URI.file('/workspace/batch.txt');
			await fileService.writeFile(resource, VSBuffer.fromString('original'));
			const calls = ['a', 'b', 'c'].map(id => ({ id, input: withToolInput ? { path: resource.fsPath, new_str: id } : undefined }));
			await Promise.all(calls.map(call => tracker.trackEditStart(resource.fsPath, undefined, call.input)));
			const recorded: string[] = [];
			for (const call of calls) {
				await fileService.writeFile(resource, VSBuffer.fromString(`after ${call.id}`));
				await tracker.completeEdit(resource.fsPath, call.input);
				await tracker.takeCompletedEdit('turn-1', call.id, resource.fsPath, 'edit', call.input, 'model', false);
				recorded.push(await readRecordedEdit(call.id, resource.fsPath));
			}

			assert.deepStrictEqual({ recorded, editing: fileEditCoordinator.isEditing(resource) }, {
				recorded: ['original -> after a', 'after a -> after b', 'after b -> after c'],
				editing: false,
			});
		});
	}

	test('starts an edit of a batch from what its last completed edit wrote, and releases edits whose completion was missed', async () => {
		const resource = URI.file('/workspace/batch.txt');
		await fileService.writeFile(resource, VSBuffer.fromString('original'));
		const [completed, failed, missed, last] = ['completed', 'failed', 'missed', 'last'].map(id => ({ path: resource.fsPath, new_str: id }));
		await Promise.all([completed, failed, missed, last].map(input => tracker.trackEditStart(resource.fsPath, undefined, input)));
		await fileService.writeFile(resource, VSBuffer.fromString('first'));
		await tracker.completeEdit(resource.fsPath, completed);
		await tracker.takeCompletedEdit('turn-1', 'completed', resource.fsPath, 'edit', completed, 'model', false);
		// A tool that fails is taken without completing, and the completion of `missed` never arrives.
		const failedEdit = await tracker.takeCompletedEdit('turn-1', 'failed', resource.fsPath, 'edit', failed, 'model', false);
		await fileService.writeFile(resource, VSBuffer.fromString('last'));
		await tracker.completeEdit(resource.fsPath, last);
		await tracker.takeCompletedEdit('turn-1', 'last', resource.fsPath, 'edit', last, 'model', false);

		assert.deepStrictEqual({ failedEdit, last: await readRecordedEdit('last', resource.fsPath), editing: fileEditCoordinator.isEditing(resource) }, {
			failedEdit: undefined,
			last: 'first -> last',
			editing: false,
		});
	});

	test('tracks edit start and complete for existing file', async () => {
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('original content\nline 2'));

		await tracker.trackEditStart('/workspace/test.txt');
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('modified content\nline 2\nline 3'));
		await tracker.completeEdit('/workspace/test.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-1', '/workspace/test.txt', '', undefined, undefined, false);
		assert.ok(fileEdit);
		assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);
		assert.strictEqual(diffComputeService.callCount, 1);

		// URIs are parseable session-db: URIs
		const beforeFields = parseSessionDbUri(fileEdit.before!.content.uri);
		assert.ok(beforeFields);
		assert.strictEqual(beforeFields.sessionUri, 'copilot:/test-session');
		assert.strictEqual(beforeFields.toolCallId, 'tc-1');
		assert.strictEqual(beforeFields.filePath, '/workspace/test.txt');
		assert.strictEqual(beforeFields.part, 'before');

		const afterFields = parseSessionDbUri(fileEdit.after!.content.uri);
		assert.ok(afterFields);
		assert.strictEqual(afterFields.part, 'after');

		// Content is persisted in the database (wait for fire-and-forget write)
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-1', '/workspace/test.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original content\nline 2');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified content\nline 2\nline 3');
	});

	test('tracks edit for newly created file (no before content)', async () => {
		await tracker.trackEditStart('/workspace/new-file.txt');
		await fileService.writeFile(URI.file('/workspace/new-file.txt'), VSBuffer.fromString('new file\ncontent'));
		await tracker.completeEdit('/workspace/new-file.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-2', '/workspace/new-file.txt', '', undefined, undefined, false);
		assert.ok(fileEdit);

		// Wait for the fire-and-forget DB write to complete
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-2', '/workspace/new-file.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), '');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'new file\ncontent');
	});

	test('takeCompletedEdit returns undefined for unknown file path', async () => {
		const result = await tracker.takeCompletedEdit('turn-1', 'tc-x', '/nonexistent', '', undefined, undefined, false);
		assert.strictEqual(result, undefined);
	});

	test('acquires its own database reference after the owner is disposed during diff computation', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'file-edit-reference-'));
		const resource = URI.parse('copilot:/edit-reference');
		const dataService = new SessionDataService(URI.file(directory), fileService, new NullLogService());
		const owner = dataService.openDatabase(resource);
		const computing = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const compute = stub(diffComputeService, 'computeDiffCounts').callsFake(async () => {
			computing.complete();
			await release.p;
			return { added: 1, removed: 1, changes: [] };
		});
		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IFileService, fileService],
			[IAgentHostFileEditCoordinator, fileEditCoordinator],
			[ISessionDataService, dataService],
			[IDiffComputeService, diffComputeService],
			[IAgentEditAttributionService, new NullAgentEditAttributionService()],
			[IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory()],
			[IEditArcReporterService, new NullEditArcReporterService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, resource.toString(), () => resource.toString(), undefined));
		let processing: ReturnType<FileEditTracker['takeCompletedEdit']> | undefined;
		try {
			await owner.object.createTurn('turn-1');
			const path = '/workspace/reference.txt';
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('before'));
			await localTracker.trackEditStart(path);
			await fileService.writeFile(URI.file(path), VSBuffer.fromString('after'));
			await localTracker.completeEdit(path);
			processing = localTracker.takeCompletedEdit('turn-1', 'tc-reference', path, 'edit', undefined, 'model', false);
			await computing.p;
			owner.dispose();
			await owner.object.close();
			release.complete();
			await processing;
			const persisted = dataService.openDatabase(resource);
			try {
				const content = await persisted.object.readFileEditContent('tc-reference', path);
				assert.deepStrictEqual(content && {
					before: content.beforeContent && VSBuffer.wrap(content.beforeContent).toString(),
					after: content.afterContent && VSBuffer.wrap(content.afterContent).toString(),
				}, { before: 'before', after: 'after' });
			} finally {
				persisted.dispose();
				await persisted.object.close();
			}
		} finally {
			release.complete();
			await processing;
			owner.dispose();
			await owner.object.close();
			compute.restore();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('attaches Agent attribution marker to the file edit result', async () => {
		const services = new ServiceCollection();
		let arcReportCount = 0;
		let recordedEdit: IAgentEditAttribution | undefined;
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IAgentHostFileEditCoordinator, fileEditCoordinator);
		services.set(IDiffComputeService, new TestDiffComputeService());
		services.set(ISessionDataService, createSessionDataService(db));
		services.set(IAgentEditAttributionService, {
			_serviceBrand: undefined,
			setEnabled: () => { },
			recordEdit: async edit => {
				recordedEdit = edit;
				return {
					version: 1,
					editId: 'edit-1',
					sequence: 1,
					beforeDigest: createFileEditContentDigest(edit.beforeText),
					afterDigest: createFileEditContentDigest(edit.afterText),
				};
			},
			flushSession: async () => { },
			prepareFlush: async () => undefined,
			commitFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
			cancelFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
		});
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		services.set(IEditArcReporterService, {
			_serviceBrand: undefined,
			reportEdit: async () => { arcReportCount++; },
		});
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', undefined));
		await fileService.writeFile(URI.file('/workspace/marker.txt'), VSBuffer.fromString('before'));

		await localTracker.trackEditStart('/workspace/marker.txt');
		await fileService.writeFile(URI.file('/workspace/marker.txt'), VSBuffer.fromString('after'));
		await localTracker.completeEdit('/workspace/marker.txt');
		const chatUri = buildChatUri('copilot:/test-session', 'side');
		const result = await localTracker.takeCompletedEdit('turn-1', 'tc-marker', '/workspace/marker.txt', 'edit', undefined, 'model', false, undefined, chatUri);

		assert.deepStrictEqual({
			marker: result && getFileEditAttributionMarker(result),
			arcReportCount,
			sessionUri: recordedEdit?.sessionUri,
			chatUri: recordedEdit?.chatUri,
		}, {
			marker: {
				version: 1,
				editId: 'edit-1',
				sequence: 1,
				beforeDigest: createFileEditContentDigest('before'),
				afterDigest: createFileEditContentDigest('after'),
			},
			arcReportCount: 1,
			sessionUri: 'copilot:/test-session',
			chatUri,
		});
	});

	test('returns the file edit result when attribution fails', async () => {
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IAgentHostFileEditCoordinator, fileEditCoordinator);
		services.set(IDiffComputeService, new TestDiffComputeService());
		services.set(ISessionDataService, createSessionDataService(db));
		services.set(IAgentEditAttributionService, {
			_serviceBrand: undefined,
			setEnabled: () => { },
			recordEdit: async () => {
				throw new Error('Attribution failed');
			},
			flushSession: async () => { },
			prepareFlush: async () => undefined,
			commitFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
			cancelFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
		});
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		services.set(IEditArcReporterService, new NullEditArcReporterService());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', undefined));
		await fileService.writeFile(URI.file('/workspace/fallback.txt'), VSBuffer.fromString('before'));

		await localTracker.trackEditStart('/workspace/fallback.txt');
		await fileService.writeFile(URI.file('/workspace/fallback.txt'), VSBuffer.fromString('after'));
		await localTracker.completeEdit('/workspace/fallback.txt');
		const result = await localTracker.takeCompletedEdit('turn-1', 'tc-fallback', '/workspace/fallback.txt', 'edit', undefined, 'model', false);

		assert.deepStrictEqual({
			type: result?.type,
			marker: result && getFileEditAttributionMarker(result),
		}, {
			type: ToolResultContentType.FileEdit,
			marker: undefined,
		});
	});

	test('reuses the existing diff and does not wait for ARC reporting', async () => {
		const reportStarted = new DeferredPromise<IEditArcReporterLaunchParams>();
		const releaseReport = new DeferredPromise<void>();
		const services = new ServiceCollection();
		const localDiffComputeService = new TestDiffComputeService();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IAgentHostFileEditCoordinator, fileEditCoordinator);
		services.set(IDiffComputeService, localDiffComputeService);
		services.set(ISessionDataService, createSessionDataService(db));
		services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		services.set(IEditArcReporterService, {
			_serviceBrand: undefined,
			reportEdit: async params => {
				reportStarted.complete(params);
				await releaseReport.p;
			},
		});
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = disposables.add(instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', undefined));
		await fileService.writeFile(URI.file('/workspace/non-blocking.txt'), VSBuffer.fromString('before'));

		await localTracker.trackEditStart('/workspace/non-blocking.txt', 'plan');
		await fileService.writeFile(URI.file('/workspace/non-blocking.txt'), VSBuffer.fromString('after'));
		await localTracker.completeEdit('/workspace/non-blocking.txt');
		const resultPromise = localTracker.takeCompletedEdit('turn-1', 'tc-non-blocking', '/workspace/non-blocking.txt', 'apply_patch', undefined, 'model', false, undefined, undefined, 'hydrafusion-max', 'hydrafusion-max');
		const report = await reportStarted.p;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const completion = await Promise.race([
			resultPromise.then(() => 'complete' as const),
			new Promise<'timeout'>(resolve => {
				timeoutHandle = setTimeout(() => resolve('timeout'), 100);
			}),
		]);
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
		releaseReport.complete();
		const result = await resultPromise;

		assert.deepStrictEqual({
			completion,
			resultType: result?.type,
			diffCallCount: localDiffComputeService.callCount,
			detailedDiffCallCount: localDiffComputeService.detailedCallCount,
			initialEdit: report.initialEdit,
			mode: report.mode,
			autoTier: report.autoTier,
			fusionModel: report.fusionModel,
		}, {
			completion: 'complete',
			resultType: ToolResultContentType.FileEdit,
			diffCallCount: 1,
			detailedDiffCallCount: 0,
			initialEdit: {
				replacements: [{ start: 0, endExclusive: 6, text: 'after' }]
			},
			mode: 'plan',
			autoTier: 'hydrafusion-max',
			fusionModel: 'hydrafusion-max',
		});
	});

	test('Write to non-existent file records kind=create with removed=0', async () => {
		// When a file did not exist before the edit, the tracker clamps
		// `removed` to 0 (the differ otherwise reports 1 for an empty
		// before-content vs. a one-line after-content) and records
		// `kind=create` instead of `edit`. `added` is passed through
		// from the diff service unchanged.
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IAgentHostFileEditCoordinator, fileEditCoordinator);
		services.set(IDiffComputeService, new TestDiffComputeService({ added: 1, removed: 1, changes: [] }));
		services.set(ISessionDataService, createSessionDataService(db));
		services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		services.set(IEditArcReporterService, new NullEditArcReporterService());
		const inst: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = disposables.add(inst.createInstance(FileEditTracker, 'copilot:/test-session', () => 'copilot:/test-session', undefined));

		await localTracker.trackEditStart('/workspace/brand-new.txt');
		await fileService.writeFile(URI.file('/workspace/brand-new.txt'), VSBuffer.fromString('fresh'));
		await localTracker.completeEdit('/workspace/brand-new.txt');

		const fileEdit = await localTracker.takeCompletedEdit('turn-1', 'tc-create', '/workspace/brand-new.txt', '', undefined, undefined, false);
		assert.ok(fileEdit);

		const records = await db.getAllFileEdits();
		const created = records.find(r => r.toolCallId === 'tc-create');
		assert.deepStrictEqual({
			diff: fileEdit.diff,
			kind: created?.kind,
			addedLines: created?.addedLines,
			removedLines: created?.removedLines,
		}, {
			diff: { added: 1, removed: 0 },
			kind: 'create',
			addedLines: 1,
			removedLines: 0,
		});
	});

	test('before and after content can be read from database', async () => {
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('original'));

		await tracker.trackEditStart('/workspace/file.ts');
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('modified'));
		await tracker.completeEdit('/workspace/file.ts');

		await tracker.takeCompletedEdit('turn-1', 'tc-3', '/workspace/file.ts', '', undefined, undefined, false);

		const content = await db.readFileEditContent('tc-3', '/workspace/file.ts');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified');
	});
});
