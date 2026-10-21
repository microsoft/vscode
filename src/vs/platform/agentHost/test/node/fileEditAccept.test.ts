/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { createFileEditAcceptRecord, FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX, getUnacceptedFileEditRecords, isFileEditAcceptRecord, readFileEditEndContent } from '../../node/fileEditAccept.js';
import { SessionDbResourceProvider } from '../../node/resourceProviders/sessionDbResourceProvider.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs, computeWorkingSetDiffs, type ISessionDiffSource } from '../../node/sessionDiffAggregator.js';
import { createSessionDataService, TestDiffComputeService } from '../common/sessionTestHelpers.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

const SESSION = 'session://test-session';
const PEER = 'session://test-peer';
const FILE = '/repo/file.ts';
const OTHER_FILE = '/repo/other.ts';

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

async function storeEdit(db: ISessionDatabase, turnId: string, toolCallId: string, kind: FileEditKind, before: string | undefined, after: string | undefined, filePath = FILE): Promise<void> {
	await db.storeFileEdit({
		turnId,
		toolCallId,
		filePath,
		kind,
		beforeContent: before === undefined ? undefined : encode(before),
		afterContent: after === undefined ? undefined : encode(after),
		addedLines: undefined,
		removedLines: undefined,
	});
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

	test('splits a file\'s records at its latest accept row into the unaccepted records and the accepted turns', () => {
		const record = (turnId: string, toolCallId: string) => ({ turnId, toolCallId, filePath: FILE, kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined });
		const acceptRecord = (turnId: string) => record(turnId, `${FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX}${turnId}`);
		const split = (records: ReturnType<typeof record>[]) => {
			const { records: unaccepted, acceptedTurns } = getUnacceptedFileEditRecords(records);
			return { unaccepted: unaccepted.map(unacceptedRecord => unacceptedRecord.toolCallId), acceptedTurns: [...acceptedTurns] };
		};

		assert.deepStrictEqual({
			neverAccepted: split([record('t1', 'tc1'), record('t2', 'tc2')]),
			acceptedTwice: split([record('t1', 'tc1'), acceptRecord('t1'), record('t2', 'tc2'), acceptRecord('t2'), record('t3', 'tc3')]),
			allAccepted: split([record('t1', 'tc1'), acceptRecord('t1')]),
		}, {
			neverAccepted: { unaccepted: ['tc1', 'tc2'], acceptedTurns: [] },
			acceptedTwice: { unaccepted: ['tc3'], acceptedTurns: ['t1', 't2'] },
			allAccepted: { unaccepted: [], acceptedTurns: ['t1'] },
		});
	});

	test('combines the working sets of several databases, counting an accept row a fork copied once', async () => {
		const session = disposables.add(await SessionDatabase.open(':memory:'));
		const peer = disposables.add(await SessionDatabase.open(':memory:'));
		const sources = [{ sessionUri: SESSION, db: session }, { sessionUri: PEER, db: peer }];
		const diffService = new TestDiffComputeService();
		await storeEdit(session, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await accept(session);
		// A forked chat's database starts as a copy of its parent's rows.
		for (const record of await session.getAllFileEdits()) {
			const content = await session.readFileEditContent(record.toolCallId, record.filePath);
			await peer.storeFileEdit({ ...record, ...content });
		}
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
			const child = disposables.add(await SessionDatabase.open(':memory:'));
			await storeEdit(parent, 't1', 'tc1', FileEditKind.Edit, lines(), lines({ 0: 'L1' }));
			// A forked chat's database starts as a copy of its parent's rows.
			for (const record of await parent.getAllFileEdits()) {
				await child.storeFileEdit({ ...record, ...await parent.readFileEditContent(record.toolCallId, record.filePath) });
			}
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
