/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { parseSessionDbUri } from '../../common/sessionDbUri.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { createFileEditDiscardRecord, createSessionFileEditDiscardRecords, FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX, getUndiscardedFileEditRevertSteps, readFileEditRevertSteps, spanFileEditRevertSteps } from '../../node/fileEditDiscard.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs } from '../../node/sessionDiffAggregator.js';
import { TestDiffComputeService } from '../common/sessionTestHelpers.js';

const SESSION = 'session://test-session';
const FILE = '/repo/file.ts';

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

/** Discards the turn's changes to {@link FILE} the way the discard handler records them. */
async function discardTurn(db: ISessionDatabase, turnId: string): Promise<void> {
	const records = (await db.getFileEditsByTurn(turnId)).filter(record => record.filePath === FILE);
	const steps = await readFileEditRevertSteps(db, records);
	await db.storeFileEdits([createFileEditDiscardRecord(records[0].turnId, FILE, spanFileEditRevertSteps(steps))]);
}

/**
 * Discards the session's changes to {@link FILE} the way the discard handler
 * records them, returning as text the edits it reverts on disk and the rows
 * it appends.
 */
async function discardSession(db: ISessionDatabase): Promise<{ reverted: { start: string | undefined; end: string | undefined }[]; rows: { turnId: string; before: string | undefined; after: string | undefined }[] }> {
	const records = (await db.getAllFileEdits()).filter(record => record.filePath === FILE);
	const steps = await readFileEditRevertSteps(db, records);
	const rows = createSessionFileEditDiscardRecords(records, steps);
	await db.storeFileEdits(rows);
	const decode = (bytes: Uint8Array | undefined) => bytes && new TextDecoder().decode(bytes);
	return {
		reverted: getUndiscardedFileEditRevertSteps(records, steps).map(step => ({ start: decode(step.start), end: decode(step.end) })),
		rows: rows.map(row => ({ turnId: row.turnId, before: decode(row.beforeContent), after: decode(row.afterContent) })),
	};
}

/** Reduces diffs to the text of their before and after snapshots. */
async function readDiffs(db: ISessionDatabase, diffs: readonly ISessionFileDiff[]): Promise<{ before: string | undefined; after: string | undefined }[]> {
	const read = async (contentUri: string | undefined, part: 'before' | 'after') => {
		const fields = contentUri ? parseSessionDbUri(contentUri) : undefined;
		if (!fields) {
			return undefined;
		}
		const content = await db.readFileEditContent(fields.toolCallId, fields.filePath);
		const bytes = part === 'before' ? content?.beforeContent : content?.afterContent;
		return bytes ? new TextDecoder().decode(bytes) : undefined;
	};
	return Promise.all(diffs.map(async diff => ({
		before: await read(diff.before?.content.uri, 'before'),
		after: await read(diff.after?.content.uri, 'after'),
	})));
}

suite('fileEditDiscard', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a discard row drops an edited file from its turn and ends the session diff at the turn start', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'v1', 'v2');
		await storeEdit(db, 't2', 'tc3', FileEditKind.Edit, 'v2', 'v3');
		const previousDiffs = await computeSessionDiffs(SESSION, db, diffService);

		await discardTurn(db, 't2');

		assert.deepStrictEqual({
			lastTurn: await readDiffs(db, await computeTurnDiffs(SESSION, db, diffService, 't2')),
			firstTurn: await readDiffs(db, await computeTurnDiffs(SESSION, db, diffService, 't1')),
			session: await readDiffs(db, await computeSessionDiffs(SESSION, db, diffService)),
			incrementalSession: await readDiffs(db, await computeSessionDiffs(SESSION, db, diffService, { changedTurnId: 't2', previousDiffs })),
			unionedSession: await readDiffs(db, await computeUnionedDiffs([{ sessionUri: SESSION, db }], diffService)),
			transcriptToolCalls: (await db.getFileEdits(['tc1', 'tc2', 'tc3'])).map(edit => edit.toolCallId),
		}, {
			lastTurn: [],
			firstTurn: [{ before: 'v0', after: 'v1' }],
			session: [{ before: 'v0', after: 'v1' }],
			incrementalSession: [{ before: 'v0', after: 'v1' }],
			unionedSession: [{ before: 'v0', after: 'v1' }],
			transcriptToolCalls: ['tc1', 'tc2', 'tc3'],
		});
	});

	test('a discard row drops a file that the turn created, deleted, or emptied', async () => {
		const diffService = new TestDiffComputeService();
		const results: Record<string, unknown> = {};
		const cases: Record<string, (db: ISessionDatabase) => Promise<void>> = {
			created: db => storeEdit(db, 't1', 'tc1', FileEditKind.Create, undefined, 'new'),
			deleted: db => storeEdit(db, 't1', 'tc1', FileEditKind.Delete, 'old', undefined),
			// The edit tracker records a file deleted by a tool as an edit to empty content.
			emptied: db => storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'old', ''),
		};
		for (const [name, store] of Object.entries(cases)) {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await store(db);
			await discardTurn(db, 't1');
			const discardRow = (await db.getFileEditsByTurn('t1')).at(-1)!;
			results[name] = {
				turn: await computeTurnDiffs(SESSION, db, diffService, 't1'),
				session: await computeSessionDiffs(SESSION, db, diffService),
				discardRowKind: discardRow.kind,
				discardRowPrefixed: discardRow.toolCallId.startsWith(FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX),
			};
		}

		assert.deepStrictEqual(results, {
			created: { turn: [], session: [], discardRowKind: FileEditKind.Delete, discardRowPrefixed: true },
			deleted: { turn: [], session: [], discardRowKind: FileEditKind.Create, discardRowPrefixed: true },
			emptied: { turn: [], session: [], discardRowKind: FileEditKind.Edit, discardRowPrefixed: true },
		});
	});

	test('a discard row belongs to the database turn and follows it through remapping and truncation', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const diffService = new TestDiffComputeService();
		await db.createTurn('request-1');
		await db.setTurnEventId('request-1', 'event-1');
		await storeEdit(db, 'request-1', 'tc1', FileEditKind.Edit, 'v0', 'v1');

		// Restored sessions address the turn changeset by the SDK event id.
		await discardTurn(db, 'event-1');
		const discardedTurn = await computeTurnDiffs(SESSION, db, diffService, 'event-1');
		await db.remapTurnIds(new Map([['request-1', 'request-2']]));
		const remappedTurnIds = (await db.getFileEditsByTurn('request-2')).map(edit => edit.turnId);
		await db.truncateFromTurn('request-2');

		assert.deepStrictEqual({
			discardedTurn,
			remappedTurnIds,
			afterTruncation: await db.getAllFileEdits(),
		}, {
			discardedTurn: [],
			remappedTurnIds: ['request-2', 'request-2'],
			afterTruncation: [],
		});
	});

	test('reads the content before and after each record, treating missing content as empty', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'a', 'b');
		// The user changed `b` to `B` between the two tool calls.
		await storeEdit(db, 't1', 'tc2', FileEditKind.Edit, 'B', undefined);
		await storeEdit(db, 't2', 'tc3', FileEditKind.Create, undefined, 'c');
		const decode = (bytes: Uint8Array | undefined) => bytes && new TextDecoder().decode(bytes);
		const describe = (steps: readonly { start: Uint8Array | undefined; end: Uint8Array | undefined }[]) => steps.map(step => ({ start: decode(step.start), end: decode(step.end) }));

		const edited = await readFileEditRevertSteps(db, await db.getFileEditsByTurn('t1'));
		const created = await readFileEditRevertSteps(db, await db.getFileEditsByTurn('t2'));

		assert.deepStrictEqual({
			edited: describe(edited),
			editedSpan: describe([spanFileEditRevertSteps(edited)]),
			created: describe(created),
		}, {
			edited: [{ start: 'a', end: 'b' }, { start: 'B', end: '' }],
			editedSpan: [{ start: 'a', end: '' }],
			created: [{ start: undefined, end: 'c' }],
		});
	});

	test('session discard rows drop the file from the session and every turn, including changes made between turns', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		// The user changed the file between the turns.
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'v1-user', 'v2');
		await storeEdit(db, 't2', 'tc3', FileEditKind.Edit, 'other-0', 'other-1', '/repo/other.ts');
		await storeEdit(db, 't3', 'tc4', FileEditKind.Edit, 'v2', 'v3');

		const { reverted, rows } = await discardSession(db);

		assert.deepStrictEqual({
			reverted,
			rows,
			session: await readDiffs(db, await computeSessionDiffs(SESSION, db, diffService)),
			turns: {
				t1: await readDiffs(db, await computeTurnDiffs(SESSION, db, diffService, 't1')),
				t2: await readDiffs(db, await computeTurnDiffs(SESSION, db, diffService, 't2')),
				t3: await readDiffs(db, await computeTurnDiffs(SESSION, db, diffService, 't3')),
			},
		}, {
			reverted: [
				{ start: 'v0', end: 'v1' },
				{ start: 'v1-user', end: 'v2' },
				{ start: 'v2', end: 'v3' },
			],
			// Newest turn first, so the last row restores the content before the session.
			rows: [
				{ turnId: 't3', before: 'v3', after: 'v2' },
				{ turnId: 't2', before: 'v2', after: 'v1-user' },
				{ turnId: 't1', before: 'v1', after: 'v0' },
			],
			session: [{ before: 'other-0', after: 'other-1' }],
			turns: {
				t1: [],
				t2: [{ before: 'other-0', after: 'other-1' }],
				t3: [],
			},
		});
	});

	test('a session discard reverts only undiscarded edits and folds earlier discard rows into their turns', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const diffService = new TestDiffComputeService();
		await storeEdit(db, 't1', 'tc1', FileEditKind.Edit, 'v0', 'v1');
		await storeEdit(db, 't2', 'tc2', FileEditKind.Edit, 'v1', 'v2');
		await discardTurn(db, 't2');
		await storeEdit(db, 't3', 'tc3', FileEditKind.Edit, 'v1', 'v3');
		await discardSession(db);
		// A later turn changes the file again, then the session's changes are discarded once more.
		await storeEdit(db, 't4', 'tc4', FileEditKind.Edit, 'v0', 'v4');

		const { reverted, rows } = await discardSession(db);

		assert.deepStrictEqual({
			reverted,
			rows,
			session: await computeSessionDiffs(SESSION, db, diffService),
			turns: await Promise.all(['t1', 't2', 't3', 't4'].map(turnId => computeTurnDiffs(SESSION, db, diffService, turnId))),
		}, {
			// Only the edit that no discard undid yet is reverted on disk.
			reverted: [{ start: 'v0', end: 'v4' }],
			// Rows of turns whose changes were already discarded change nothing, but are still written.
			rows: [
				{ turnId: 't4', before: 'v4', after: 'v0' },
				{ turnId: 't3', before: 'v1', after: 'v1' },
				{ turnId: 't2', before: 'v1', after: 'v1' },
				{ turnId: 't1', before: 'v0', after: 'v0' },
			],
			session: [],
			turns: [[], [], [], []],
		});
	});

	test('storeFileEdits appends rows in order and rolls back rejected writes', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const row = (turnId: string, filePath: string) => createFileEditDiscardRecord(turnId, filePath, { start: encode('a'), end: encode('b') });

		await db.storeFileEdits([row('t2', FILE), row('t1', FILE)]);
		const rejected = await db.storeFileEdits([row('t1', FILE), row('t1', '/repo/other.ts')]).then(() => false, () => true);
		let insertedBeforeCommit = 0;
		let contentBeforeCommit: { before: string; after: string } | undefined;
		const guardedRow = row('t3', FILE);
		const guardRejected = await db.storeFileEdits([guardedRow], async readContent => {
			insertedBeforeCommit = (await db.getAllFileEdits()).length;
			const content = await readContent(guardedRow.toolCallId, FILE);
			contentBeforeCommit = {
				before: new TextDecoder().decode(content?.beforeContent),
				after: new TextDecoder().decode(content?.afterContent),
			};
			throw new Error('state changed');
		}).then(() => false, () => true);

		assert.deepStrictEqual({
			turnIds: (await db.getAllFileEdits()).map(edit => edit.turnId),
			rejected,
			insertedBeforeCommit,
			contentBeforeCommit,
			guardRejected,
		}, {
			turnIds: ['t2', 't1'],
			rejected: true,
			insertedBeforeCommit: 3,
			contentBeforeCommit: { before: 'b', after: 'a' },
			guardRejected: true,
		});
	});

	test('a discard row records an edit from the end content back to the start content', () => {
		const row = createFileEditDiscardRecord('t1', FILE, { start: encode('a'), end: encode('b') });
		assert.deepStrictEqual({ ...row, toolCallId: row.toolCallId.startsWith(FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX) }, {
			turnId: 't1',
			toolCallId: true,
			filePath: FILE,
			kind: FileEditKind.Edit,
			beforeContent: encode('b'),
			afterContent: encode('a'),
			addedLines: undefined,
			removedLines: undefined,
		});
	});
});
