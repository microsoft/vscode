/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { createFileEditAcceptRecord, createPartialFileEditAcceptRecord, FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX, getUnacceptedFileEditRecords, isFileEditAcceptRecord, readFileEditEndContent } from '../../node/fileEditAccept.js';
import { SessionDbResourceProvider } from '../../node/resourceProviders/sessionDbResourceProvider.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs, computeWorkingSetDiffs, computeWorkingSetFiles, getWorkingSetFileNonce, type ISessionDiffSource } from '../../node/sessionDiffAggregator.js';
import { createSessionDataService, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

const SESSION = 'session://test-session';
const PEER = 'session://test-peer';
const FILE = '/repo/file.ts';
const OTHER_FILE = '/repo/other.ts';

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

async function storeEdit(db: ISessionDatabase, turnId: string, toolCallId: string, kind: FileEditKind, before: string | undefined, after: string | undefined, filePath = FILE, order?: number): Promise<void> {
	await db.storeFileEdit({
		turnId,
		toolCallId,
		filePath,
		kind,
		beforeContent: before === undefined ? undefined : encode(before),
		afterContent: after === undefined ? undefined : encode(after),
		addedLines: undefined,
		removedLines: undefined,
	}, order);
}

/** Accepts the changes to `filePath` the way the accept handler records them. */
async function accept(db: ISessionDatabase, filePath = FILE): Promise<void> {
	const last = (await db.getAllFileEdits()).filter(record => record.filePath === filePath).at(-1)!;
	await db.storeFileEdits([createFileEditAcceptRecord(last.turnId, filePath, await readFileEditEndContent(db, last))]);
}

/** Reduces diffs to their file and the text of their before and after snapshots, read like a client does, from the database each URI addresses. */
async function readDiffs(sources: readonly ISessionDiffSource[], diffs: readonly ISessionFileDiff[]): Promise<{ file: string | undefined; before: string | undefined; after: string | undefined }[]> {
	const databases = new Map(sources.map(source => [source.sessionUri, source.db]));
	const provider = new SessionDbResourceProvider({
		...createSessionDataService(),
		openDatabase: uri => ({ object: databases.get(uri.toString())!, dispose: () => { } }),
	}, new InProcessDiffComputeService());
	const read = async (contentUri: string | undefined) => contentUri ? (await provider.read(URI.parse(contentUri))).data : undefined;
	return Promise.all([...diffs].sort((a, b) => (a.after?.uri ?? a.before?.uri ?? '').localeCompare(b.after?.uri ?? b.before?.uri ?? '')).map(async diff => ({
		file: diff.after?.uri ?? diff.before?.uri,
		before: await read(diff.before?.content.uri),
		after: await read(diff.after?.content.uri),
	})));
}

/** Six lines, with the given zero-based lines replaced. */
function lines(changes: Record<number, string> = {}): string {
	return ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((line, index) => changes[index] ?? line).join('\n') + '\n';
}

suite('fileEditAccept', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const copies: { directory: string; db?: SessionDatabase }[] = [];

	teardown(async () => {
		for (const copy of copies.splice(0)) {
			await copy.db?.close();
			rmSync(copy.directory, { recursive: true, force: true });
		}
	});

	async function copyDatabase(source: SessionDatabase): Promise<SessionDatabase> {
		const copy: { directory: string; db?: SessionDatabase } = { directory: mkdtempSync(join(tmpdir(), 'file-edit-copy-')) };
		copies.push(copy);
		const path = join(copy.directory, 'session.db');
		await source.vacuumInto(path);
		copy.db = disposables.add(await SessionDatabase.open(path));
		return copy.db;
	}

	test('coalesces redundant dot segments while preserving exact historical snapshot keys', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const dotted = '/repo/./file.ts';
		await storeEdit(db, 't1', 'first', FileEditKind.Edit, 'original', 'first');
		await storeEdit(db, 't1', 'second', FileEditKind.Edit, 'first', 'second', dotted);
		const diffService = new InProcessDiffComputeService();
		const expected = [{ file: URI.file(FILE).toString(), before: 'original', after: 'second' }];
		assert.deepStrictEqual({
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
			paths: (await db.getAllFileEdits()).map(record => record.filePath),
			second: new TextDecoder().decode((await db.readFileEditContent('second', dotted))?.afterContent),
		}, { workingSet: expected, session: expected, paths: [FILE, dotted], second: 'second' });
	});

	(isLinux ? test.skip : test)('coalesces pre-existing case aliases without losing their ordered snapshots', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const alias = '/repo/FILE.ts';
		const diffService = new InProcessDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Create, undefined, 'first\n');
		await storeEdit(db, 't1', 'tc2', FileEditKind.Edit, 'first\n', 'second\n', alias);
		const beforeAccept = await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService));
		await accept(db, alias);

		assert.deepStrictEqual({
			beforeAccept,
			afterAccept: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			recorded: (await db.getAllFileEdits()).filter(record => !isFileEditAcceptRecord(record)).map(record => [record.toolCallId, record.filePath]),
		}, {
			beforeAccept: [{ file: URI.file(alias).toString(), before: undefined, after: 'second\n' }],
			afterAccept: [],
			recorded: [['tc1', FILE], ['tc2', alias]],
		});
	});

	(isLinux ? test.skip : test)('rebases old alias records from the same tool call and addresses their exact snapshots', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new InProcessDiffComputeService();
		const alias = '/repo/FILE.ts';
		await storeEdit(db, 't1', 'same-call', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
		const firstNonce = (await computeWorkingSetFiles(sources, diffService))[0].nonce;
		await storeEdit(db, 't1', 'same-call', FileEditKind.Edit, lines({ 0: 'L1', 2: 'user' }), lines({ 0: 'L1', 2: 'user', 5: 'L6' }), alias);
		const files = await computeWorkingSetFiles(sources, diffService);

		assert.deepStrictEqual({
			workingSet: await readDiffs(sources, files.map(file => file.diff)),
			nonceChanged: firstNonce !== files[0].nonce,
			records: (await db.getAllFileEdits()).map(record => [record.toolCallId, record.filePath]),
			blobs: await Promise.all([FILE, alias].map(async path => {
				const content = await db.readFileEditContent('same-call', path);
				return content?.afterContent && new TextDecoder().decode(content.afterContent);
			})),
		}, {
			workingSet: [{ file: URI.file(alias).toString(), before: lines({ 2: 'user' }), after: lines({ 0: 'L1', 2: 'user', 5: 'L6' }) }],
			nonceChanged: true,
			records: [['same-call', FILE], ['same-call', alias]],
			blobs: [lines({ 0: 'L1' }), lines({ 0: 'L1', 2: 'user', 5: 'L6' })],
		});
	});

	(isLinux ? test.skip : test)('uses the holding database order rather than source traversal order for alias history', async () => {
		const parent = disposables.add(await SessionDatabase.open(':memory:'));
		const alias = '/repo/FILE.ts';
		await storeEdit(parent, 't1', 'first', FileEditKind.Edit, 'original', 'first');
		const secondOrder = await parent.reserveFileEditOrder();
		await storeEdit(parent, 't1', 'third', FileEditKind.Edit, 'second', 'third');
		const holder = await copyDatabase(parent);
		await storeEdit(holder, 't1', 'second', FileEditKind.Edit, 'first', 'second', alias, secondOrder);
		const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: holder }];
		const files = await computeWorkingSetFiles(sources, new InProcessDiffComputeService());
		assert.deepStrictEqual({
			contents: await readDiffs(sources, files.map(file => file.diff)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, new InProcessDiffComputeService())),
			nonce: files[0].nonce,
		}, {
			contents: [{ file: URI.file(FILE).toString(), before: 'original', after: 'third' }],
			session: [{ file: URI.file(FILE).toString(), before: 'original', after: 'third' }],
			nonce: getWorkingSetFileNonce(await holder.getAllFileEdits()),
		});
	});

	test('a recreated path baseline excludes the identity renamed away from it', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		await storeEdit(db, 't1', 'old', FileEditKind.Edit, 'o\na\n', 'o\nm\n');
		await db.storeFileEdit({
			turnId: 't1', toolCallId: 'rename', filePath: OTHER_FILE, originalPath: FILE, kind: FileEditKind.Rename,
			beforeContent: encode('o\nm\n'), afterContent: encode('o\nm\n'), addedLines: undefined, removedLines: undefined,
		});
		await storeEdit(db, 't2', 'new', FileEditKind.Edit, 'o\nm\n', 'o\nM\n');
		await storeEdit(db, 't2', 'after-user-edit', FileEditKind.Edit, 'u\nM\n', 'u\nM\nadded\n');
		const files = await computeWorkingSetFiles(sources, new InProcessDiffComputeService());
		assert.deepStrictEqual(await readDiffs(sources, files.map(file => file.diff)), [
			{ file: URI.file(FILE).toString(), before: 'u\nm\n', after: 'u\nM\nadded\n' },
			{ file: URI.file(OTHER_FILE).toString(), before: 'o\na\n', after: 'o\nm\n' },
		]);
	});

	test('a working-set nonce changes when earlier history arrives or a cumulative snapshot is replaced', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new InProcessDiffComputeService();
		const first = await db.reserveFileEditOrder();
		const second = await db.reserveFileEditOrder();
		const row = (toolCallId: string, before: string, after: string) => ({
			turnId: 't1', toolCallId, filePath: FILE, kind: FileEditKind.Edit,
			beforeContent: encode(before), afterContent: encode(after), addedLines: undefined, removedLines: undefined,
		});
		await db.storeFileEdit(row('second', 'middle', 'final'), second);
		const initial = (await computeWorkingSetFiles(sources, diffService))[0].nonce;
		await db.storeFileEdit(row('first', 'original', 'middle'), first);
		const backfilled = (await computeWorkingSetFiles(sources, diffService))[0].nonce;
		await db.storeFileEdit(row('second', 'middle', 'new final'));
		const updated = (await computeWorkingSetFiles(sources, diffService))[0].nonce;
		assert.deepStrictEqual({ backfilled: initial !== backfilled, updated: backfilled !== updated }, { backfilled: true, updated: true });
	});

	for (const completeHolder of [false, true]) {
		test(`orders fork renames from shared history without guessing independent source order (complete holder: ${completeHolder})`, async () => {
			let parent = disposables.add(await SessionDatabase.open(':memory:'));
			const recreated = '/repo/FILE.ts';
			await storeEdit(parent, 't1', 'first', FileEditKind.Create, undefined, 'old');
			const fork = await copyDatabase(parent);
			await fork.storeFileEdit({
				turnId: 't2', toolCallId: 'rename', filePath: OTHER_FILE, originalPath: FILE, kind: FileEditKind.Rename,
				beforeContent: encode('old'), afterContent: encode('old'), addedLines: undefined, removedLines: undefined,
			});
			if (completeHolder) {
				await storeEdit(fork, 't3', 'recreated', FileEditKind.Create, undefined, 'new', recreated);
				parent = await copyDatabase(fork);
				await parent.deleteTurn('t2');
			} else {
				await storeEdit(parent, 't3', 'recreated', FileEditKind.Create, undefined, 'new', recreated);
			}
			const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
			const diffService = new InProcessDiffComputeService();
			// Without a shared ordering record, a same-path recreation keeps source precedence.
			const expected = [
				...(completeHolder || isLinux ? [{ file: URI.file(recreated).toString(), before: undefined, after: 'new' }] : []),
				{ file: URI.file(OTHER_FILE).toString(), before: undefined, after: 'old' },
			];
			assert.deepStrictEqual({
				workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
				session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
			}, { workingSet: expected, session: expected });
		});
	}

	test('an untracked deletion and recreation precede a later independent rename', async () => {
		const fileService = createInMemoryFileService(disposables, Schemas.file);
		const parent = disposables.add(await SessionDatabase.open(':memory:'));
		await fileService.writeFile(URI.file(FILE), VSBuffer.fromString('old\n'));
		await storeEdit(parent, 't1', 'first', FileEditKind.Create, undefined, 'old\n');
		const fork = await copyDatabase(parent);
		await fileService.del(URI.file(FILE));
		await fileService.writeFile(URI.file(FILE), VSBuffer.fromString('new\n'));
		await storeEdit(parent, 't2', 'recreated', FileEditKind.Create, undefined, 'new\n');
		await fileService.move(URI.file(FILE), URI.file(OTHER_FILE));
		await fork.storeFileEdit({
			turnId: 't3', toolCallId: 'rename', filePath: OTHER_FILE, originalPath: FILE, kind: FileEditKind.Rename,
			beforeContent: encode('new\n'), afterContent: encode('new\n'), addedLines: undefined, removedLines: undefined,
		});
		const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
		const diffService = new InProcessDiffComputeService();
		const expected = [{ file: URI.file(OTHER_FILE).toString(), before: undefined, after: 'new\n' }];
		assert.deepStrictEqual({
			originalExists: await fileService.exists(URI.file(FILE)),
			renamedContent: (await fileService.readFile(URI.file(OTHER_FILE))).value.toString(),
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
		}, { originalExists: false, renamedContent: 'new\n', workingSet: expected, session: expected });
	});

	test('conflicting copied revisions fail explicitly instead of dropping records', async () => {
		const createDatabase = () => disposables.add(new class extends TestSessionDatabase {
			override async getAllFileEdits() {
				return (await super.getAllFileEdits()).map(record => ({ ...record, editRevision: record.toolCallId }));
			}
		}());
		const first = createDatabase();
		const second = createDatabase();
		for (const [db, calls] of [[first, ['a', 'b']], [second, ['b', 'a']]] as const) {
			for (const call of calls) {
				await storeEdit(db, 'turn', call, FileEditKind.Edit, 'before', call);
			}
		}
		await assert.rejects(computeWorkingSetFiles([{ sessionUri: SESSION, db: first }, { sessionUri: PEER, db: second }], new InProcessDiffComputeService()),
			/Could not determine the order of the recorded file changes across chats/);
		assert.deepStrictEqual(await Promise.all([first, second].map(async db => (await db.getAllFileEdits()).map(record => record.toolCallId))), [['a', 'b'], ['b', 'a']]);
	});

	for (const [hasForkEdit, replacement] of [[false, 'none'], [true, 'none'], [true, 'before'], [true, 'after']] as const) {
		test(`reconciles a replaced parent snapshot with its forked copy after reload (fork edit: ${hasForkEdit}, differing copy: ${replacement})`, async () => {
			const directory = mkdtempSync(join(tmpdir(), 'file-edit-fork-'));
			const parentPath = join(directory, 'parent.db');
			const forkPath = join(directory, 'fork.db');
			const original = lines();
			const parentAfter = lines({ 0: 'parent' });
			const childAfter = lines({ 0: 'parent', 5: 'child' });
			let parent = disposables.add(await SessionDatabase.open(parentPath));
			let fork: SessionDatabase | undefined;
			try {
				await storeEdit(parent, 't1', 'a', FileEditKind.Edit, original, lines({ 0: 'first' }));
				await storeEdit(parent, 't1', 'b', FileEditKind.Edit, 'b0', 'b1', OTHER_FILE);
				await parent.vacuumInto(forkPath);
				fork = disposables.add(await SessionDatabase.open(forkPath));
				await storeEdit(parent, 't1', 'a', FileEditKind.Edit, original, parentAfter);
				if (replacement !== 'none') {
					await storeEdit(fork, 't1', 'a', FileEditKind.Edit,
						replacement === 'before' ? parentAfter : original,
						replacement === 'before' ? parentAfter : lines({ 1: 'fork' }));
				}
				await storeEdit(fork, 't2', 'unrelated', FileEditKind.Edit, 'u0', 'u1', '/repo/unrelated.ts');
				if (hasForkEdit) {
					await storeEdit(fork, 't2', 'follow-up', FileEditKind.Edit, parentAfter, childAfter);
				}
				await Promise.all([parent.close(), fork.close()]);
				parent = disposables.add(await SessionDatabase.open(parentPath));
				fork = disposables.add(await SessionDatabase.open(forkPath));
				const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
				const diffService = new InProcessDiffComputeService();
				const expected = [
					{ file: URI.file(FILE).toString(), before: original, after: hasForkEdit ? childAfter : parentAfter },
					{ file: URI.file(OTHER_FILE).toString(), before: 'b0', after: 'b1' },
					{ file: URI.file('/repo/unrelated.ts').toString(), before: 'u0', after: 'u1' },
				];
				assert.deepStrictEqual({
					workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
					session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
					parentOrder: (await parent.getAllFileEdits()).map(record => record.toolCallId),
					forkOrder: (await fork.getAllFileEdits()).map(record => record.toolCallId),
				}, { workingSet: expected, session: expected, parentOrder: ['b', 'a'], forkOrder: [...(replacement !== 'none' ? ['b', 'a'] : ['a', 'b']), 'unrelated', ...(hasForkEdit ? ['follow-up'] : [])] });
			} finally {
				await Promise.all([parent.close(), fork?.close()]);
				rmSync(directory, { recursive: true, force: true });
			}
		});
	}

	test('requires copied snapshots only for files within the requested folder scope', async () => {
		const parent = disposables.add(new TestSessionDatabase());
		const fork = disposables.add(new class extends TestSessionDatabase {
			override async readFileEditContent(toolCallId: string, filePath: string) {
				return toolCallId === 'a' ? undefined : super.readFileEditContent(toolCallId, filePath);
			}
		}());
		for (const db of [parent, fork]) {
			await storeEdit(db, 't1', 'a', FileEditKind.Edit, 'original', 'parent');
		}
		await storeEdit(fork, 't2', 'b', FileEditKind.Edit, 'parent', 'child');
		const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
		const diffService = new InProcessDiffComputeService();
		await assert.rejects(computeWorkingSetFiles(sources, diffService), /Could not read a recorded file change while comparing chat histories/);
		assert.deepStrictEqual(await computeWorkingSetFiles(sources, diffService, [URI.file('/elsewhere')]), []);
	});

	for (const [identicalSnapshot, legacy] of [[false, false], [true, false], [false, true], [true, true]]) {
		test(`a late fork refresh cannot reorder the authoritative snapshot (identical bytes: ${identicalSnapshot}, legacy: ${legacy})`, async () => {
			const parent = legacy ? disposables.add(new TestSessionDatabase()) : disposables.add(await SessionDatabase.open(':memory:'));
			await storeEdit(parent, 't1', 'a', FileEditKind.Edit, 'original', 'old');
			await storeEdit(parent, 't1', 'b', FileEditKind.Edit, 'b0', 'b1', OTHER_FILE);
			const fork = parent instanceof SessionDatabase ? await copyDatabase(parent) : disposables.add(new TestSessionDatabase());
			if (legacy) {
				for (const record of await parent.getAllFileEdits()) {
					await fork.storeFileEdit({ ...record, ...await parent.readFileEditContent(record.toolCallId, record.filePath) });
				}
			}
			await storeEdit(parent, 't2', 'p', FileEditKind.Edit, 'p0', 'p1', '/repo/unrelated.ts');
			await storeEdit(parent, 't1', 'a', FileEditKind.Edit, 'original', 'parent');
			await storeEdit(fork, 't2', 'x', FileEditKind.Edit, 'parent', 'child');
			await storeEdit(fork, 't1', 'a', FileEditKind.Edit, 'original', identicalSnapshot ? 'parent' : 'old');
			const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
			const diffService = new InProcessDiffComputeService();
			const expected = [
				{ file: URI.file(FILE).toString(), before: 'original', after: 'child' },
				{ file: URI.file(OTHER_FILE).toString(), before: 'b0', after: 'b1' },
				{ file: URI.file('/repo/unrelated.ts').toString(), before: 'p0', after: 'p1' },
			];
			assert.deepStrictEqual({
				session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
				workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			}, { session: expected, workingSet: expected });
		});
	}

	test('drains earlier diff work when copied snapshot verification fails', async () => {
		const firstReadStarted = new DeferredPromise<void>();
		const firstReadFinished = new DeferredPromise<void>();
		const releaseFirstRead = new DeferredPromise<void>();
		const copyReadStarted = new DeferredPromise<void>();
		const releaseCopyRead = new DeferredPromise<void>();
		let activeReads = 0;
		const parent = disposables.add(new class extends TestSessionDatabase {
			override async readFileEditContent(toolCallId: string, filePath: string) {
				if (toolCallId === 'a') {
					activeReads++;
					firstReadStarted.complete();
					await releaseFirstRead.p;
					activeReads--;
					firstReadFinished.complete();
				}
				return super.readFileEditContent(toolCallId, filePath);
			}
		}());
		const fork = disposables.add(new class extends TestSessionDatabase {
			override async readFileEditContent(toolCallId: string, filePath: string) {
				if (toolCallId === 'b') {
					copyReadStarted.complete();
					await releaseCopyRead.p;
					return undefined;
				}
				return super.readFileEditContent(toolCallId, filePath);
			}
		}());
		await storeEdit(parent, 't1', 'a', FileEditKind.Edit, 'a0', 'a1');
		await storeEdit(parent, 't1', 'b', FileEditKind.Edit, 'b0', 'b1', OTHER_FILE);
		await fork.reserveFileEditOrder();
		await storeEdit(fork, 't1', 'b', FileEditKind.Edit, 'b0', 'b1', OTHER_FILE);
		await storeEdit(fork, 't2', 'c', FileEditKind.Edit, 'b1', 'b2', OTHER_FILE);
		let settled = false;
		const result = computeWorkingSetFiles([{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }], new InProcessDiffComputeService())
			.then(() => { settled = true; return ''; }, error => { settled = true; return error.message; });
		try {
			await copyReadStarted.p;
			releaseCopyRead.complete();
			// Drain the controlled in-memory promise chain while the first read stays blocked.
			await timeout(0);
			const abandonedRead = settled && activeReads > 0;
			releaseFirstRead.complete();
			const error = await result;
			if (firstReadStarted.isSettled) {
				await firstReadFinished.p;
			}
			assert.deepStrictEqual({ abandonedRead, activeReads, error }, {
				abandonedRead: false,
				activeReads: 0,
				error: 'Could not read a recorded file change while comparing chat histories.',
			});
		} finally {
			releaseCopyRead.complete();
			releaseFirstRead.complete();
			await result;
			if (firstReadStarted.isSettled) {
				await firstReadFinished.p;
			}
		}
	});

	test('does not prioritize an independent rename before an initial creation', async () => {
		const creator = disposables.add(await SessionDatabase.open(':memory:'));
		const renamer = disposables.add(await SessionDatabase.open(':memory:'));
		await storeEdit(creator, 't1', 'create', FileEditKind.Create, undefined, 'content');
		await renamer.storeFileEdit({
			turnId: 't2', toolCallId: 'rename', filePath: OTHER_FILE, originalPath: FILE, kind: FileEditKind.Rename,
			beforeContent: encode('content'), afterContent: encode('content'), addedLines: undefined, removedLines: undefined,
		});
		const sources = [{ sessionUri: SESSION, db: creator }, { sessionUri: PEER, db: renamer }];
		const diffService = new InProcessDiffComputeService();
		const expected = [{ file: URI.file(OTHER_FILE).toString(), before: undefined, after: 'content' }];
		assert.deepStrictEqual({
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
		}, { workingSet: expected, session: expected });
	});

	test('a recorded deletion makes recreation precede an independent rename', async () => {
		const parent = disposables.add(await SessionDatabase.open(':memory:'));
		await storeEdit(parent, 't1', 'first', FileEditKind.Create, undefined, 'old');
		const fork = await copyDatabase(parent);
		await storeEdit(parent, 't2', 'delete', FileEditKind.Delete, 'old', undefined);
		await storeEdit(parent, 't3', 'recreate', FileEditKind.Create, undefined, 'new');
		await fork.storeFileEdit({
			turnId: 't4', toolCallId: 'rename', filePath: OTHER_FILE, originalPath: FILE, kind: FileEditKind.Rename,
			beforeContent: encode('new'), afterContent: encode('new'), addedLines: undefined, removedLines: undefined,
		});
		const sources = [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: fork }];
		const diffService = new InProcessDiffComputeService();
		const expected = [{ file: URI.file(OTHER_FILE).toString(), before: undefined, after: 'new' }];
		assert.deepStrictEqual({
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
		}, { workingSet: expected, session: expected });
	});

	(isLinux ? test.skip : test)('stores an alias batch atomically without replacing same-call rows', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const alias = '/repo/FILE.ts';
		const row = (filePath: string, text: string) => ({
			turnId: 't1', toolCallId: 'same-call', filePath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined, beforeContent: encode(text), afterContent: encode(text),
		});
		await db.storeFileEdits([row(FILE, 'first'), row(alias, 'second')]);
		await assert.rejects(db.storeFileEdits([row(FILE, 'changed'), row(alias, 'changed')], async read => {
			assert.strictEqual(new TextDecoder().decode((await read('same-call', FILE))?.afterContent), 'changed');
			throw new Error('abort batch');
		}), /abort batch/);
		assert.deepStrictEqual(await Promise.all((await db.getAllFileEdits()).map(async record => [
			record.filePath, new TextDecoder().decode((await db.readFileEditContent(record.toolCallId, record.filePath))?.afterContent),
		])), [[FILE, 'first'], [alias, 'second']]);
	});

	test('an accept row starts the working set at the accepted content, and the other changesets ignore it', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'v1', 'v2');
		const previousDiffs = await computeSessionDiffs(SESSION, db, diffService);
		const beforeAccept = await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService));

		await accept(db);
		const afterAccept = await computeWorkingSetDiffs(sources, diffService);
		await storeEdit(db, 't3', 'tc3', FileEditKind.Edit, 'v2', 'v3');

		const rows = await db.getAllFileEdits();
		assert.deepStrictEqual({
			beforeAccept,
			afterAccept,
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeSessionDiffs(SESSION, db, diffService)),
			incrementalSession: await readDiffs(sources, await computeSessionDiffs(SESSION, db, diffService, { changedTurnId: 't2', previousDiffs })),
			unionedSession: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
			acceptedTurn: await readDiffs(sources, await computeTurnDiffs(SESSION, db, diffService, 't2')),
			acceptRow: { turnId: rows[2].turnId, kind: rows[2].kind, prefixed: rows[2].toolCallId.startsWith(FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX) },
			isAcceptRecord: rows.map(isFileEditAcceptRecord),
		}, {
			beforeAccept: [{ file: 'file:///repo/file.ts', before: 'v0', after: 'v2' }],
			afterAccept: [],
			workingSet: [{ file: 'file:///repo/file.ts', before: 'v2', after: 'v3' }],
			session: [{ file: 'file:///repo/file.ts', before: 'v0', after: 'v3' }],
			incrementalSession: [{ file: 'file:///repo/file.ts', before: 'v0', after: 'v3' }],
			unionedSession: [{ file: 'file:///repo/file.ts', before: 'v0', after: 'v3' }],
			acceptedTurn: [{ file: 'file:///repo/file.ts', before: 'v1', after: 'v2' }],
			acceptRow: { turnId: 't2', kind: FileEditKind.Edit, prefixed: true },
			isAcceptRecord: [false, false, true, false],
		});
	});

	test('accepting a created, deleted, or emptied file empties the working set until the file changes again', async () => {
		const diffService = new TestDiffComputeService();
		const results: Record<string, unknown> = {};
		const cases: Record<string, { readonly edit: (db: ISessionDatabase) => Promise<void>; readonly change: (db: ISessionDatabase) => Promise<void> }> = {
			created: {
				edit: db => storeEdit(db, 't1', 'tc1', FileEditKind.Create, undefined, 'new'),
				change: db => storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'new', 'newer'),
			},
			deleted: {
				edit: db => storeEdit(db, 't1', 'tc1', FileEditKind.Delete, 'old', undefined),
				change: db => storeEdit(db, 't2', 'tc2', FileEditKind.Create, undefined, 'recreated'),
			},
			// The edit tracker records a file deleted by a tool as an edit to empty content.
			emptied: {
				edit: db => storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'old', ''),
				change: db => storeEdit(db, 't2', 'tc2', FileEditKind.Edit, '', 'refilled'),
			},
		};
		for (const [name, { edit, change }] of Object.entries(cases)) {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const sources = [{ sessionUri: SESSION, db }];
			await edit(db);
			await accept(db);
			const acceptRow = (await db.getAllFileEdits()).at(-1)!;
			const afterAccept = await computeWorkingSetDiffs(sources, diffService);
			await change(db);
			const diffs = await computeWorkingSetDiffs(sources, diffService);
			results[name] = {
				acceptRowKind: acceptRow.kind,
				afterAccept,
				afterChange: await readDiffs(sources, diffs),
				afterChangeCounts: diffs.map(diff => diff.diff),
			};
		}

		assert.deepStrictEqual(results, {
			created: {
				acceptRowKind: FileEditKind.Edit,
				afterAccept: [],
				afterChange: [{ file: 'file:///repo/file.ts', before: 'new', after: 'newer' }],
				afterChangeCounts: [{ added: 0, removed: 0 }],
			},
			deleted: {
				acceptRowKind: FileEditKind.Delete,
				afterAccept: [],
				afterChange: [{ file: 'file:///repo/file.ts', before: undefined, after: 'recreated' }],
				afterChangeCounts: [{ added: 1, removed: 0 }],
			},
			emptied: {
				acceptRowKind: FileEditKind.Edit,
				afterAccept: [],
				afterChange: [{ file: 'file:///repo/file.ts', before: '', after: 'refilled' }],
				afterChangeCounts: [{ added: 1, removed: 0 }],
			},
		});
	});

	test('an accept row belongs to the turn of the edit it accepts and is truncated with it', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await accept(db);
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'v1', 'v2');
		await accept(db);
		await storeEdit(db, 't3', 'tc3', FileEditKind.Edit, 'v2', 'v3');

		const workingSet = async () => readDiffs(sources, await computeWorkingSetDiffs(sources, diffService));
		const beforeTruncation = await workingSet();
		await db.truncateFromTurn('t3');
		const withoutLastTurn = await workingSet();
		await db.truncateFromTurn('t2');
		const withFirstTurn = await workingSet();
		await db.storeFileEdit({ turnId: 't2', toolCallId: 'tc4', filePath: FILE, kind: FileEditKind.Edit, beforeContent: encode('v1'), afterContent: encode('v4'), addedLines: undefined, removedLines: undefined });

		assert.deepStrictEqual({
			beforeTruncation,
			withoutLastTurn,
			withFirstTurn,
			afterNewEdit: await workingSet(),
		}, {
			beforeTruncation: [{ file: 'file:///repo/file.ts', before: 'v2', after: 'v3' }],
			withoutLastTurn: [],
			withFirstTurn: [],
			afterNewEdit: [{ file: 'file:///repo/file.ts', before: 'v1', after: 'v4' }],
		});
	});

	test('an edit rewritten after it was accepted, as Codex rewrites its turn diffs, shows again in full', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'codex-turn-diff:t1', FileEditKind.Edit, 'v0', 'v1');
		await accept(db);
		const afterAccept = await computeWorkingSetDiffs(sources, diffService);
		await storeEdit(db, 't1', 'codex-turn-diff:t1', FileEditKind.Edit, 'v0', 'v2');

		assert.deepStrictEqual({
			afterAccept,
			// The rewritten row starts at the turn's start, which reads as the file going back to it outside of the records.
			afterRewrite: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
		}, {
			afterAccept: [],
			afterRewrite: [{ file: 'file:///repo/file.ts', before: 'v0', after: 'v2' }],
		});
	});

	test('moves changes made between recorded edits into the baseline, so the working set only shows recorded changes', async () => {
		const diffService = new InProcessDiffComputeService();
		const results: Record<string, unknown> = {};
		const cases: Record<string, (db: ISessionDatabase) => Promise<void>> = {
			accepted: async db => {
				await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
				await accept(db);
				// The user changes the third line, then the sixth, between the next edits.
				await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'L1', 2: 'U3' }), lines({ 0: 'L1', 2: 'U3', 4: 'L5' }));
				await storeEdit(db, 't3', 'tc3', FileEditKind.Edit, lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'U6' }), lines({ 0: 'L1', 1: 'L2', 2: 'U3', 4: 'L5', 5: 'U6' }));
			},
			neverAccepted: async db => {
				await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
				await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'L1', 2: 'U3' }), lines({ 0: 'L1', 2: 'U3', 4: 'L5' }));
			},
			// A change to the lines of an edit that isn't accepted can't be told apart from it.
			overlapping: async db => {
				await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
				await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'U1' }), lines({ 0: 'U1', 4: 'L5' }));
			},
			// Without unaccepted edits, everything the user changed belongs to the baseline.
			afterAccepting: async db => {
				await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
				await accept(db);
				await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'U1' }), lines({ 0: 'U1', 4: 'L5' }));
			},
		};
		for (const [name, arrange] of Object.entries(cases)) {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const sources = [{ sessionUri: SESSION, db }];
			await arrange(db);
			const workingSet = await computeWorkingSetDiffs(sources, diffService);
			results[name] = {
				workingSet: await readDiffs(sources, workingSet),
				counts: workingSet.map(diff => diff.diff),
				session: await readDiffs(sources, await computeSessionDiffs(SESSION, db, diffService)),
			};
		}

		const file = 'file:///repo/file.ts';
		assert.deepStrictEqual(results, {
			accepted: {
				workingSet: [{ file, before: lines({ 0: 'L1', 2: 'U3', 5: 'U6' }), after: lines({ 0: 'L1', 1: 'L2', 2: 'U3', 4: 'L5', 5: 'U6' }) }],
				counts: [{ added: 2, removed: 2 }],
				// Session Changes still compare the first and last snapshots.
				session: [{ file, before: lines(), after: lines({ 0: 'L1', 1: 'L2', 2: 'U3', 4: 'L5', 5: 'U6' }) }],
			},
			neverAccepted: {
				workingSet: [{ file, before: lines({ 2: 'U3' }), after: lines({ 0: 'L1', 2: 'U3', 4: 'L5' }) }],
				counts: [{ added: 2, removed: 2 }],
				session: [{ file, before: lines(), after: lines({ 0: 'L1', 2: 'U3', 4: 'L5' }) }],
			},
			overlapping: {
				workingSet: [{ file, before: lines(), after: lines({ 0: 'U1', 4: 'L5' }) }],
				counts: [{ added: 2, removed: 2 }],
				session: [{ file, before: lines(), after: lines({ 0: 'U1', 4: 'L5' }) }],
			},
			afterAccepting: {
				workingSet: [{ file, before: lines({ 0: 'U1' }), after: lines({ 0: 'U1', 4: 'L5' }) }],
				counts: [{ added: 1, removed: 1 }],
				session: [{ file, before: lines(), after: lines({ 0: 'U1', 4: 'L5' }) }],
			},
		});
	});

	test('a partial accept row starts the working set at the accepted content, keeping the other changes in it', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db }];
		const diffService = new InProcessDiffComputeService();
		const workingSet = async () => readDiffs(sources, await computeWorkingSetDiffs(sources, diffService));
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1', 4: 'L5' }));
		// Only the change to the first line is accepted.
		await db.storeFileEdits([createPartialFileEditAcceptRecord('t1', FILE, encode(lines({ 0: 'L1' })), encode(lines({ 0: 'L1', 4: 'L5' })))]);
		const afterPartialAccept = await workingSet();
		// The user changes the third line before the next edit.
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'L1', 2: 'U3', 4: 'L5' }), lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' }));
		const afterEdit = await workingSet();
		const session = await readDiffs(sources, await computeSessionDiffs(SESSION, db, diffService));
		const firstTurn = await readDiffs(sources, await computeTurnDiffs(SESSION, db, diffService, 't1'));
		await accept(db);

		const file = 'file:///repo/file.ts';
		assert.deepStrictEqual({ afterPartialAccept, afterEdit, session, firstTurn, afterAccept: await workingSet() }, {
			afterPartialAccept: [{ file, before: lines({ 0: 'L1' }), after: lines({ 0: 'L1', 4: 'L5' }) }],
			afterEdit: [{ file, before: lines({ 0: 'L1', 2: 'U3' }), after: lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' }) }],
			session: [{ file, before: lines(), after: lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' }) }],
			firstTurn: [{ file, before: lines(), after: lines({ 0: 'L1', 4: 'L5' }) }],
			afterAccept: [],
		});
	});

	test('splits a file\'s records at its latest accept row into the unaccepted records and the accepted turns', async () => {
		const record = (turnId: string, toolCallId: string) => ({ turnId, toolCallId, filePath: FILE, kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined });
		const acceptRecord = (turnId: string) => record(turnId, `${FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX}${turnId}`);
		// Only the accept row of `t-partial` accepted some of the changes, so its content differs from the content then.
		const db = { readFileEditContent: async (toolCallId: string) => ({ beforeContent: encode('accepted'), afterContent: encode(toolCallId.endsWith('t-partial') ? 'current' : 'accepted') }) };
		const split = async (records: ReturnType<typeof record>[]) => {
			const { records: unaccepted, acceptedTurns } = await getUnacceptedFileEditRecords(db, records);
			return { unaccepted: unaccepted.map(unacceptedRecord => unacceptedRecord.toolCallId), acceptedTurns: [...acceptedTurns] };
		};

		assert.deepStrictEqual({
			neverAccepted: await split([record('t1', 'tc1'), record('t2', 'tc2')]),
			acceptedTwice: await split([record('t1', 'tc1'), acceptRecord('t1'), record('t2', 'tc2'), acceptRecord('t2'), record('t3', 'tc3')]),
			allAccepted: await split([record('t1', 'tc1'), acceptRecord('t1')]),
			partiallyAccepted: await split([record('t1', 'tc1'), acceptRecord('t-partial'), record('t2', 'tc2')]),
		}, {
			neverAccepted: { unaccepted: ['tc1', 'tc2'], acceptedTurns: [] },
			acceptedTwice: { unaccepted: ['tc3'], acceptedTurns: ['t1', 't2'] },
			allAccepted: { unaccepted: [], acceptedTurns: ['t1'] },
			partiallyAccepted: { unaccepted: [`${FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX}t-partial`, 'tc2'], acceptedTurns: ['t1'] },
		});
	});

	test('combines the working sets of several databases, counting an accept row a fork copied once', async () => {
		const session = disposables.add(await SessionDatabase.open(':memory:'));
		const diffService = new TestDiffComputeService();
		await storeEdit(session, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await accept(session);
		const peer = await copyDatabase(session);
		const sources = [{ sessionUri: SESSION, db: session }, { sessionUri: PEER, db: peer }];
		await storeEdit(peer, 'p1', 'tc2', FileEditKind.Edit, 'o0', 'o1', OTHER_FILE);

		assert.deepStrictEqual({
			workingSet: await readDiffs(sources, await computeWorkingSetDiffs(sources, diffService)),
			session: await readDiffs(sources, await computeUnionedDiffs(sources, diffService)),
		}, {
			workingSet: [{ file: 'file:///repo/other.ts', before: 'o0', after: 'o1' }],
			session: [
				{ file: 'file:///repo/file.ts', before: 'v0', after: 'v1' },
				{ file: 'file:///repo/other.ts', before: 'o0', after: 'o1' },
			],
		});
	});

	test('shows the parent\'s edits after a forked chat accepted a file, and moves outside changes into the baseline only when one database holds every record', async () => {
		const diffService = new TestDiffComputeService();
		const fork = async () => {
			const parent = disposables.add(await SessionDatabase.open(':memory:'));
			await storeEdit(parent, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
			const child = await copyDatabase(parent);
			await accept(child);
			return { parent, child, sources: [{ sessionUri: SESSION, db: parent }, { sessionUri: PEER, db: child }] };
		};
		const workingSet = async (sources: ISessionDiffSource[]) => readDiffs(sources, await computeWorkingSetDiffs(sources, diffService));

		// The parent changes the file after the fork accepted it.
		const parentEdited = await fork();
		await storeEdit(parentEdited.parent, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'L1' }), lines({ 0: 'L1', 1: 'P2' }));
		// Then the fork changes it too, after the parent's change.
		const bothEdited = await fork();
		await storeEdit(bothEdited.parent, 't2', 'tc2', FileEditKind.Edit, lines({ 0: 'L1' }), lines({ 0: 'L1', 1: 'P2' }));
		await storeEdit(bothEdited.child, 'c1', 'tc3', FileEditKind.Edit, lines({ 0: 'L1', 1: 'P2' }), lines({ 0: 'L1', 1: 'P2', 4: 'C5' }));
		// Only the fork changes it, after the user changed it outside of the session.
		const forkEdited = await fork();
		await storeEdit(forkEdited.child, 'c1', 'tc3', FileEditKind.Edit, lines({ 0: 'L1', 2: 'U3' }), lines({ 0: 'L1', 2: 'U3', 4: 'C5' }));

		assert.deepStrictEqual({
			parentEdited: await workingSet(parentEdited.sources),
			bothEdited: await workingSet(bothEdited.sources),
			forkEdited: await workingSet(forkEdited.sources),
		}, {
			parentEdited: [{ file: 'file:///repo/file.ts', before: lines({ 0: 'L1' }), after: lines({ 0: 'L1', 1: 'P2' }) }],
			bothEdited: [{ file: 'file:///repo/file.ts', before: lines({ 0: 'L1' }), after: lines({ 0: 'L1', 1: 'P2', 4: 'C5' }) }],
			forkEdited: [{ file: 'file:///repo/file.ts', before: lines({ 0: 'L1', 2: 'U3' }), after: lines({ 0: 'L1', 2: 'U3', 4: 'C5' }) }],
		});
	});
});
