/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInteractivity, IGitHubInfo, IGitHubPullRequestRef, ISession, ISessionChangeset, ISessionFileChange, SessionArtifactKind, SessionRemoteConnectionFailureReason, SessionStatus } from '../../common/session.js';
import { ISessionWorkSummary, ISessionWorkSummaryOptions, ISessionWorkTrackingState, readSessionWorkResultVersion, readSessionWorkSummary } from '../../common/sessionWorkSummary.js';
import { createWorkTestChat, createWorkTestSession } from './sessionWorkTestUtils.js';

const day = 24 * 60 * 60 * 1000;
const options: ISessionWorkSummaryOptions = { now: 100 * day, inactivityDays: 30, pinned: false, active: false, pendingRequestCount: 0 };
const fileChange: ISessionFileChange = { modifiedUri: URI.file('/repo/file.ts'), insertions: 4, deletions: 2 };

function reviewed(session: ISession): ISessionWorkTrackingState {
	return { lastOpenedAt: day, reviewedResult: readSessionWorkResultVersion(session) };
}

function pullRequest(number = 1, state: IGitHubPullRequestRef['state'] = 'merged'): IGitHubPullRequestRef {
	return { owner: 'owner', repo: 'repo', number, uri: URI.parse(`https://github.com/owner/repo/pull/${number}`), state, createdByThisSession: true };
}

function setupPullRequests(pullRequests: readonly IGitHubPullRequestRef[] = [pullRequest()]) {
	const { session, chat } = createWorkTestSession();
	const gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', { owner: 'owner', repo: 'repo', pullRequests });
	const root = URI.file('/repo');
	session.workspace.set({
		uri: root, label: 'repo', icon: Codicon.folder, requiresWorkspaceTrust: true, isVirtualWorkspace: false,
		folders: [{
			root, workingDirectory: root, name: 'repo', description: undefined,
			gitRepository: {
				uri: root, workTreeUri: undefined, baseBranchName: 'main', gitHubInfo,
				resolveGitHubInfo: () => { throw new Error('A work summary must not resolve GitHub models'); },
			},
		}],
	}, undefined);
	session.changes.set([fileChange], undefined);
	return { session, chat, gitHubInfo };
}

function changeset(id = 'session') {
	return new class extends mock<ISessionChangeset>() {
		override readonly id = id;
		override readonly isDefault = observableValue('isDefault', true);
		override readonly isLoadingChanges = observableValue('isLoadingChanges', false);
		override readonly changes = observableValue<readonly ISessionFileChange[]>('changes', [fileChange]);
		override readonly originalCheckpointRef = observableValue<string | undefined>('originalCheckpointRef', 'base');
		override readonly modifiedCheckpointRef = observableValue<string | undefined>('modifiedCheckpointRef', 'result');
		override invokeOperation(): never { throw new Error('A work summary must not invoke changeset operations'); }
	};
}

suite('Session work summary', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not invent results from completed status, read state, or activity', () => {
		const { session } = createWorkTestSession();
		session.isRead.set(true, undefined);
		session.description.set(new MarkdownString('Tests passed'), undefined);
		const summary = readSessionWorkSummary(session, {}, options);
		assert.deepStrictEqual({
			attention: summary.attention, running: summary.running, hasResults: summary.hasResults,
			hasUnreviewedResults: summary.hasUnreviewedResults, archiveKind: summary.archiveKind,
			lastOpenedAt: summary.lastOpenedAt, fingerprint: /^1:[a-f0-9]{40}$/.test(summary.resultVersion),
		}, {
			attention: undefined, running: false, hasResults: false, hasUnreviewedResults: false,
			archiveKind: 'inspect', lastOpenedAt: undefined, fingerprint: true,
		});
	});

	test('a known finished turn is a result even without files or artifacts', () => {
		const { session, chat } = createWorkTestSession();
		chat.lastTurnEnd.set(new Date(2 * day), undefined);
		session.isRead.set(true, undefined);
		chat.isRead.set(true, undefined);
		const unreadCheckpoint = readSessionWorkSummary(session, { lastOpenedAt: day }, options);
		const reviewedCheckpoint = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual({
			hasResults: unreadCheckpoint.hasResults,
			unreviewed: unreadCheckpoint.hasUnreviewedResults,
			beforeReview: unreadCheckpoint.archiveKind,
			afterReview: reviewedCheckpoint.archiveKind,
		}, { hasResults: true, unreviewed: true, beforeReview: 'inspect', afterReview: 'suggested' });
	});

	test('fingerprints and dependencies ignore tokens, activity, updatedAt, title, model, and read state', () => {
		const { session, chat } = createWorkTestSession();
		chat.lastTurnEnd.set(new Date(day), undefined);
		const state = reviewed(session);
		const versions: string[] = [];
		store.add(autorun(reader => versions.push(readSessionWorkSummary(session, state, options, reader).resultVersion)));
		transaction(tx => {
			session.description.set(new MarkdownString('Streaming another token'), tx);
			chat.description.set(new MarkdownString('And another token'), tx);
			session.updatedAt.set(new Date(options.now), tx);
			chat.updatedAt.set(new Date(options.now), tx);
			session.title.set('Renamed work', tx);
			chat.title.set('Renamed chat', tx);
			session.modelId.set('another-model', tx);
			chat.modelId.set('another-model', tx);
			session.isRead.set(true, tx);
			chat.isRead.set(true, tx);
		});
		assert.deepStrictEqual({
			versions, current: readSessionWorkResultVersion(session),
			unreviewed: readSessionWorkSummary(session, state, options).hasUnreviewedResults,
		}, { versions: [state.reviewedResult], current: state.reviewedResult, unreviewed: false });
	});

	test('fingerprints and every archive path leave lazy GitHub metadata untouched', () => {
		const { session, chat } = setupPullRequests();
		const workspace = session.workspace.get()!;
		const folder = workspace.folders[0];
		let githubReads = 0;
		session.workspace.set({
			...workspace, folders: [{
				...folder, gitRepository: {
					...folder.gitRepository!,
					get gitHubInfo(): never {
						githubReads++;
						throw new Error('Lazy GitHub metadata must never be accessed');
					},
				},
			}],
		}, undefined);
		const version = readSessionWorkResultVersion(session);
		const unknownAge = readSessionWorkSummary(session, {}, options);
		const unreviewed = readSessionWorkSummary(session, { lastOpenedAt: day }, options);
		const active = readSessionWorkSummary(session, { lastOpenedAt: day, reviewedResult: version }, { ...options, active: true });
		const unknownQueue = readSessionWorkSummary(session, { lastOpenedAt: day, reviewedResult: version }, { ...options, pendingRequestCount: undefined });
		const changedFiles = readSessionWorkSummary(session, reviewed(session), options);
		session.changes.set([], undefined);
		chat.lastTurnEnd.set(new Date(2 * day), undefined);
		const noChanges = readSessionWorkSummary(session, reviewed(session), options);
		session.artifacts.set([{ id: 'pr', label: 'PR', kind: SessionArtifactKind.PullRequest, isArtifact: true, link: pullRequest().uri }], undefined);
		const producedPullRequest = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual({
			githubReads, kinds: [unknownAge, unreviewed, active, unknownQueue, changedFiles, noChanges, producedPullRequest].map(summary => summary.archiveKind),
		}, {
			githubReads: 0, kinds: ['inspect', 'inspect', 'excluded', 'inspect', 'inspect', 'suggested', 'inspect'],
		});
	});

	test('a later turn in any peer invalidates a review checkpoint', () => {
		const { session, chat } = createWorkTestSession();
		chat.lastTurnEnd.set(new Date(day), undefined);
		const peer = createWorkTestChat(URI.parse('test:/peer'));
		session.chats.set([chat, peer], undefined);
		const state = reviewed(session);
		peer.lastTurnEnd.set(new Date(2 * day), undefined);
		const summary = readSessionWorkSummary(session, state, options);
		assert.deepStrictEqual({
			changed: summary.resultVersion !== state.reviewedResult,
			unreviewed: summary.hasUnreviewedResults, archive: summary.archiveKind,
		}, { changed: true, unreviewed: true, archive: 'inspect' });
	});

	test('fingerprints include file resources, counts, changeset checkpoints, and artifact resources', () => {
		const { session } = createWorkTestSession();
		const versions = [readSessionWorkResultVersion(session)];
		session.changes.set([fileChange], undefined);
		versions.push(readSessionWorkResultVersion(session));
		session.changes.set([{ ...fileChange, modifiedUri: URI.file('/repo/other.ts') }], undefined);
		versions.push(readSessionWorkResultVersion(session));
		session.changesSummary.set({ files: 2, additions: 10, deletions: 1 }, undefined);
		versions.push(readSessionWorkResultVersion(session));
		const changes = changeset();
		session.changesets.set([changes], undefined);
		versions.push(readSessionWorkResultVersion(session));
		changes.modifiedCheckpointRef.set('next-result', undefined);
		versions.push(readSessionWorkResultVersion(session));
		session.artifacts.set([{ id: 'a', kind: SessionArtifactKind.File, label: 'Result', isArtifact: true, uri: URI.file('/repo/report.txt') }], undefined);
		versions.push(readSessionWorkResultVersion(session));
		session.artifacts.set([{ ...session.artifacts.get()[0], uri: URI.file('/repo/new-report.txt') }], undefined);
		versions.push(readSessionWorkResultVersion(session));
		assert.strictEqual(new Set(versions).size, versions.length);
	});

	test('metadata order and file-review flags do not create new result versions', () => {
		const { session, chat } = setupPullRequests([pullRequest(1), pullRequest(2)]);
		const peer = createWorkTestChat(URI.parse('test:/peer'));
		session.chats.set([chat, peer], undefined);
		session.changes.set([fileChange, { ...fileChange, modifiedUri: URI.file('/repo/second.ts') }], undefined);
		session.artifacts.set([
			{ id: 'a', kind: SessionArtifactKind.File, label: 'A', isArtifact: true, uri: URI.file('/repo/a.txt') },
			{ id: 'b', kind: SessionArtifactKind.File, label: 'B', isArtifact: true, uri: URI.file('/repo/b.txt') },
		], undefined);
		const version = readSessionWorkResultVersion(session);
		transaction(tx => {
			session.chats.set([peer, chat], tx);
			session.changes.set([...session.changes.get()].reverse().map(change => ({ ...change, reviewed: true })), tx);
			session.artifacts.set([...session.artifacts.get()].reverse(), tx);
		});
		assert.strictEqual(readSessionWorkResultVersion(session), version);
	});

	test('references alone do not claim produced results', () => {
		const { session } = createWorkTestSession();
		const artifact = { id: 'a', kind: SessionArtifactKind.File, label: 'Reference', isArtifact: false, uri: URI.file('/repo/a.txt') };
		session.artifacts.set([artifact], undefined);
		const reference = readSessionWorkSummary(session, {}, options);
		session.artifacts.set([{ ...artifact, isArtifact: true }], undefined);
		const produced = readSessionWorkSummary(session, {}, options);
		assert.deepStrictEqual([reference.hasResults, produced.hasResults], [false, true]);
	});

	for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Untitled]) {
		test(`protects an active or unsent peer with status ${status}, including hidden peers`, () => {
			const { session, chat } = createWorkTestSession();
			const peer = createWorkTestChat(URI.parse('test:/peer'));
			peer.status.set(status, undefined);
			peer.interactivity.set(ChatInteractivity.Hidden, undefined);
			session.chats.set([chat, peer], undefined);
			const summary = readSessionWorkSummary(session, reviewed(session), options);
			assert.deepStrictEqual({ kind: summary.archiveKind, running: summary.running, attention: summary.attention }, {
				kind: 'excluded', running: status === SessionStatus.InProgress, attention: status === SessionStatus.NeedsInput ? 'input' : undefined,
			});
		});
	}

	test('also protects a main chat not yet in the catalog chat array', () => {
		const { session, chat } = createWorkTestSession();
		session.chats.set([], undefined);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const summary = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual({ kind: summary.archiveKind, attention: summary.attention }, { kind: 'excluded', attention: 'input' });
	});

	test('excludes archived, loading, preparing, worktree-pending, active, pinned, and kept sessions', () => {
		const { session } = createWorkTestSession();
		const state = reviewed(session);
		const guards = [session.isArchived, session.loading, session.isNewSessionRequestInProgress, session.worktreePending];
		const kinds = guards.map(guard => {
			guard.set(true, undefined);
			const result = readSessionWorkSummary(session, state, options).archiveKind;
			guard.set(false, undefined);
			return result;
		});
		kinds.push(
			readSessionWorkSummary(session, state, { ...options, active: true }).archiveKind,
			readSessionWorkSummary(session, state, { ...options, pinned: true }).archiveKind,
			readSessionWorkSummary(session, { ...state, keepArchiveSuggestion: true }, options).archiveKind,
		);
		assert.deepStrictEqual(kinds, Array(7).fill('excluded'));
	});

	test('errors in peers are not treated as successful completion', () => {
		const { session, chat } = createWorkTestSession();
		chat.status.set(SessionStatus.Error, undefined);
		const summary = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual({ kind: summary.archiveKind, attention: summary.attention }, { kind: 'inspect', attention: 'error' });
	});

	test('an unavailable pending queue is not inferred empty from completed status', () => {
		const { session } = createWorkTestSession();
		const summary = readSessionWorkSummary(session, reviewed(session), {
			now: options.now, inactivityDays: options.inactivityDays, pinned: false, active: false,
		});
		assert.deepStrictEqual({
			archiveKind: summary.archiveKind, archiveReason: summary.archiveReason,
			running: summary.running, lastOpenedAt: summary.lastOpenedAt,
		}, {
			archiveKind: 'inspect',
			archiveReason: 'Pending request information is unavailable. Inspect the session before archiving.',
			running: false, lastOpenedAt: day,
		});
	});

	test('known queued requests are excluded without fabricating running work or results', () => {
		const { session } = createWorkTestSession();
		const state = reviewed(session);
		assert.deepStrictEqual([1, 2, 10].map(pendingRequestCount => {
			const summary = readSessionWorkSummary(session, state, { ...options, pendingRequestCount });
			return {
				archiveKind: summary.archiveKind, running: summary.running, hasResults: summary.hasResults,
				sameResults: summary.resultVersion === state.reviewedResult,
			};
		}), [1, 2, 10].map(() => ({
			archiveKind: 'excluded', running: false, hasResults: false, sameResults: true,
		})));
	});

	test('invalid pending counts require inspection instead of being treated as empty', () => {
		const { session } = createWorkTestSession();
		const invalidCounts = [undefined, NaN, Infinity, -1, 0.5];
		assert.deepStrictEqual(invalidCounts.map(pendingRequestCount =>
			readSessionWorkSummary(session, reviewed(session), { ...options, pendingRequestCount }).archiveKind,
		), invalidCounts.map(() => 'inspect'));
	});

	test('reacts to caller-observed pending queue metadata without changing result fingerprints', () => {
		const { session } = createWorkTestSession();
		const pendingRequests = observableValue<number | undefined>('pendingRequests', undefined);
		const state = reviewed(session);
		const summaries: ISessionWorkSummary[] = [];
		store.add(autorun(reader => summaries.push(readSessionWorkSummary(session, state, {
			...options, pendingRequestCount: pendingRequests.read(reader),
		}, reader))));
		pendingRequests.set(1, undefined);
		pendingRequests.set(0, undefined);
		pendingRequests.set(undefined, undefined);
		assert.deepStrictEqual({
			kinds: summaries.map(summary => summary.archiveKind),
			sameResults: summaries.every(summary => summary.resultVersion === state.reviewedResult),
		}, { kinds: ['inspect', 'excluded', 'suggested', 'inspect'], sameResults: true });
	});

	test('an unrecognized terminal status is not an archive candidate', () => {
		const { session } = createWorkTestSession();
		session.status.set(99 as SessionStatus, undefined);
		assert.strictEqual(readSessionWorkSummary(session, reviewed(session), options).archiveKind, 'inspect');
	});

	test('disconnected, unknown-failure, reconnecting, connecting, and incompatible hosts require inspection', () => {
		const { session } = createWorkTestSession();
		const state = reviewed(session);
		const connections = [
			{ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown },
			{ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning },
			{ kind: 'reconnecting' }, { kind: 'connecting' }, { kind: 'incompatible' },
		] as const;
		assert.deepStrictEqual(connections.map(connection => {
			session.remoteConnectionStatus.set(connection, undefined);
			const summary = readSessionWorkSummary(session, state, options);
			return { kind: summary.archiveKind, attention: summary.attention };
		}), connections.map(() => ({ kind: 'inspect', attention: 'connection' })));
	});

	test('local sessions need no remote-connection field', () => {
		const { session } = createWorkTestSession();
		const local = { ...session, remoteConnectionStatus: undefined };
		assert.strictEqual(readSessionWorkSummary(local, reviewed(local), options).archiveKind, 'suggested');
	});

	test('missing local-opening history stays unknown regardless of provider timestamps or read state', () => {
		const { session } = createWorkTestSession();
		session.isRead.set(true, undefined);
		session.updatedAt.set(new Date(day), undefined);
		const before = readSessionWorkSummary(session, {}, options);
		session.updatedAt.set(new Date(options.now), undefined);
		const after = readSessionWorkSummary(session, {}, options);
		assert.deepStrictEqual([before, after].map(summary => ({ kind: summary.archiveKind, age: summary.lastOpenedAt })), [
			{ kind: 'inspect', age: undefined }, { kind: 'inspect', age: undefined },
		]);
	});

	test('the initial 30-day cutoff and edited cutoffs are inclusive to the millisecond', () => {
		const { session } = createWorkTestSession();
		const cutoffs = [30, 7, 31];
		assert.deepStrictEqual(cutoffs.map(inactivityDays => {
			const currentOptions = { ...options, inactivityDays };
			const cutoff = options.now - inactivityDays * day;
			const exact = readSessionWorkSummary(session, { lastOpenedAt: cutoff }, currentOptions);
			return {
				inactivityDays,
				younger: readSessionWorkSummary(session, { lastOpenedAt: cutoff + 1 }, currentOptions).archiveKind,
				exact: exact.archiveKind,
				older: readSessionWorkSummary(session, { lastOpenedAt: cutoff - 1 }, currentOptions).archiveKind,
				reason: exact.archiveReason,
			};
		}), cutoffs.map(inactivityDays => ({
			inactivityDays,
			younger: 'excluded',
			exact: 'suggested',
			older: 'suggested',
			reason: `Last opened here at least ${inactivityDays} days ago; known results are reviewed and no unfinished work is reported.`,
		})));
	});

	test('invalid times and invalid inactivity periods never suggest archive', () => {
		const { session } = createWorkTestSession();
		const times = [undefined, NaN, Infinity, -1, options.now + 1];
		const periods = [0, -1, NaN, Infinity];
		assert.deepStrictEqual({
			times: times.map(lastOpenedAt => readSessionWorkSummary(session, { lastOpenedAt }, options).archiveKind),
			periods: periods.map(inactivityDays => readSessionWorkSummary(session, { lastOpenedAt: day }, { ...options, inactivityDays }).archiveKind),
		}, { times: times.map(() => 'inspect'), periods: periods.map(() => 'inspect') });
	});

	test('unknown or invalid file-change metadata requires inspection', () => {
		const { session } = createWorkTestSession();
		session.changesets.set(undefined, undefined);
		const unknown = readSessionWorkSummary(session, reviewed(session), options);
		session.changesSummary.set({ files: -1, additions: 0, deletions: 0 }, undefined);
		const invalid = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual([unknown.archiveKind, invalid.archiveKind], ['inspect', 'inspect']);
	});

	test('malformed turn-end times are not proof of known completion', () => {
		const { session, chat } = createWorkTestSession();
		session.lastTurnEnd.set(new Date(NaN), undefined);
		const invalidSession = readSessionWorkSummary(session, reviewed(session), options);
		session.lastTurnEnd.set(undefined, undefined);
		chat.lastTurnEnd.set(new Date(NaN), undefined);
		const invalidChat = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual([invalidSession.archiveKind, invalidChat.archiveKind], ['inspect', 'inspect']);
	});

	test('changeset loading and explicit unreviewed files remain protected after result review', () => {
		const { session } = setupPullRequests();
		const changes = changeset();
		session.changesets.set([changes], undefined);
		const state = reviewed(session);
		changes.isLoadingChanges.set(true, undefined);
		const loading = readSessionWorkSummary(session, state, options);
		changes.isLoadingChanges.set(false, undefined);
		changes.changes.set([{ ...fileChange, reviewed: false }], undefined);
		const unreviewed = readSessionWorkSummary(session, state, options);
		changes.changes.set([{ ...fileChange, reviewed: true }], undefined);
		const reviewedFiles = readSessionWorkSummary(session, state, options);
		assert.deepStrictEqual({
			kinds: [loading.archiveKind, unreviewed.archiveKind, reviewedFiles.archiveKind],
			sameResults: [loading, unreviewed, reviewedFiles].every(summary => summary.resultVersion === state.reviewedResult),
		}, { kinds: ['excluded', 'inspect', 'inspect'], sameResults: true });
	});

	test('reactively tracks peers, stats, and checkpoints without observing GitHub state', () => {
		const { session, chat, gitHubInfo } = setupPullRequests();
		const peer = createWorkTestChat(URI.parse('test:/peer'));
		const changes = changeset();
		session.chats.set([chat, peer], undefined);
		session.changesets.set([changes], undefined);
		const summaries: ISessionWorkSummary[] = [];
		const state = reviewed(session);
		store.add(autorun(reader => summaries.push(readSessionWorkSummary(session, state, options, reader))));
		peer.status.set(SessionStatus.NeedsInput, undefined);
		peer.status.set(SessionStatus.Completed, undefined);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest(1, 'open')] }, undefined);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest()] }, undefined);
		changes.isLoadingChanges.set(true, undefined);
		changes.isLoadingChanges.set(false, undefined);
		changes.modifiedCheckpointRef.set('new-result', undefined);
		session.changesSummary.set({ files: 2, additions: 20, deletions: 1 }, undefined);
		assert.deepStrictEqual(summaries.map(summary => summary.archiveKind), [
			'inspect', 'excluded', 'inspect', 'excluded', 'inspect', 'inspect', 'inspect',
		]);
	});

	test('reactively tracks newly published chats, their results, artifacts, workspace, and connection', () => {
		const { session } = createWorkTestSession();
		const peer = createWorkTestChat(URI.parse('test:/peer'));
		const summaries: ISessionWorkSummary[] = [];
		store.add(autorun(reader => summaries.push(readSessionWorkSummary(session, {}, options, reader))));
		session.chats.set([...session.chats.get(), peer], undefined);
		peer.lastTurnEnd.set(new Date(day), undefined);
		peer.changes.set([fileChange], undefined);
		session.lastTurnEnd.set(new Date(2 * day), undefined);
		session.artifacts.set([{ id: 'a', label: 'Artifact', kind: SessionArtifactKind.Resource, isArtifact: true, uri: URI.parse('test:/artifact') }], undefined);
		session.remoteConnectionStatus.set({ kind: 'reconnecting' }, undefined);
		const { session: other } = setupPullRequests();
		session.workspace.set(other.workspace.get(), undefined);
		assert.deepStrictEqual({
			count: summaries.length,
			lastAttention: summaries.at(-1)?.attention,
			turnRecorded: summaries[2].hasResults,
			versions: new Set(summaries.map(summary => summary.resultVersion)).size,
		}, { count: 8, lastAttention: 'connection', turnRecorded: true, versions: 6 });
	});
});

suite('Session work archive pull requests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('file changes require inspection even when every recorded PR reports merged', () => {
		const { session, gitHubInfo } = setupPullRequests([pullRequest(1), pullRequest(2)]);
		const state = reviewed(session);
		const merged = readSessionWorkSummary(session, state, options);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest(1), pullRequest(2, 'open')] }, undefined);
		const open = readSessionWorkSummary(session, state, options);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest(1), { ...pullRequest(2), state: undefined }] }, undefined);
		const unknown = readSessionWorkSummary(session, state, options);
		assert.deepStrictEqual({
			kinds: [merged.archiveKind, open.archiveKind, unknown.archiveKind],
			reason: merged.archiveReason,
			unreviewed: merged.hasUnreviewedResults,
		}, {
			kinds: ['inspect', 'inspect', 'inspect'],
			reason: 'File changes are recorded, but published or merged state cannot be confirmed from metadata.',
			unreviewed: false,
		});
	});

	test('changes from any metadata surface cannot be suggested without publication evidence', () => {
		const cases: Array<(work: ReturnType<typeof createWorkTestSession>) => void> = [
			({ session }) => session.changes.set([fileChange], undefined),
			({ chat }) => chat.changes.set([fileChange], undefined),
			({ chat }) => chat.lastTurnChanges.set([{ ...fileChange, isOutsideWorkspace: false }], undefined),
			({ session }) => session.changesets.set([changeset()], undefined),
			({ session }) => session.changesSummary.set({ files: 1, additions: 4, deletions: 2 }, undefined),
			({ session }) => session.changesSummary.set({ files: 0, additions: 1, deletions: 0 }, undefined),
			({ session }) => session.changesSummary.set({ files: 0, additions: 0, deletions: 1 }, undefined),
		];
		assert.deepStrictEqual(cases.map(setup => {
			const work = createWorkTestSession();
			setup(work);
			const summary = readSessionWorkSummary(work.session, reviewed(work.session), options);
			return { kind: summary.archiveKind, reason: summary.archiveReason };
		}), cases.map(() => ({
			kind: 'inspect', reason: 'File changes are recorded, but published or merged state cannot be confirmed from metadata.',
		})));
	});

	test('unknown GitHub info or an absent pull request cannot prove merged changes', () => {
		const { session, gitHubInfo } = setupPullRequests([]);
		const absent = readSessionWorkSummary(session, reviewed(session), options);
		gitHubInfo.set(undefined, undefined);
		const unknown = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual([absent.archiveKind, unknown.archiveKind], ['inspect', 'inspect']);
	});

	test('closed, icon-only, inherited, foreign, and inconsistent pull requests are not completion proof', () => {
		const variants: IGitHubPullRequestRef[] = [
			pullRequest(1, 'closed'),
			{ ...pullRequest(), state: undefined, icon: Codicon.gitPullRequestDone },
			{ ...pullRequest(), createdByThisSession: false },
			{ ...pullRequest(), owner: 'other', uri: URI.parse('https://github.com/other/repo/pull/1') },
			{ ...pullRequest(), uri: URI.parse('https://example.com/owner/repo/pull/1') },
			{ ...pullRequest(), number: 2 },
		];
		assert.deepStrictEqual(variants.map(pullRequest => {
			const { session } = setupPullRequests([pullRequest]);
			return readSessionWorkSummary(session, reviewed(session), options).archiveKind;
		}), variants.map(() => 'inspect'));
	});

	test('live PR state cannot change inspection-only eligibility or the result fingerprint', () => {
		const { session, gitHubInfo } = setupPullRequests([{ ...pullRequest(1, 'open'), liveState: 'merged' }]);
		const state = reviewed(session);
		const merged = readSessionWorkSummary(session, state, options);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [{ ...pullRequest(), liveState: 'open' }] }, undefined);
		const open = readSessionWorkSummary(session, state, options);
		assert.deepStrictEqual({
			kinds: [merged.archiveKind, open.archiveKind],
			sameResult: merged.resultVersion === open.resultVersion,
			unreviewed: open.hasUnreviewedResults,
		}, { kinds: ['inspect', 'inspect'], sameResult: true, unreviewed: false });
	});

	test('legacy PR shapes cannot bypass changed-file inspection', () => {
		const { session, gitHubInfo } = setupPullRequests();
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequest: pullRequest() }, undefined);
		const legacy = readSessionWorkSummary(session, reviewed(session), options);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest()], pullRequest: pullRequest(2, 'open') }, undefined);
		const additional = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual([legacy.archiveKind, additional.archiveKind], ['inspect', 'inspect']);
	});

	test('matching merged PR metadata cannot bypass inspection of produced artifacts', () => {
		const { session, gitHubInfo } = setupPullRequests();
		session.artifacts.set([1, 2].map(number => ({
			id: `pr-${number}`, label: 'Pull Request', kind: SessionArtifactKind.PullRequest,
			isArtifact: true, isGitHub: true, link: pullRequest(number).uri,
		})), undefined);
		const missing = readSessionWorkSummary(session, reviewed(session), options);
		gitHubInfo.set({ owner: 'owner', repo: 'repo', pullRequests: [pullRequest(1), pullRequest(2)] }, undefined);
		const allMerged = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual([missing.archiveKind, allMerged.archiveKind], ['inspect', 'inspect']);
	});

	test('a reference PR does not establish completion even if cached as merged', () => {
		const { session } = setupPullRequests([{ ...pullRequest(), createdByThisSession: undefined }]);
		session.artifacts.set([{
			id: 'reference', label: 'Referenced PR', kind: SessionArtifactKind.PullRequest,
			isArtifact: false, isGitHub: true, link: pullRequest().uri,
		}], undefined);
		assert.strictEqual(readSessionWorkSummary(session, reviewed(session), options).archiveKind, 'inspect');
	});

	test('foreign and malformed produced PR artifacts never count as complete', () => {
		const links = [
			'https://example.com/owner/repo/pull/1', 'https://github.com/foreign/repo/pull/1',
			'https://github.com/owner/repo/pull/0', 'https://github.com/owner/repo/issues/1',
			'https://github.com/owner/repo/pull/9007199254740992',
		];
		assert.deepStrictEqual(links.map(link => {
			const { session } = setupPullRequests();
			session.artifacts.set([{ id: 'pr', label: 'PR', kind: SessionArtifactKind.PullRequest, isArtifact: true, link: URI.parse(link) }], undefined);
			return readSessionWorkSummary(session, reviewed(session), options).archiveKind;
		}), links.map(() => 'inspect'));
	});

	test('produced PR completion remains unknown even when file stats are zero and cached state is merged', () => {
		const { session } = setupPullRequests([pullRequest()]);
		session.changes.set([], undefined);
		session.artifacts.set([{ id: 'pr', label: 'PR', kind: SessionArtifactKind.PullRequest, isArtifact: true, link: pullRequest().uri }], undefined);
		const summary = readSessionWorkSummary(session, reviewed(session), options);
		assert.deepStrictEqual({ kind: summary.archiveKind, reason: summary.archiveReason }, {
			kind: 'inspect', reason: 'Pull request completion cannot be confirmed from metadata.',
		});
	});

	test('unknown metadata in another workspace folder prevents merged-file suggestions', () => {
		const { session } = setupPullRequests();
		const workspace = session.workspace.get()!;
		session.workspace.set({
			...workspace,
			folders: [...workspace.folders, {
				root: URI.file('/other'), workingDirectory: URI.file('/other'), name: 'other', description: undefined,
				gitRepository: {
					uri: URI.file('/other'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo: constObservable(undefined),
				},
			}],
		}, undefined);
		assert.strictEqual(readSessionWorkSummary(session, reviewed(session), options).archiveKind, 'inspect');
	});

	test('ongoing git operations and unpublished work protect otherwise eligible no-change sessions', () => {
		const { session } = setupPullRequests();
		session.changes.set([], undefined);
		const workspace = session.workspace.get()!;
		const folder = workspace.folders[0];
		const repository = folder.gitRepository!;
		const state = reviewed(session);
		const states = [
			{ hasGitOperationInProgress: true },
			{ uncommittedChanges: 1 },
			{ outgoingChanges: 1 },
			{ uncommittedChanges: 0, outgoingChanges: 0 },
		];
		assert.deepStrictEqual(states.map(gitState => {
			session.workspace.set({ ...workspace, folders: [{ ...folder, gitRepository: { ...repository, ...gitState } }] }, undefined);
			return readSessionWorkSummary(session, state, options).archiveKind;
		}), ['excluded', 'inspect', 'inspect', 'suggested']);
	});
});
