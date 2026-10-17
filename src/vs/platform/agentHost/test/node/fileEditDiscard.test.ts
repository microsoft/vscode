/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { parseSessionDbUri } from '../../common/sessionDbUri.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { createFileEditDiscardRecord, FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX, readFileEditRevertSteps, spanFileEditRevertSteps } from '../../node/fileEditDiscard.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs } from '../../node/sessionDiffAggregator.js';
import { TestDiffComputeService } from '../common/sessionTestHelpers.js';

const SESSION = 'session://test-session';
const FILE = '/repo/file.ts';

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

async function storeEdit(db: ISessionDatabase, turnId: string, toolCallId: string, kind: FileEditKind, before: string | undefined, after: string | undefined): Promise<void> {
	await db.storeFileEdit({
		turnId,
		toolCallId,
		filePath: FILE,
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

	test('storeFileEdits appends rows in order and rolls back rejected writes', async () => {
		const db = disposables.add(await SessionDatabase.open(':memory:'));
		const row = (turnId: string, filePath: string) => createFileEditDiscardRecord(turnId, filePath, { start: encode('a'), end: encode('b') });

		await db.storeFileEdits([row('t2', FILE), row('t1', FILE)]);
		const rejected = await db.storeFileEdits([row('t1', FILE), row('t1', '/repo/other.ts')]).then(() => false, () => true);
		let insertedBeforeCommit = 0;
		const guardRejected = await db.storeFileEdits([row('t3', FILE)], async () => {
			insertedBeforeCommit = (await db.getAllFileEdits()).length;
			throw new Error('state changed');
		}).then(() => false, () => true);

		assert.deepStrictEqual({
			turnIds: (await db.getAllFileEdits()).map(edit => edit.turnId),
			rejected,
			insertedBeforeCommit,
			guardRejected,
		}, {
			turnIds: ['t2', 't1'],
			rejected: true,
			insertedBeforeCommit: 3,
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
