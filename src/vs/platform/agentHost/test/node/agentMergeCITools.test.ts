/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubWorkflowJob, GitHubWorkflowLog, GitHubWorkflowRun } from '../../../github/common/githubPullRequestMutationService.js';
import { PullRequestCheck, PullRequestRef, PullRequestSnapshot } from '../../../github/common/githubPullRequestService.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { IPullRequestMutations } from '../../../github/common/pullRequestMutationService.js';
import { IPullRequestResources } from '../../../github/common/pullRequestResourceService.js';
import { GitHubRequestError } from '../../../github/common/githubTransport.js';
import { NullLogService } from '../../../log/common/log.js';
import { defaultAgentMergeConfiguration } from '../../common/agentMerge.js';
import { AgentMergeCIEvidenceStore, agentMergeCIResponseBytes, ciJsonBytes, readCIRange, readCITail, searchCIEvidence } from '../../node/agentMergeCIEvidence.js';
import { AgentMergeTools, IAgentMergeTurnContext } from '../../node/agentMergeTools.js';
import { AgentMergeCIRequest } from '../../node/shared/agentMergeServerTools.js';

interface CIResult {
	readonly items: readonly { kind: string; jobId?: string; evidenceId?: string; complete?: boolean; totalLines?: number | null; jobRunAttempt?: number | null; message?: string }[];
	readonly lines: readonly { line: number; column: number; text: string }[];
	readonly matches: readonly { line: number }[];
	readonly next: { cursor: string } | null;
	readonly complete: boolean;
	readonly outcome: string;
	readonly totalLines: number | null;
	readonly terminalLimit: string | null;
}

const ref: PullRequestRef = { host: 'api.github.com', accountId: 'account', owner: 'owner', repo: 'repo', number: 1 };

suite('Agent Merge CI diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('six long failed jobs have bounded summaries containing failures beyond both old cutoffs', async () => {
		const h = store.add(new CIHarness(6));
		h.mutations.log = { text: `${'setup output\n'.repeat(250_000)}1 failing\nAssertionError: expected archive state\n`, truncated: false };
		const result = await h.read();
		assert.deepStrictEqual({
			bounded: ciJsonBytes(result) <= agentMergeCIResponseBytes,
			checks: result.items.filter(item => item.kind === 'check').length,
			jobs: result.items.filter(item => item.kind === 'job').length,
			hasFailure: JSON.stringify(result).includes('AssertionError: expected archive state'),
			complete: result.items.filter(item => item.kind === 'job').every(item => item.complete && item.totalLines === 250_002),
			next: result.next,
			downloads: h.mutations.downloads,
		}, { bounded: true, checks: 6, jobs: 6, hasFailure: true, complete: true, next: null, downloads: 6 });
		const job = result.items.find(item => item.kind === 'job')!;
		const tail = await h.read({ mode: 'tail', evidenceId: job.evidenceId, lineCount: 2 });
		assert.deepStrictEqual(tail.lines.map(line => line.text), ['1 failing', 'AssertionError: expected archive state']);
		assert.strictEqual(h.mutations.downloads, 6);
	});

	for (const scenario of [
		{ name: 'four 12 MiB logs', jobs: 4, log: `${'x'.repeat(12 * 1024 * 1024 - 5)}\nFAIL`, expectedPageJobs: [2, 2] },
		{ name: 'more than eight small logs', jobs: 20, log: 'FAIL', expectedPageJobs: [0, 4, 8, 8] },
	]) {
		test(`keeps every advertised evidence ID readable while paging ${scenario.name}`, async () => {
			const h = store.add(new CIHarness(scenario.jobs));
			h.mutations.log = { text: scenario.log, truncated: false };
			const pageJobs: number[] = [];
			const jobIds: string[] = [];
			let request: AgentMergeCIRequest = {};
			do {
				const result = await h.read(request);
				assert.ok(ciJsonBytes(result) <= agentMergeCIResponseBytes);
				const jobs = result.items.filter(item => item.kind === 'job');
				pageJobs.push(jobs.length);
				const downloads = h.mutations.downloads;
				for (const job of jobs) {
					const tail = await h.read({ mode: 'tail', evidenceId: job.evidenceId, lineCount: 1 });
					assert.deepStrictEqual(tail.lines.map(line => line.text), ['FAIL']);
					jobIds.push(job.jobId!);
				}
				assert.strictEqual(h.mutations.downloads, downloads);
				if (!result.next) {
					break;
				}
				request = result.next;
			} while (pageJobs.length <= scenario.jobs);
			assert.deepStrictEqual({ pageJobs, jobs: jobIds.length, uniqueJobs: new Set(jobIds).size }, {
				pageJobs: scenario.expectedPageJobs, jobs: scenario.jobs, uniqueJobs: scenario.jobs,
			});
		});
	}

	test('hard-limit evidence is an incomplete prefix, never a real tail', async () => {
		const h = store.add(new CIHarness());
		h.mutations.log = { text: 'captured prefix\n', truncated: true, bytesRead: 16 * 1024 * 1024, maximumBytes: 16 * 1024 * 1024 };
		const id = await h.evidenceId();
		const tail = await h.read({ mode: 'tail', evidenceId: id });
		const range = await h.read({ mode: 'range', evidenceId: id, startLine: 1, endLine: 1 });
		assert.deepStrictEqual({
			tailOutcome: tail.outcome, complete: tail.complete, totalLines: tail.totalLines,
			explicitLimit: tail.terminalLimit?.includes('before EOF'),
			captured: range.lines.map(line => line.text), downloads: h.mutations.downloads,
		}, { tailOutcome: 'unavailable', complete: false, totalLines: null, explicitLimit: true, captured: ['captured prefix'], downloads: 1 });
	});

	test('range continuations reconstruct a long redacted line and revalidate without redownloading', async () => {
		const h = store.add(new CIHarness());
		const text = `${'abc"\\\t'.repeat(4_000)}***`;
		h.mutations.log = { text: `${text}\nlast`, truncated: false };
		const evidenceId = await h.evidenceId();
		let result = await h.read({ mode: 'range', evidenceId, startLine: 1, endLine: 1 });
		let actual = '';
		let pages = 0;
		do {
			assert.ok(ciJsonBytes(result) <= agentMergeCIResponseBytes);
			actual += result.lines.map(line => line.text).join('');
			pages++;
			if (!result.next) {
				break;
			}
			const again = await h.read(result.next);
			const repeat = await h.read(result.next);
			assert.deepStrictEqual(again.lines, repeat.lines);
			result = again;
		} while (pages < 30);
		assert.deepStrictEqual({ actual, manyPages: pages > 1, downloads: h.mutations.downloads, revalidated: h.refreshes > pages }, { actual: text, manyPages: true, downloads: 1, revalidated: true });
	});

	test('literal search paginates matching lines with context and immutable redacted evidence', async () => {
		const h = store.add(new CIHarness());
		h.mutations.log = { text: Array.from({ length: 40 }, (_, i) => i % 3 === 0 ? 'FAIL [test] ***' : `context ${i}`).join('\n'), truncated: false };
		const evidenceId = await h.evidenceId();
		let result = await h.read({ mode: 'search', evidenceId, query: 'fail [test]', contextLines: 1 });
		const matches: number[] = [];
		do {
			assert.ok(ciJsonBytes(result) <= agentMergeCIResponseBytes);
			matches.push(...result.matches.map(match => match.line));
			if (!result.next) {
				break;
			}
			result = await h.read(result.next);
		} while (matches.length < 20);
		assert.deepStrictEqual({ matches, downloads: h.mutations.downloads }, { matches: Array.from({ length: 14 }, (_, i) => i * 3 + 1), downloads: 1 });
	});

	test('rejects malformed, cross-session, cross-repository, and stale head or attempt evidence', async () => {
		const h = store.add(new CIHarness());
		const evidenceId = await h.evidenceId();
		const request: AgentMergeCIRequest = { mode: 'tail', evidenceId };
		await assert.rejects(h.read({ mode: 'tail', evidenceId: 'invalid' }), /Invalid, expired, or unauthorized/);
		await assert.rejects(h.read({ cursor: 'invalid' }), /Invalid, expired, or unauthorized/);
		const original = h.context;
		h.context = { ...original, session: 'other' };
		await assert.rejects(h.read(request), /unauthorized/);
		h.context = { ...original, ref: { ...ref, repo: 'other' } };
		await assert.rejects(h.read(request), /unauthorized/);
		h.context = { ...original, headSha: 'other-head' };
		await assert.rejects(h.read(request), /head could not be confirmed/);
		h.context = original;
		h.mutations.run = { ...h.mutations.run, runAttempt: 2 };
		await assert.rejects(h.read(request), /workflow attempt changed/);
		h.mutations.run = { ...h.mutations.run, runAttempt: 1 };
		h.context = { ...original, actions: [] };
		await assert.rejects(h.read(request), /not authorized/);
	});

	test('revalidates live PR head, deferred failures, job identity, and feature enablement', async () => {
		const h = store.add(new CIHarness());
		const evidenceId = await h.evidenceId();
		const request: AgentMergeCIRequest = { mode: 'range', evidenceId };
		h.snapshot.set(makeSnapshot(1, 'new-head'), undefined);
		await assert.rejects(h.read(request), /head could not be confirmed/);
		h.snapshot.set(makeSnapshot(1), undefined);
		h.deferred.add('check-0');
		await assert.rejects(h.read(request), /stale or unauthorized/);
		h.deferred.clear();
		h.mutations.jobs[0] = { ...h.mutations.jobs[0], headSha: 'other-head' };
		await assert.rejects(h.read(request), /stale or unauthorized/);
		h.enabled = false;
		await assert.rejects(h.read(request), /not authorized/);
	});

	test('rejects a rerun that starts while validating a cached job', async () => {
		const h = store.add(new CIHarness());
		const evidenceId = await h.evidenceId();
		h.mutations.beforeJobs = () => { h.mutations.run = { ...h.mutations.run, runAttempt: 2 }; };
		await assert.rejects(h.read({ mode: 'tail', evidenceId }), /authorization changed during this read/);
		assert.strictEqual(h.mutations.downloads, 1);
	});

	test('summary cursors are bounded and rejected when the workflow attempt changes', async () => {
		const h = store.add(new CIHarness(15));
		const first = await h.read();
		assert.ok(first.next);
		const second = await h.read(first.next);
		assert.deepStrictEqual({
			first: first.items.length, second: second.items.length,
			secondJobs: second.items.filter(item => item.kind === 'job').length,
			bounded: ciJsonBytes(second) <= agentMergeCIResponseBytes,
		}, { first: 12, second: 11, secondJobs: 8, bounded: true });
		h.mutations.run = { ...h.mutations.run, runAttempt: 2 };
		await assert.rejects(h.read(first.next), /summary cursor is stale/);
	});

	test('reports unavailable logs explicitly and allows selecting only authorized jobs', async () => {
		const h = store.add(new CIHarness());
		h.mutations.beforeDownload = () => { throw new GitHubRequestError('not found', 'notFound'); };
		const result = await h.read({ jobId: 'job-0' });
		assert.deepStrictEqual({ count: result.items.length, message: result.items[0].message }, { count: 1, message: 'Workflow log unavailable (notFound). No cached log evidence or continuation is available.' });
		await assert.rejects(h.read({ jobId: 'unrelated' }), /not a failed job authorized/);
	});

	test('does not invent an attempt or grant pinned evidence when GitHub omits it', async () => {
		const h = store.add(new CIHarness());
		h.mutations.run = { ...h.mutations.run, runAttemptKnown: false };
		const result = await h.read();
		assert.deepStrictEqual({
			items: result.items.length, downloads: h.mutations.downloads,
			unknown: JSON.stringify(result).includes('"runAttempt":null'),
			unavailable: JSON.stringify(result).includes('workflow attempt is unknown'),
		}, { items: 1, downloads: 0, unknown: true, unavailable: true });
	});

	test('serializes authorized reads from different sessions without sharing evidence', async () => {
		const h = store.add(new CIHarness());
		h.peerContexts.set('peer', { ...h.context, session: 'peer' });
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let active = 0;
		let maximumActive = 0;
		h.mutations.beforeDownload = async () => {
			maximumActive = Math.max(maximumActive, ++active);
			if (h.mutations.downloads === 1) {
				await started.complete();
				await release.p;
			}
			active--;
		};
		const first = h.read();
		await started.p;
		const second = h.read({}, 'peer');
		await release.complete();
		const results = await Promise.all([first, second]);
		const evidenceIds = results.map(result => result.items.find(item => item.kind === 'job')!.evidenceId!);
		assert.deepStrictEqual({ maximumActive, downloads: h.mutations.downloads, separateEvidence: new Set(evidenceIds).size }, { maximumActive: 1, downloads: 2, separateEvidence: 2 });
		await assert.rejects(h.read({ mode: 'tail', evidenceId: evidenceIds[0] }, 'peer'), /unauthorized/);
	});

	test('cancels a queued read promptly without blocking the next session or making requests', async () => {
		const h = store.add(new CIHarness());
		const abort = new AbortController();
		store.add(toDisposable(() => abort.abort()));
		h.peerContexts.set('cancelled', { ...h.context, session: 'cancelled', signal: abort.signal });
		h.peerContexts.set('next', { ...h.context, session: 'next' });
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		h.mutations.beforeDownload = async () => {
			if (h.mutations.downloads === 1) {
				await started.complete();
				await release.p;
			}
		};
		const first = h.read();
		await started.p;
		const queued = h.read({}, 'cancelled');
		const next = h.read({}, 'next');
		abort.abort(new Error('Queued read cancelled.'));
		try {
			await assert.rejects(queued, /Queued read cancelled/);
			assert.deepStrictEqual({ downloads: h.mutations.downloads, refreshes: h.refreshes }, { downloads: 1, refreshes: 1 });
		} finally {
			await release.complete();
		}
		await Promise.all([first, next]);
		assert.strictEqual(h.mutations.downloads, 2);
	});

	test('rechecks authorization before starting a queued read', async () => {
		const h = store.add(new CIHarness());
		h.peerContexts.set('peer', { ...h.context, session: 'peer' });
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		h.mutations.beforeDownload = async () => {
			await started.complete();
			await release.p;
		};
		const first = h.read();
		await started.p;
		const queued = h.read({}, 'peer');
		h.peerContexts.delete('peer');
		const rejected = assert.rejects(queued, /not authorized/);
		await release.complete();
		await Promise.all([first, rejected]);
		assert.deepStrictEqual({ downloads: h.mutations.downloads, refreshes: h.refreshes }, { downloads: 1, refreshes: 2 });
	});

	test('includes queue waiting in the call deadline without starting cancelled work', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = store.add(new CIHarness());
		h.peerContexts.set('peer', { ...h.context, session: 'peer' });
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		h.mutations.beforeDownload = async () => {
			await started.complete();
			await release.p;
		};
		const first = assert.rejects(h.read(), /three-minute time limit/);
		await started.p;
		const queued = assert.rejects(h.read({}, 'peer'), /three-minute time limit/);
		try {
			await timeout(180_001);
			await Promise.all([first, queued]);
			assert.strictEqual(h.mutations.downloads, 1);
		} finally {
			await release.complete();
		}
		h.mutations.beforeDownload = undefined;
		await h.read();
		assert.strictEqual(h.mutations.downloads, 2);
	}));

	test('cancels in-flight downloads, releases subscriptions, and refuses disposed reads', async () => {
		const h = store.add(new CIHarness());
		let started!: () => void;
		const downloading = new Promise<void>(resolve => { started = resolve; });
		h.mutations.beforeDownload = signal => new Promise<void>((_resolve, reject) => {
			store.add(Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => reject(signal.reason)));
			started();
		});
		const read = h.read();
		await downloading;
		const queued = h.read();
		h.tools.dispose();
		await Promise.all([assert.rejects(read, /disposed/), assert.rejects(queued, /disposed/)]);
		await assert.rejects(h.read(), /disposed/);
		assert.deepStrictEqual({ subscriptions: h.subscriptions, downloads: h.mutations.downloads }, { subscriptions: 0, downloads: 1 });
	});

	test('expires evidence and cursors, and can reacquire just the selected job', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = store.add(new CIHarness(2));
		h.mutations.log = { text: 'long line'.repeat(3_000), truncated: false };
		const evidenceId = await h.evidenceId();
		const range = await h.read({ mode: 'range', evidenceId });
		assert.ok(range.next);
		await timeout(5 * 60_000 + 1);
		await assert.rejects(h.read(range.next), /expired/);
		await assert.rejects(h.read({ mode: 'tail', evidenceId }), /expired/);
		const selected = await h.read({ jobId: 'job-0' });
		assert.deepStrictEqual({ items: selected.items.length, job: selected.items[0].jobId, downloads: h.mutations.downloads }, { items: 1, job: 'job-0', downloads: 3 });
	}));

	test('renews reused evidence so it does not expire during summary construction', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = store.add(new CIHarness());
		const evidenceId = await h.evidenceId();
		await timeout(5 * 60_000 - 1_000);
		h.mutations.jobs.push({ ...h.mutations.jobs[0], id: 'job-1' });
		h.mutations.beforeDownload = async () => { await timeout(2_000); };
		const result = await h.read();
		const ids = result.items.filter(item => item.kind === 'job').map(job => job.evidenceId);
		assert.strictEqual(ids[0], evidenceId);
		for (const id of ids) {
			await h.read({ mode: 'tail', evidenceId: id });
		}
		assert.strictEqual(h.mutations.downloads, 2);
	}));

	test('search continuation advances even through a large region with no matches', async () => {
		const h = store.add(new CIHarness());
		h.mutations.log = { text: `${'setup\n'.repeat(499_999)}FAIL: found`, truncated: false };
		const evidenceId = await h.evidenceId();
		const matches: number[] = [];
		let request: AgentMergeCIRequest = { mode: 'search', evidenceId, query: 'FAIL' };
		let pages = 0;
		do {
			const result = await h.read(request);
			pages++;
			matches.push(...result.matches.map(match => match.line));
			if (!result.next) {
				break;
			}
			request = result.next;
		} while (pages < 11);
		assert.deepStrictEqual({ pages, matches, downloads: h.mutations.downloads }, { pages: 10, matches: [500_000], downloads: 1 });
	});

	test('seeks search pages in a newline-dense 16 MiB log using bounded cached checkpoints', () => {
		const evidence = store.add(new AgentMergeCIEvidenceStore());
		const text = `${'\n'.repeat(16 * 1024 * 1024 - 5)}FAIL\n`;
		const entry = evidence.tryAdd('scope', 1, { id: 'job', runId: '1', name: 'test' }, { text, truncated: false }, new AbortController().signal)!;
		const checkpointReads: number[] = [];
		const indexedEntry = {
			...entry,
			lineStartOffsets: new Proxy(entry.lineStartOffsets, {
				get: (target, property) => {
					if (typeof property === 'string' && /^\d+$/.test(property)) {
						checkpointReads.push(Number(property));
					}
					return Reflect.get(target, property, target);
				},
			}),
		};
		const expectedCheckpoints: number[] = [];
		const matches: number[] = [];
		let request: AgentMergeCIRequest = { mode: 'search', evidenceId: entry.id, query: 'FAIL', contextLines: 0 };
		let skippedLines = 0;
		for (let page = 0; page < 336; page++) {
			const first = request.startLine ?? 1;
			const checkpoint = Math.floor((first - 1) / 1_024);
			expectedCheckpoints.push(checkpoint);
			skippedLines += first - 1 - checkpoint * 1_024;
			const result = searchCIEvidence(indexedEntry, request);
			matches.push(...result.matches.map(match => match.line));
			expectedCheckpoints.push(...result.matches.map(match => Math.floor((match.line - 1) / 1_024)));
			if (!result.next) {
				assert.strictEqual(result.scannedThrough, entry.lineCount);
				break;
			}
			assert.strictEqual(result.scannedThrough - first + 1, 50_000);
			request = result.next;
		}
		assert.deepStrictEqual({
			checkpointReads, matches,
			indexBytes: entry.lineStartOffsets.byteLength,
			boundedSeeking: skippedLines < 336 * 1_024,
		}, {
			checkpointReads: expectedCheckpoints, matches: [16 * 1024 * 1024 - 4],
			indexBytes: 64 * 1024, boundedSeeking: true,
		});
	});

	test('indexes CRLF, empty and unterminated lines across checkpoint boundaries for every reader', () => {
		const evidence = store.add(new AgentMergeCIEvidenceStore());
		const prefix = `${'setup\r\n'.repeat(1_023)}\r\n`;
		const text = `${prefix}FAIL: first\r\n\r\nFAIL: last`;
		const entry = evidence.tryAdd('scope', 1, { id: 'job', runId: '1', name: 'test' }, { text, truncated: false }, new AbortController().signal)!;
		const expected = [
			{ line: 1_024, column: 1, text: '' },
			{ line: 1_025, column: 1, text: 'FAIL: first' },
			{ line: 1_026, column: 1, text: '' },
			{ line: 1_027, column: 1, text: 'FAIL: last' },
		];
		assert.deepStrictEqual({
			lineCount: entry.lineCount,
			offsets: [...entry.lineStartOffsets],
			range: readCIRange(entry, { startLine: 1_024, endLine: 1_027 }).lines,
			tail: readCITail(entry, 4).lines,
			matches: searchCIEvidence(entry, { startLine: 1_025, query: 'fail', contextLines: 1 }).matches.map(match => ({ line: match.line, excerpt: match.excerpt })),
		}, {
			lineCount: 1_027,
			offsets: [0, prefix.length],
			range: expected, tail: expected,
			matches: [{ line: 1_025, excerpt: expected.slice(0, 3) }, { line: 1_027, excerpt: expected.slice(2) }],
		});
	});

	test('empty evidence has no line-index entries or phantom lines', () => {
		const evidence = store.add(new AgentMergeCIEvidenceStore());
		const entry = evidence.tryAdd('scope', 1, { id: 'job', runId: '1', name: 'test' }, { text: '', truncated: false }, new AbortController().signal)!;
		assert.deepStrictEqual({
			lineCount: entry.lineCount, indexBytes: entry.lineStartOffsets.byteLength,
			range: readCIRange(entry, {}).lines, tail: readCITail(entry).lines,
			search: searchCIEvidence(entry, { query: 'fail' }),
		}, { lineCount: 0, indexBytes: 0, range: [], tail: [], search: { matches: [], scannedThrough: 0, next: undefined } });
	});

	test('does not publish a stale attempt or head if it changes during the download', async () => {
		const h = store.add(new CIHarness());
		h.mutations.beforeDownload = () => { h.mutations.run = { ...h.mutations.run, runAttempt: 2 }; };
		await assert.rejects(h.read(), /attempt changed/);
		h.mutations.beforeDownload = () => { h.snapshot.set(makeSnapshot(1, 'new-head'), undefined); };
		h.mutations.jobs[0] = { ...h.mutations.jobs[0], runAttempt: 2 };
		await assert.rejects(h.read(), /head could not be confirmed/);
	});

	test('cache eviction, cancellation, cursor isolation and disposal have explicit outcomes', () => {
		const evidence = store.add(new AgentMergeCIEvidenceStore());
		const abort = new AbortController();
		const job: GitHubWorkflowJob = { id: 'job', runId: '1', name: 'test' };
		const first = evidence.tryAdd('scope', 1, job, { text: 'redacted', truncated: false }, abort.signal)!;
		const cursor = evidence.continue('scope', { request: { mode: 'tail', evidenceId: first.id } });
		assert.throws(() => evidence.resolve(cursor.cursor, 'other-scope'), /unauthorized/);
		for (let i = 0; i < 8; i++) {
			evidence.tryAdd('scope', 1, { ...job, id: String(i) }, { text: '', truncated: false }, abort.signal);
		}
		assert.throws(() => evidence.get(first.id, 'scope'), /expired/);
		const last = evidence.find('scope', '7', '1', 1)!;
		abort.abort();
		assert.throws(() => evidence.get(last.id, 'scope'), /expired/);
		evidence.dispose();
		assert.throws(() => evidence.resolve(cursor.cursor, 'scope'), /expired/);
	});

	test('tail, range and search preserve line numbers for CRLF, empty and very long lines', () => {
		const evidence = store.add(new AgentMergeCIEvidenceStore());
		const entry = evidence.tryAdd('scope', 1, { id: 'job', runId: '1', name: 'test' }, { text: `one\r\n\r\n${'x'.repeat(10_000)}FAIL`, truncated: false }, new AbortController().signal)!;
		const tail = readCITail(entry, 1);
		assert.deepStrictEqual({
			range: readCIRange(entry, { startLine: 1, endLine: 2 }).lines,
			last: tail.lines.at(-1)?.text.endsWith('FAIL'),
			tailLine: tail.lines.at(-1)?.line,
			tailIsBounded: ciJsonBytes(tail) < agentMergeCIResponseBytes,
			match: searchCIEvidence(entry, { query: 'FAIL' }).matches[0].line,
		}, { range: [{ line: 1, column: 1, text: 'one' }, { line: 2, column: 1, text: '' }], last: true, tailLine: 3, tailIsBounded: true, match: 3 });
	});
});

class CIMutations extends mock<IPullRequestMutations>() {
	run: GitHubWorkflowRun = { id: '1', name: 'CI', headSha: 'head', runAttempt: 1, status: 'COMPLETED', conclusion: 'FAILURE' };
	jobs: GitHubWorkflowJob[] = [];
	log: GitHubWorkflowLog = { text: '1 failing\nAssertionError: failure', truncated: false };
	downloads = 0;
	beforeDownload?: (signal: AbortSignal) => void | Promise<void>;
	beforeJobs?: () => void;
	override async listWorkflowRuns() { return [this.run]; }
	override async listWorkflowJobs(_ref: PullRequestRef, _id: string, _signal: AbortSignal, attempt?: number) {
		assert.strictEqual(attempt, this.run.runAttempt);
		this.beforeJobs?.();
		return this.jobs;
	}
	override async listCheckAnnotations() { return [{ path: 'test.ts', startLine: 1, endLine: 1, level: 'failure', message: 'Process completed with exit code 1' }]; }
	override async downloadWorkflowJobLog(_ref: PullRequestRef, _id: string, signal: AbortSignal) {
		this.downloads++;
		await this.beforeDownload?.(signal);
		return this.log;
	}
}

class CIHarness extends Disposable {
	readonly mutations = new CIMutations();
	readonly snapshot;
	readonly deferred = new Set<string>();
	readonly peerContexts = new Map<string, IAgentMergeTurnContext>();
	context: IAgentMergeTurnContext;
	readonly tools: AgentMergeTools;
	enabled = true;
	refreshes = 0;
	subscriptions = 0;

	constructor(count = 1) {
		super();
		this.snapshot = observableValue(this, makeSnapshot(count));
		const abort = new AbortController();
		this._register(toDisposable(() => abort.abort()));
		this.context = {
			session: 'session', turnId: 'turn', ref, headSha: 'head', actions: ['fixCI'],
			configuration: { ...defaultAgentMergeConfiguration, fixCI: true }, snapshot: this.snapshot.get(), signal: abort.signal,
			commentWatermark: '', deferredCheckIds: this.deferred, initialDeferredCheckIds: new Set(), deferWorkflowRerun: () => false,
		};
		this.mutations.jobs = Array.from({ length: count }, (_, index) => ({
			id: `job-${index}`, checkRunId: `check-${index}`, runId: '1', name: `CI ${index}`, conclusion: 'FAILURE',
			headSha: 'head', runAttempt: 1, steps: [{ number: 1, name: 'Run tests', conclusion: 'FAILURE' }],
		}));
		const harness = this;
		const service = new class extends mock<IGitHubService>() {
			override readonly mutations = harness.mutations;
			override readonly pullRequests = new class extends mock<IPullRequestResources>() {
				override subscribePullRequest() {
					harness.subscriptions++;
					return {
						resource: { ref, snapshot: harness.snapshot }, update: () => { },
						refresh: async () => { harness.refreshes++; },
						dispose: () => { harness.subscriptions--; },
					};
				}
			}();
		}();
		this.tools = this._register(new AgentMergeTools(() => this.enabled, session => session === this.context.session ? this.context : this.peerContexts.get(session), service, new NullLogService()));
	}

	async read(request: AgentMergeCIRequest = {}, session = this.context.session): Promise<CIResult> {
		return JSON.parse(await this.tools.readFailedCI(session, request));
	}

	async evidenceId(): Promise<string> {
		return (await this.read()).items.find(item => item.kind === 'job')!.evidenceId!;
	}
}

function makeSnapshot(count: number, headSha = 'head'): PullRequestSnapshot {
	const missing = { status: 'missing' as const, complete: false };
	const checks: PullRequestCheck[] = Array.from({ length: count }, (_, index) => ({
		id: `check-${index}`, type: 'checkRun', name: `CI ${index}`, required: true, status: 'COMPLETED', conclusion: 'FAILURE',
		detailsUrl: `https://github.com/owner/repo/actions/runs/1/job/job-${index}`,
	}));
	return {
		ref, generation: 1, headGeneration: 1,
		core: {
			status: 'ready', complete: true, value: {
				repositoryNameWithOwner: 'owner/repo', number: 1, title: 'Test', url: 'https://github.com/owner/repo/pull/1',
				state: 'open', draft: false, headSha, headRef: 'feature', baseSha: 'base', baseRef: 'main',
			},
		},
		checks: { status: 'ready', complete: true, headSha, value: { headSha, requirednessComplete: true, expectedSuitesComplete: true, expectedSuites: [], checks } },
		topLevelComments: missing, submittedReviews: missing, inlineComments: missing, reviewThreads: missing, mergeability: missing, participants: missing,
	};
}
