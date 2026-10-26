/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ITrackedEditSource } from '../../common/agentHostChangesetService.js';
import { buildSessionChangesetUri, buildWorkingSetChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { ChangesetOperationTargetKind } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, FileEditKind, MessageKind, SessionStatus, type TextRange } from '../../common/state/sessionState.js';
import { AgentHostAcceptChangesOperationHandler } from '../../node/agentHostAcceptChangesOperationHandler.js';
import { AgentHostAcceptChangesOperationContribution } from '../../node/agentHostAcceptChangesOperationProvider.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { getWorkingSetFileEditRecords, isFileEditAcceptRecord } from '../../node/fileEditAccept.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { computeWorkingSetDiffs } from '../../node/sessionDiffAggregator.js';
import { computeWorkingSetFileContents } from '../../node/workingSetFileContents.js';
import { createNoopChangesetService, TestDiffComputeService } from '../common/sessionTestHelpers.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

const SESSION = 'agent:/session';
const FILE = URI.file('/repo/src/file.ts');
const OTHER_FILE = URI.file('/repo/src/other.ts');

/** Runs a callback just before storing edits, standing in for an edit recorded while the handler reads the file's rows. */
class RacingSessionDatabase extends SessionDatabase {
	beforeStore: (() => Promise<void>) | undefined;

	override async storeFileEdits(edits: readonly (IFileEditRecord & IFileEditContent)[], beforeCommit?: (readContent: ISessionDatabase['readFileEditContent']) => Promise<void> | void): Promise<void> {
		const beforeStore = this.beforeStore;
		this.beforeStore = undefined;
		await beforeStore?.();
		return super.storeFileEdits(edits, beforeCommit);
	}
}

function storeEdit(db: ISessionDatabase, turnId: string, toolCallId: string, resource: URI, kind: FileEditKind, before: string | undefined, after: string | undefined): Promise<void> {
	return db.storeFileEdit({
		turnId,
		toolCallId,
		filePath: resource.fsPath,
		kind,
		beforeContent: before === undefined ? undefined : new TextEncoder().encode(before),
		afterContent: after === undefined ? undefined : new TextEncoder().encode(after),
		addedLines: undefined,
		removedLines: undefined,
	});
}

function setup(disposables: Pick<DisposableStore, 'add'>) {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const chat = buildDefaultChatUri(SESSION);
	stateManager.createSession({
		resource: SESSION,
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectories: [URI.file('/repo').toString()],
		defaultChat: chat,
	});
	const db = disposables.add(new RacingSessionDatabase(':memory:'));
	const tracked: { sources: ITrackedEditSource[]; otherChatDatabases: ISessionDatabase[]; folderScope: readonly URI[] | undefined } = {
		sources: [{ chat, storage: SESSION, db }],
		otherChatDatabases: [],
		folderScope: [URI.file('/repo')],
	};
	const accepted: string[] = [];
	const changesets = createNoopChangesetService();
	changesets.openTrackedSessionDatabases = () => ({ ...tracked, workingDirectories: [URI.file('/repo').toString()], dispose: () => { } });
	changesets.onFileEditsAccepted = owner => { accepted.push(owner); };
	const diffService = new InProcessDiffComputeService();
	const handler = new AgentHostAcceptChangesOperationHandler(new NullLogService(), stateManager, changesets, diffService);
	const invoke = (resource: URI | undefined, channel = buildWorkingSetChangesetUri(SESSION), range?: IRangeTarget, nonce?: string) => handler.invoke({
		channel,
		operationId: AgentHostAcceptChangesOperationHandler.OPERATION_ACCEPT_CHANGES,
		target: !resource ? undefined : {
			resource: resource.toString(),
			...(range ? { kind: ChangesetOperationTargetKind.Range, ...range } : { kind: ChangesetOperationTargetKind.Resource }),
			...(nonce !== undefined ? { nonce } : {}),
		},
	}, CancellationToken.None);
	const workingSet = async () => {
		const diffs = await computeWorkingSetDiffs(tracked.sources.map(source => ({ sessionUri: source.storage, db: source.db })), new TestDiffComputeService(), tracked.folderScope);
		return diffs.map(diff => diff.after?.uri ?? diff.before?.uri).sort();
	};
	/** The text of the file's Working Set baseline and current content. */
	const contents = async (resource = FILE) => {
		const records = (await db.getAllFileEdits()).filter(record => record.filePath === resource.fsPath);
		const { baseline, current } = await computeWorkingSetFileContents(db, getWorkingSetFileEditRecords(records), diffService);
		const decode = (bytes: Uint8Array | undefined) => bytes && new TextDecoder().decode(bytes);
		return { baseline: decode(baseline), current: decode(current) };
	};
	const rows = async () => (await db.getAllFileEdits()).map(record => isFileEditAcceptRecord(record) ? `accept:${record.turnId}:${record.kind}` : record.toolCallId);
	return { stateManager, chat, db, tracked, accepted, invoke, workingSet, contents, rows };
}

interface IRangeTarget {
	readonly range: TextRange;
	readonly side?: 'before' | 'after';
}

/** A range on the zero-based lines from `start` through `end`. */
function lineRange(start: number, end = start): TextRange {
	return { start: { line: start, character: 0 }, end: { line: end, character: 2 } };
}

/** Six lines, with the given zero-based lines replaced. */
function lines(changes: Record<number, string> = {}): string {
	return ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((line, index) => changes[index] ?? line).join('\n') + '\n';
}

async function toError(promise: Promise<unknown>): Promise<{ code: number; message: string } | undefined> {
	try {
		await promise;
		return undefined;
	} catch (err) {
		assert.ok(err instanceof ProtocolError, `Expected a ProtocolError: ${err}`);
		return { code: err.code, message: err.message };
	}
}

suite('AgentHostAcceptChangesOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts a file at its last recorded content, leaving it out of the working set until it changes again', async () => {
		const { db, chat, accepted, invoke, workingSet, rows } = setup(disposables);
		await storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v1');
		await storeEdit(db, 't2', 'tc2', FILE, FileEditKind.Edit, 'v1', 'v2');
		await storeEdit(db, 't2', 'tc3', OTHER_FILE, FileEditKind.Delete, 'gone', undefined);
		const before = await workingSet();

		const result = await invoke(FILE);
		const afterAccept = { workingSet: await workingSet(), rows: await rows() };
		const again = await invoke(FILE);
		const afterRepeat = await rows();
		await invoke(OTHER_FILE);
		const afterDeletion = await workingSet();
		await storeEdit(db, 't3', 'tc4', FILE, FileEditKind.Edit, 'v2', 'v3');

		assert.deepStrictEqual({
			before,
			result,
			afterAccept,
			again,
			afterRepeat,
			afterDeletion,
			afterNewEdit: await workingSet(),
			accepted,
		}, {
			before: [FILE.toString(), OTHER_FILE.toString()],
			result: { message: { markdown: 'Accepted the changes to `file.ts`.' } },
			afterAccept: { workingSet: [OTHER_FILE.toString()], rows: ['tc1', 'tc2', 'tc3', 'accept:t2:edit'] },
			// The file is unchanged since it was accepted, so nothing is recorded.
			again: { message: { markdown: 'Accepted the changes to `file.ts`.' } },
			afterRepeat: ['tc1', 'tc2', 'tc3', 'accept:t2:edit'],
			afterDeletion: [],
			afterNewEdit: [FILE.toString()],
			accepted: [chat, chat],
		});
	});

	test('accepts a file whose rows a forked chat copied from its parent, in the session and in the fork', async () => {
		const fork = buildChatUri(SESSION, 'fork');
		const arrange = async () => {
			const context = setup(disposables);
			context.stateManager.addChat(SESSION, fork, creationTimeChatStorageResource(SESSION, fork, context.chat), {});
			const forkDb = disposables.add(await SessionDatabase.open(':memory:'));
			await storeEdit(context.db, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v1');
			// The fork's database starts as a copy of its parent's rows.
			await storeEdit(forkDb, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v1');
			return { ...context, forkDb };
		};
		const acceptRows = async (db: ISessionDatabase) => (await db.getAllFileEdits()).filter(isFileEditAcceptRecord).length;

		const inSession = await arrange();
		inSession.tracked.sources.push({ chat: fork, storage: fork, db: inSession.forkDb });
		await inSession.invoke(FILE);

		const inFork = await arrange();
		inFork.tracked.sources = [{ chat: fork, storage: fork, db: inFork.forkDb }];
		inFork.tracked.otherChatDatabases.push(inFork.db);
		await inFork.invoke(FILE, buildWorkingSetChangesetUri(fork));

		assert.deepStrictEqual({
			inSession: { session: await acceptRows(inSession.db), fork: await acceptRows(inSession.forkDb), workingSet: await inSession.workingSet(), accepted: inSession.accepted },
			inFork: { session: await acceptRows(inFork.db), fork: await acceptRows(inFork.forkDb), workingSet: await inFork.workingSet(), accepted: inFork.accepted },
		}, {
			inSession: { session: 1, fork: 0, workingSet: [], accepted: [inSession.chat] },
			inFork: { session: 0, fork: 1, workingSet: [], accepted: [fork] },
		});
	});

	test('accepts the hunks that a range touches, leaving the other changes in the working set', async () => {
		const { db, chat, accepted, invoke, contents, rows } = setup(disposables);
		await storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Edit, lines(), lines({ 0: 'L1', 4: 'L5' }));

		const result = await invoke(FILE, undefined, { range: lineRange(4) });
		const afterRange = { contents: await contents(), rows: await rows() };
		// The remaining hunk, addressed on the baseline's side, is every change that is left.
		await invoke(FILE, undefined, { range: lineRange(0), side: 'before' });
		const afterRest = { contents: await contents(), rows: await rows() };
		// Without changes, accepting a range records nothing.
		await invoke(FILE, undefined, { range: lineRange(0) });

		assert.deepStrictEqual({ result, afterRange, afterRest, afterRepeat: await rows(), accepted }, {
			result: { message: { markdown: 'Accepted the changes to `file.ts`.' } },
			afterRange: { contents: { baseline: lines({ 4: 'L5' }), current: lines({ 0: 'L1', 4: 'L5' }) }, rows: ['tc1', 'accept:t1:edit'] },
			afterRest: { contents: { baseline: lines({ 0: 'L1', 4: 'L5' }), current: lines({ 0: 'L1', 4: 'L5' }) }, rows: ['tc1', 'accept:t1:edit', 'accept:t1:edit'] },
			afterRepeat: ['tc1', 'accept:t1:edit', 'accept:t1:edit'],
			accepted: [chat, chat],
		});
	});

	test('accepts every change to a file after accepting some of them', async () => {
		const { db, invoke, contents, rows } = setup(disposables);
		await storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Edit, lines(), lines({ 0: 'L1', 4: 'L5' }));
		await invoke(FILE, undefined, { range: lineRange(0) });

		await invoke(FILE);

		assert.deepStrictEqual({ contents: await contents(), rows: await rows() }, {
			contents: { baseline: lines({ 0: 'L1', 4: 'L5' }), current: lines({ 0: 'L1', 4: 'L5' }) },
			rows: ['tc1', 'accept:t1:edit', 'accept:t1:edit'],
		});
	});

	test('rejects a range of changes that can\'t be split into hunks, or that touches none of them, without recording anything', async () => {
		const cases: Record<string, (db: ISessionDatabase) => Promise<void>> = {
			created: db => storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Create, undefined, lines()),
			deleted: db => storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Delete, lines(), undefined),
			notText: db => db.storeFileEdit({ turnId: 't1', toolCallId: 'tc1', filePath: FILE.fsPath, kind: FileEditKind.Edit, beforeContent: new Uint8Array([0xff, 0x01]), afterContent: new Uint8Array([0xff, 0x02]), addedLines: undefined, removedLines: undefined }),
			noChangeInRange: db => storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Edit, lines(), lines({ 0: 'L1' })),
		};
		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const context = setup(disposables);
			await arrange(context.db);
			results[name] = { error: await toError(context.invoke(FILE, undefined, { range: lineRange(3) })), rows: await context.rows() };
		}

		const wholeFileOnly = { error: { code: JsonRpcErrorCodes.InvalidParams, message: `Changes to 'file.ts' can only be accepted for the whole file.` }, rows: ['tc1'] };
		assert.deepStrictEqual(results, {
			created: wholeFileOnly,
			deleted: wholeFileOnly,
			notText: wholeFileOnly,
			noChangeInRange: { error: { code: JsonRpcErrorCodes.InvalidParams, message: `'file.ts' has no changes to accept in the given range.` }, rows: ['tc1'] },
		});
	});

	test('rejects requests that cannot be accepted without recording anything', async () => {
		const cases: Record<string, (context: ReturnType<typeof setup>) => Promise<{ readonly target?: URI | null; readonly channel?: string }>> = {
			notWorkingSet: async () => ({ channel: buildSessionChangesetUri(SESSION) }),
			missingTarget: async () => ({ target: null }),
			fileNotInSession: async () => ({ target: URI.file('/repo/src/unknown.ts') }),
			outsideFolderScope: async ({ tracked }) => { tracked.folderScope = [URI.file('/elsewhere')]; return {}; },
			renamed: async ({ db }) => {
				await db.storeFileEdit({ turnId: 't2', toolCallId: 'tc-rename', filePath: URI.file('/repo/src/renamed.ts').fsPath, originalPath: FILE.fsPath, kind: FileEditKind.Rename, addedLines: undefined, removedLines: undefined });
				return {};
			},
			// The session's Working Set can't order one chat's acceptance against another chat's edits.
			changedBySeveralChats: async ({ tracked }) => {
				const peer = disposables.add(await SessionDatabase.open(':memory:'));
				await storeEdit(peer, 'p1', 'ptc1', FILE, FileEditKind.Edit, 'v1', 'v9');
				const peerChat = buildChatUri(SESSION, 'peer');
				tracked.sources.push({ chat: peerChat, storage: peerChat, db: peer });
				return {};
			},
			editedByAnotherChat: async ({ tracked }) => {
				const peer = disposables.add(await SessionDatabase.open(':memory:'));
				await storeEdit(peer, 'p1', 'ptc1', FILE, FileEditKind.Edit, 'v1', 'v9');
				tracked.otherChatDatabases.push(peer);
				return {};
			},
			editedWhileAccepting: async ({ db }) => {
				db.beforeStore = () => storeEdit(db, 't3', 'tc-late', FILE, FileEditKind.Edit, 'v1', 'v2');
				return {};
			},
			rewrittenWhileAccepting: async ({ db }) => {
				db.beforeStore = () => storeEdit(db, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v2');
				return {};
			},
		};
		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const context = setup(disposables);
			await storeEdit(context.db, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v1');
			const { target, channel } = await arrange(context);
			const error = await toError(context.invoke(target === null ? undefined : target ?? FILE, channel));
			results[name] = { error, accepted: context.accepted, acceptRows: (await context.rows()).filter(row => row.startsWith('accept:')) };
		}

		const rejected = (message: string) => ({ error: { code: JsonRpcErrorCodes.InvalidParams, message }, accepted: [], acceptRows: [] });
		assert.deepStrictEqual(results, {
			notWorkingSet: rejected(`Not a working set changeset URI: ${buildSessionChangesetUri(SESSION)}`),
			missingTarget: rejected(`Operation 'accept-changes' requires a resource or range target.`),
			fileNotInSession: rejected(`'unknown.ts' has no changes to accept.`),
			outsideFolderScope: rejected(`'file.ts' has no changes to accept.`),
			renamed: rejected(`Changes to a renamed file can't be accepted.`),
			changedBySeveralChats: rejected(`Changes to 'file.ts' can't be accepted because another chat in this session also changed it.`),
			editedByAnotherChat: rejected(`Changes to 'file.ts' can't be accepted because another chat in this session also changed it.`),
			editedWhileAccepting: rejected(`'file.ts' changed while its changes were being accepted. Try again.`),
			rewrittenWhileAccepting: rejected(`'file.ts' changed while its changes were being accepted. Try again.`),
		});
	});

	test('checks supplied nonces while accepting omitted nonces during a turn', async () => {
		const results: Record<string, unknown> = {};
		const run = async (name: string, arrange: (context: ReturnType<typeof setup>) => Promise<string | undefined>) => {
			const context = setup(disposables);
			await storeEdit(context.db, 't1', 'tc1', FILE, FileEditKind.Edit, 'v0', 'v1');
			context.stateManager.dispatchServerAction(context.chat, { type: ActionType.ChatTurnStarted, turnId: 't2', startedAt: new Date(1).toISOString(), message: { text: 'Edit', origin: { kind: MessageKind.User } } });
			const nonce = await arrange(context);
			const error = await toError(context.invoke(FILE, undefined, undefined, nonce));
			results[name] = { error, accepted: context.accepted.length, rows: await context.rows() };
		};
		const publish = ({ stateManager }: ReturnType<typeof setup>, nonce: string) => {
			const channel = buildWorkingSetChangesetUri(SESSION);
			stateManager.registerChangeset(channel);
			stateManager.dispatchServerAction(channel, {
				type: ActionType.ChangesetFileSet,
				file: { id: FILE.toString(), edit: { after: { uri: FILE.toString(), content: { uri: FILE.toString() } } }, nonce },
			});
		};
		const recordLaterEdit = ({ db }: ReturnType<typeof setup>) => storeEdit(db, 't2', 'tc2', FILE, FileEditKind.Edit, 'v1', 'v2');

		await run('omittedNonce', async () => undefined);
		await run('namedNonce', async () => 'tc1');
		await run('namedNonceAfterLaterEdit', async context => { await recordLaterEdit(context); return 'tc1'; });
		await run('namedNonceChangesBeforeCommit', async context => { context.db.beforeStore = () => recordLaterEdit(context); return 'tc1'; });
		await run('publishedNonce', async context => { publish(context, 'tc1'); return undefined; });
		await run('publishedNonceAfterLaterEdit', async context => { publish(context, 'tc1'); await recordLaterEdit(context); return undefined; });
		await run('publishedLatestNonce', async context => { await recordLaterEdit(context); publish(context, 'tc2'); return undefined; });

		const stale = { code: AhpErrorCodes.Conflict, message: `The changes to 'file.ts' were updated after they were shown. Try again.` };
		assert.deepStrictEqual(results, {
			omittedNonce: { error: undefined, accepted: 1, rows: ['tc1', 'accept:t1:edit'] },
			namedNonce: { error: undefined, accepted: 1, rows: ['tc1', 'accept:t1:edit'] },
			namedNonceAfterLaterEdit: { error: stale, accepted: 0, rows: ['tc1', 'tc2'] },
			namedNonceChangesBeforeCommit: { error: stale, accepted: 0, rows: ['tc1', 'tc2'] },
			publishedNonce: { error: undefined, accepted: 1, rows: ['tc1', 'accept:t1:edit'] },
			publishedNonceAfterLaterEdit: { error: undefined, accepted: 1, rows: ['tc1', 'tc2', 'accept:t2:edit'] },
			publishedLatestNonce: { error: undefined, accepted: 1, rows: ['tc1', 'tc2', 'accept:t2:edit'] },
		});
	});
});

suite('AgentHostAcceptChangesOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('advertises accepting a file only on Working Set changesets', () => {
		const contribution = disposables.add(new AgentHostAcceptChangesOperationContribution(new (mock<IInstantiationService>())()));
		const operations = (changesetKind: ChangesetKind) => contribution.getOperations({ sessionKey: SESSION, changesetUri: SESSION, changesetKind });

		assert.deepStrictEqual({
			workingSet: operations(ChangesetKind.WorkingSet),
			others: [ChangesetKind.Session, ChangesetKind.Branch, ChangesetKind.Uncommitted, ChangesetKind.Turn].flatMap(operations),
		}, {
			workingSet: [{ id: 'accept-changes', label: 'Accept Changes', icon: 'check', scopes: ['resource', 'range'], status: 'idle' }],
			others: [],
		});
	});
});
