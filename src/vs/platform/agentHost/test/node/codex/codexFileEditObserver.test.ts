/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { InstantiationService } from '../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { IDiffComputeService } from '../../../common/diffComputeService.js';
import { IAgentEditAttributionService, NullAgentEditAttributionService } from '../../../common/fileEditAttribution.js';
import { FileEditKind } from '../../../common/state/sessionState.js';
import { parseCodexApplyPatch } from '../../../node/codex/codexApplyPatch.js';
import { CodexFileEditObserver } from '../../../node/codex/codexFileEditObserver.js';
import { SessionDatabase } from '../../../node/sessionDatabase.js';
import { IEditArcReporterService, NullEditArcReporterService } from '../../../node/shared/editArcReporter.js';
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from '../../../node/shared/editSurvivalReporter.js';
import { extractAiChunks } from '../../../node/shared/editChunkExtractor.js';
import { TestDiffComputeService } from '../../common/sessionTestHelpers.js';

suite('CodexFileEditObserver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let database: SessionDatabase;
	let files: FileService;
	let provider: InMemoryFileSystemProvider;
	let observer: CodexFileEditObserver;
	const cwd = URI.file('/workspace').fsPath;
	const path = join(cwd, 'existing.txt');
	const patch = ['*** Begin Patch', '*** Update File: existing.txt', '@@', '-before', '+after', '*** End Patch'].join('\n');
	const input = (toolCallId = 'patch') => ({ phase: 'pre' as const, threadId: 'thread', turnId: 'native-turn', toolCallId, cwd, model: 'model', patch, toolName: 'apply_patch' as const });
	const context = { turnId: 'host-turn', chatUri: 'codex:/owner/chat', isSubagent: false };

	setup(async () => {
		const lifetime = store.add(new DisposableStore());
		files = lifetime.add(new FileService(new NullLogService()));
		provider = lifetime.add(new InMemoryFileSystemProvider());
		lifetime.add(files.registerProvider(Schemas.file, provider));
		database = lifetime.add(await SessionDatabase.open(':memory:'));
		const services = new ServiceCollection(
			[IFileService, files], [ILogService, new NullLogService()],
			[IDiffComputeService, new TestDiffComputeService()],
			[IAgentEditAttributionService, new NullAgentEditAttributionService()],
			[IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory()],
			[IEditArcReporterService, new NullEditArcReporterService()],
		);
		const instantiation = lifetime.add(new InstantiationService(services));
		observer = lifetime.add(instantiation.createInstance(CodexFileEditObserver, 'codex:/storage', () => 'codex:/owner', { object: database, dispose: () => { } }));
		await files.writeFile(URI.file(path), VSBuffer.fromString('before'));
	});

	test('snapshots before execution and completes only after the post hook', async () => {
		await observer.start(input(), context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('after'));
		let completed = false;
		const result = observer.takeResult('patch', true)!;
		void result.then(() => { completed = true; });
		await Promise.resolve();
		assert.strictEqual(completed, false);
		await observer.complete('patch');
		const content = await result;
		const bytes = await database.readFileEditContent('patch', path);
		assert.deepStrictEqual({
			count: content.length,
			before: bytes?.beforeContent && VSBuffer.wrap(bytes.beforeContent).toString(),
			after: bytes?.afterContent && VSBuffer.wrap(bytes.afterContent).toString(),
			record: (await database.getFileEdits(['patch'])).map(record => ({ turnId: record.turnId, kind: record.kind, filePath: record.filePath })),
		}, {
			count: 1, before: 'before', after: 'after',
			record: [{ turnId: 'host-turn', kind: FileEditKind.Edit, filePath: path }],
		});
	});

	test('tracks create, delete and move operations including empty creations', async () => {
		const patch = ['*** Begin Patch', '*** Add File: empty.txt', '*** Delete File: delete.txt', '*** Update File: existing.txt', '*** Move to: moved.txt', '@@', '-before', '+after', '*** End Patch'].join('\n');
		await files.writeFile(URI.file(join(cwd, 'delete.txt')), VSBuffer.fromString('delete'));
		await observer.start({ ...input(), patch }, context);
		await files.writeFile(URI.file(join(cwd, 'empty.txt')), VSBuffer.fromString(''));
		await files.del(URI.file(join(cwd, 'delete.txt')));
		await files.move(URI.file(path), URI.file(join(cwd, 'moved.txt')));
		await files.writeFile(URI.file(join(cwd, 'moved.txt')), VSBuffer.fromString('after'));
		await observer.complete('patch');
		const edits = await observer.takeResult('patch', true)!;
		assert.deepStrictEqual(edits.map(edit => ({
			before: edit.before?.uri, after: edit.after?.uri,
		})), [
			{ before: undefined, after: URI.file(join(cwd, 'empty.txt')).toString() },
			{ before: URI.file(join(cwd, 'delete.txt')).toString(), after: undefined },
			{ before: URI.file(path).toString(), after: URI.file(join(cwd, 'moved.txt')).toString() },
		]);
		assert.deepStrictEqual((await database.getFileEdits(['patch'])).map(edit => ({ kind: edit.kind, originalPath: edit.originalPath })), [
			{ kind: FileEditKind.Create, originalPath: undefined },
			{ kind: FileEditKind.Delete, originalPath: undefined },
			{ kind: FileEditKind.Rename, originalPath: path },
		]);
	});

	test('isolates concurrent tool snapshots for the same file', async () => {
		await observer.start(input('first'), context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('intermediate'));
		await observer.start(input('second'), context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('after'));
		await Promise.all([observer.complete('first'), observer.complete('second')]);
		const first = await database.readFileEditContent('first', path);
		const second = await database.readFileEditContent('second', path);
		assert.deepStrictEqual([first, second].map(edit => edit?.beforeContent && VSBuffer.wrap(edit.beforeContent).toString()), ['before', 'intermediate']);
	});

	test('finishes a failed no-op without recording an edit', async () => {
		await observer.start(input(), context);
		assert.deepStrictEqual(await observer.takeResult('patch', false), []);
		assert.deepStrictEqual(await database.getFileEdits(['patch']), []);
	});

	test('finishes shell-intercepted patches from file-change completion without a post hook', async () => {
		await observer.start({ ...input(), toolName: 'Bash' }, context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('after'));
		const edits = await observer.takeResult('patch', true);
		assert.deepStrictEqual({ files: edits?.length, records: (await database.getFileEdits(['patch'])).length }, { files: 1, records: 1 });
	});

	test('turn completion preserves an in-flight after snapshot for a shell patch', async () => {
		await observer.start({ ...input(), toolName: 'Bash' }, context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('after'));
		const entered = new DeferredPromise<void>();
		const barrier = new DeferredPromise<void>();
		provider.readFile = async () => {
			await entered.complete();
			await barrier.p;
			return VSBuffer.fromString('after').buffer;
		};
		const result = observer.takeResult('patch', true);
		await entered.p;
		observer.endTurn('native-turn');
		await barrier.complete();
		assert.strictEqual((await result)?.length, 1);
	});

	test('turn cancellation releases a staged completion without a post hook', async () => {
		await observer.start(input(), context);
		const result = observer.takeResult('patch', true);
		observer.endTurn('native-turn');
		assert.deepStrictEqual(await result, []);
		await observer.complete('patch');
		assert.deepStrictEqual(await database.getFileEdits(['patch']), []);
	});

	test('keeps the original content when a patch adds a file over an existing one', async () => {
		await observer.start({ ...input(), patch: '*** Begin Patch\n*** Add File: existing.txt\n+after\n*** End Patch' }, context);
		await files.writeFile(URI.file(path), VSBuffer.fromString('after'));
		await observer.complete('patch');
		const [edit] = await observer.takeResult('patch', true)!;
		const bytes = await database.readFileEditContent('patch', path);
		assert.deepStrictEqual({
			before: edit.before?.uri,
			kind: (await database.getFileEdits(['patch'])).map(record => record.kind),
			beforeContent: bytes?.beforeContent && VSBuffer.wrap(bytes.beforeContent).toString(),
		}, { before: URI.file(path).toString(), kind: [FileEditKind.Edit], beforeContent: 'before' });
	});

	test('does not report a failed move as a completed rename', async () => {
		await observer.start({ ...input(), patch: '*** Begin Patch\n*** Update File: existing.txt\n*** Move to: moved.txt\n@@\n-before\n+after\n*** End Patch' }, context);
		assert.deepStrictEqual(await observer.takeResult('patch', false), []);
		assert.deepStrictEqual(await database.getFileEdits(['patch']), []);
	});

	test('does not invent before snapshots when a user hook changes patch targets', async () => {
		await observer.start(input(), context);
		await observer.complete('patch', patch.replace('existing.txt', 'different.txt'));
		assert.deepStrictEqual(await observer.takeResult('patch', true), []);
		assert.deepStrictEqual(await database.getFileEdits(['patch']), []);
	});

	test('awaits the before snapshot', async () => {
		const barrier = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		provider.readFile = async () => {
			await entered.complete();
			await barrier.p;
			return VSBuffer.fromString('before').buffer;
		};
		let started = false;
		const start = observer.start(input(), context).then(() => { started = true; });
		await entered.p;
		assert.strictEqual(started, false);
		await barrier.complete();
		await start;
	});

	test('normalizes relative and moved patch paths for chunk extraction', () => {
		const parsed = parseCodexApplyPatch(['*** Begin Patch', '*** Update File: existing.txt', '*** Move to: moved.txt', '@@', '+after', '*** End Patch', ''].join('\r\n'), cwd);
		assert.deepStrictEqual({
			files: parsed.files,
			chunks: extractAiChunks('apply_patch', parsed.patch, join(cwd, 'moved.txt')),
		}, {
			files: [{ path: join(cwd, 'moved.txt'), originalPath: path, kind: FileEditKind.Rename }],
			chunks: ['after\n'],
		});
		assert.ok(parsed.patch.includes(`*** Move to: ${join(cwd, 'moved.txt')}`));
		assert.throws(() => parseCodexApplyPatch('not a patch', cwd), /envelope/);
	});
});
