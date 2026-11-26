/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostGitService, canRestageOntoIndexCopy, formatGitError, getWorktreeAddFailureMessage, GitCheckoutProgressParser, isRetryableWorktreeRemovalError, parseChangedPaths, parseDefaultBranchRef, parseDefaultRemoteBranchRef, parseFetchRemoteUrls, parseGitDiffRawNumstat, parseGitHubRepoFromRemote, parseGitStatusV2, parseGitWorktrees, parseHasGitHubRemote, parseSingleLsTreeEntry, parseUntrackedPaths, selectDefaultPushRemote, summarizeStderrForError } from '../../node/agentHostGitService.js';
import { buildGitBlobUri } from '../../node/gitDiffContent.js';
import { URI } from '../../../../base/common/uri.js';
import { isWindows } from '../../../../base/common/platform.js';
import { Branch, EMPTY_TREE_OBJECT, getBaseBranchLabel, getBranchCompletions, GitRefType, IRefQuery, parseBaseBranchRef } from '../../common/agentHostGitService.js';
import { needsSessionGitStateRefresh } from '../../common/state/sessionState.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { AgentHostGitReadTelemetry } from '../../node/agentHostGitReadTelemetry.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IFileService } from '../../../files/common/files.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { gitServiceArguments, type IGitServiceTestOptions } from './agentHostGitServiceTestUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../telemetry/test/common/experimentTriggerTestUtils.js';
import { AgentHostGitCoalesceReadsSettingId } from '../../common/agentService.js';
import { AgentHostGitCoalesceReadsConfigKey } from '../../common/agentHostSchema.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../../common/copilotCliConfig.js';

suite('AgentHostGitService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function gitArguments(options?: IGitServiceTestOptions) {
		return gitServiceArguments(store, new class extends mock<IFileService>() { }(), new class extends mock<INativeEnvironmentService>() { }(), new NullLogService(), options);
	}

	test('parses managed inventory branches and unquoted paths without splitting embedded newlines', () => {
		const path = '/repo.worktrees/path with\n"quotes"';
		assert.deepStrictEqual(parseGitWorktrees(`worktree /repo\0HEAD abc\0branch refs/heads/main\0\0worktree ${path}\0HEAD def\0branch refs/heads/agents/recovered\0\0worktree /detached\0HEAD abc\0detached\0\0`), [
			{ path: URI.file('/repo'), branchName: 'main' },
			{ path: URI.file(path), branchName: 'agents/recovered' },
			{ path: URI.file('/detached'), branchName: undefined },
		]);
	});

	test('overlapping branch lookups share work only for the same directory and branch', async () => {
		const reads: { directory: string; pattern: IRefQuery['pattern'] }[] = [];
		const answers: DeferredPromise<Branch[]>[] = [];
		const git = store.add(new class extends AgentHostGitService {
			override getBranches(directory: URI, query?: IRefQuery): Promise<Branch[]> {
				reads.push({ directory: directory.toString(), pattern: query?.pattern });
				const answer = new DeferredPromise<Branch[]>();
				answers.push(answer);
				return answer.p;
			}
		}(...gitArguments()));
		const directory = URI.file('/repo');
		const first = git.getBranch(directory, 'main');
		const shared = git.getBranch(directory, 'main');
		const otherBranch = git.getBranch(directory, 'feature');
		const otherDirectory = git.getBranch(URI.file('/other'), 'main');
		await answers[0].complete([{ kind: GitRefType.Head, name: 'main', ref: 'refs/heads/main' }]);
		await answers[1].complete([{ kind: GitRefType.Head, name: 'feature', ref: 'refs/heads/feature' }]);
		await answers[2].complete([]);
		const results = await Promise.all([first, shared, otherBranch, otherDirectory]);
		const refreshed = git.getBranch(directory, 'main');
		await answers[3].complete([]);
		assert.deepStrictEqual({
			shared: first === shared, reads, results: results.map(branch => branch?.name), refreshed: await refreshed,
		}, {
			shared: true,
			reads: [
				{ directory: directory.toString(), pattern: ['refs/heads/main', 'refs/remotes/main'] },
				{ directory: directory.toString(), pattern: ['refs/heads/feature', 'refs/remotes/feature'] },
				{ directory: URI.file('/other').toString(), pattern: ['refs/heads/main', 'refs/remotes/main'] },
				{ directory: directory.toString(), pattern: ['refs/heads/main', 'refs/remotes/main'] },
			],
			results: ['main', 'main', 'feature', undefined], refreshed: undefined,
		});
	});

	test('a rejected shared branch lookup is surfaced to every caller and can be retried', async () => {
		const failure = new DeferredPromise<Branch[]>();
		let reads = 0;
		const git = store.add(new class extends AgentHostGitService {
			override getBranches(): Promise<Branch[]> {
				reads++;
				return reads === 1 ? failure.p : Promise.resolve([]);
			}
		}(...gitArguments()));
		const directory = URI.file('/repo');
		const results = Promise.allSettled([git.getBranch(directory, 'main'), git.getBranch(directory, 'main')]);
		const error = new Error('Git unavailable');
		await failure.error(error);
		const failed = await results;
		assert.deepStrictEqual({ failed, retried: await git.getBranch(directory, 'main'), reads }, {
			failed: [{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }],
			retried: undefined, reads: 2,
		});
	});

	suite('read-only git commands', () => {
		function createGit(options?: IGitServiceTestOptions) {
			const spawned: string[] = [];
			const answers: DeferredPromise<string | undefined>[] = [];
			let running = 0;
			let peak = 0;
			const args = gitArguments(options);
			const git = store.add(new class extends AgentHostGitService {
				run(directory: URI, args: string[], options?: { readonly throwOnError?: boolean; readonly failFastAfterTimeout?: boolean }) {
					return this._runGit(directory, args, options);
				}
				protected override _spawnGit(directory: URI, args: readonly string[], _options?: unknown, onTimedOut?: () => void): Promise<string | undefined> {
					spawned.push(`${directory.path} ${args.join(' ')}`);
					const answer = new DeferredPromise<string | undefined>();
					answers.push(answer);
					running++;
					peak = Math.max(peak, running);
					timedOut.push(() => onTimedOut?.());
					return answer.p.finally(() => running--);
				}
			}(...args));
			const timedOut: (() => void)[] = [];
			return { git, configurationService: args[3], spawned, answers, timedOut, peak: () => peak };
		}

		test('identical concurrent reads share one process and later reads spawn again', async () => {
			const { git, spawned, answers } = createGit();
			const directory = URI.file('/repo');
			const reads = [git.run(directory, ['status', '-z']), git.run(directory, ['status', '-z']), git.run(directory, ['status', '-z']), git.run(URI.file('/other'), ['status', '-z']), git.run(directory, ['rev-parse', 'HEAD'])];
			answers.forEach((answer, index) => answer.complete(`out${index}`));
			const results = await Promise.all(reads);
			const next = git.run(directory, ['status', '-z']);
			answers[answers.length - 1].complete('later');
			assert.deepStrictEqual({ spawned, results, next: await next }, {
				spawned: ['/repo status -z', '/other status -z', '/repo rev-parse HEAD', '/repo status -z'],
				results: ['out0', 'out0', 'out0', 'out1', 'out2'],
				next: 'later',
			});
		});

		test('a write makes later reads start their own process', async () => {
			const { git, spawned, answers } = createGit();
			const directory = URI.file('/repo');
			const before = git.run(directory, ['status', '-z']);
			const write = git.run(directory, ['checkout', 'main']);
			const after = git.run(directory, ['status', '-z']);
			answers.forEach(answer => answer.complete('ok'));
			await Promise.all([before, write, after]);
			assert.deepStrictEqual(spawned, ['/repo status -z', '/repo checkout main', '/repo status -z']);
		});

		test('a write in a linked worktree or a ref deletion stops later reads from joining reads already running', async () => {
			const { git, spawned, answers } = createGit();
			const repository = URI.file('/repo');
			const beforeFetch = git.run(repository, ['merge-base', 'a', 'b']);
			const fetch = git.run(URI.file('/repo.worktrees/session'), ['fetch', 'origin']);
			const afterFetch = git.run(repository, ['merge-base', 'a', 'b']);
			answers.forEach(answer => answer.complete('ok'));
			await Promise.all([beforeFetch, fetch, afterFetch]);

			// A directory that exists, because the deletion runs a real git process there.
			const directory = URI.file(tmpdir());
			const beforeDeletion = git.run(directory, ['for-each-ref', 'refs/heads']);
			await git.deleteRefs(directory, ['refs/heads/agent-host-git-test-missing']);
			const afterDeletion = git.run(directory, ['for-each-ref', 'refs/heads']);
			answers.forEach(answer => !answer.isSettled && answer.complete('ok'));
			await Promise.all([beforeDeletion, afterDeletion]);
			assert.deepStrictEqual(spawned, [
				'/repo merge-base a b',
				'/repo.worktrees/session fetch origin',
				'/repo merge-base a b',
				`${directory.path} for-each-ref refs/heads`,
				`${directory.path} for-each-ref refs/heads`,
			]);
		});

		test('deleting refs in a directory that is not a repository resolves although git exits before reading its input', async () => {
			const { git } = createGit();
			// Enough input that the write fails once git has exited; a handled EPIPE must not surface as an uncaught error.
			const refs = Array.from({ length: 50_000 }, (_, index) => `refs/heads/agent-host-git-test-missing-${index}`);
			await git.deleteRefs(URI.file(tmpdir()), refs);
		});

		test('a caller that joins a running read is measured from its own request', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const events: { reads: unknown; sharedReads: unknown; verySlowReads: unknown }[] = [];
			class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
				override publicLog2(eventName?: string, data?: object): void {
					super.publicLog2(eventName, data);
					if (eventName === 'agentHost.gitReads' && data) {
						const { reads, sharedReads, verySlowReads } = data as Record<string, unknown>;
						events.push({ reads, sharedReads, verySlowReads });
					}
				}
			}
			const { git, answers } = createGit({ coalesceReads: true, telemetryService: new RecordingTelemetryService() });
			const directory = URI.file('/repo');
			const first = git.run(directory, ['status', '-z']);
			await timeout(1_000);
			const joined = git.run(directory, ['status', '-z']);
			await timeout(20_000);
			answers[0].complete('out');
			await Promise.all([first, joined]);
			git.dispose();
			assert.deepStrictEqual(events, [{ reads: 2, sharedReads: 1, verySlowReads: 2 }]);
		}));

		test('a read that completes after its window was reported is reported with the next window', () => {
			const events: { reads: unknown; readTotalMs: unknown; timeouts: unknown; slowReads: unknown }[] = [];
			class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
				override publicLog2(eventName?: string, data?: object): void {
					super.publicLog2(eventName, data);
					if (eventName === 'agentHost.gitReads' && data) {
						const { reads, readTotalMs, timeouts, slowReads } = data as Record<string, unknown>;
						events.push({ reads, readTotalMs, timeouts, slowReads });
					}
				}
			}
			const telemetry = store.add(new AgentHostGitReadTelemetry(new RecordingTelemetryService()));
			telemetry.readRequested('coalesced');
			telemetry.flush();
			telemetry.spawnTimedOut();
			telemetry.readCompleted(30_000);
			telemetry.flush();
			assert.deepStrictEqual(events, [
				{ reads: 1, readTotalMs: 0, timeouts: 0, slowReads: 0 },
				{ reads: 0, readTotalMs: 30_000, timeouts: 1, slowReads: 1 },
			]);
		});

		test('the final window is reported when the host asks for a flush at shutdown', () => {
			const events: { reads: unknown }[] = [];
			class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
				override publicLog2(eventName?: string, data?: object): void {
					super.publicLog2(eventName, data);
					if (eventName === 'agentHost.gitReads' && data) {
						events.push({ reads: (data as Record<string, unknown>).reads });
					}
				}
			}
			const { git, answers } = createGit({ coalesceReads: true, telemetryService: new RecordingTelemetryService() });
			git.run(URI.file('/repo'), ['status', '-z']);
			git.flushTelemetry();
			answers[0].complete('out');
			assert.deepStrictEqual(events, [{ reads: 1 }]);
		});

		test('distinct reads never exceed the host-wide limit', async () => {
			const { git, spawned, answers, peak } = createGit();
			const reads: Promise<string | undefined>[] = [];
			for (let i = 0; i < 50; i++) {
				reads.push(git.run(URI.file(`/repo${i}`), ['status', '-z']));
			}
			while (answers.length < 50) {
				answers.filter(a => !a.isSettled).forEach(a => a.complete('ok'));
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			answers.forEach(a => !a.isSettled && a.complete('ok'));
			await Promise.all(reads);
			assert.deepStrictEqual({ spawned: spawned.length, peak: peak() }, { spawned: 50, peak: 8 });
		});

		test('a read that just timed out is not started again right away when its caller opts in', async () => {
			const { git, spawned, answers, timedOut } = createGit();
			const directory = URI.file('/repo');
			const first = git.run(directory, ['status', '-z'], { failFastAfterTimeout: true });
			timedOut[0]();
			answers[0].complete(undefined);
			await first;
			const skipped = await git.run(directory, ['status', '-z'], { failFastAfterTimeout: true });
			const other = git.run(directory, ['status', '-z']);
			answers[1].complete('fresh');
			assert.deepStrictEqual({ spawned, skipped, other: await other }, { spawned: ['/repo status -z', '/repo status -z'], skipped: undefined, other: 'fresh' });
		});

		test('with the setting off every read spawns its own process, unlimited and never skipped', async () => {
			const { git, spawned, answers, timedOut, peak } = createGit({ coalesceReads: false });
			const directory = URI.file('/repo');
			const shared = [git.run(directory, ['status', '-z']), git.run(directory, ['status', '-z'])];
			const many = Array.from({ length: 20 }, (_, index) => git.run(directory, ['rev-parse', `ref${index}`]));
			timedOut[0]();
			answers.forEach(answer => answer.complete(undefined));
			await Promise.all([...shared, ...many]);
			const next = git.run(directory, ['status', '-z'], { failFastAfterTimeout: true });
			answers[answers.length - 1].complete(undefined);
			await next;
			assert.deepStrictEqual({ spawned: spawned.length, peak: peak() }, { spawned: 23, peak: 22 });
		});

		test('reports the experiment trigger and one aggregated event naming the arm', async () => {
			class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
				readonly events: { arm: unknown; reads: unknown; sharedReads: unknown; failFastSkips: unknown }[] = [];
				override publicLog2(eventName?: string, data?: object): void {
					super.publicLog2(eventName, data);
					if (eventName === 'agentHost.gitReads' && data) {
						const { arm, reads, sharedReads, failFastSkips } = data as Record<string, unknown>;
						this.events.push({ arm, reads, sharedReads, failFastSkips });
					}
				}
			}
			const results: Record<string, { triggers: string[]; events: unknown[] }> = {};
			for (const coalesceReads of [true, false]) {
				const telemetryService = new RecordingTelemetryService();
				const { git, configurationService, answers } = createGit({ coalesceReads, telemetryService });
				configurationService.publishRootTransientValues({ [CopilotCliVSCodeAssignmentContextKey]: 'assignment-context' });
				const directory = URI.file('/repo');
				const reads = [git.run(directory, ['status', '-z']), git.run(directory, ['status', '-z'])];
				answers.forEach(answer => answer.complete('out'));
				await Promise.all(reads);
				git.dispose();
				results[coalesceReads ? 'on' : 'off'] = { triggers: telemetryService.triggers, events: telemetryService.events };
			}
			const trigger = [`config.${AgentHostGitCoalesceReadsSettingId}`];
			assert.deepStrictEqual(results, {
				on: { triggers: trigger, events: [{ arm: 'coalesced', reads: 2, sharedReads: 1, failFastSkips: 0 }] },
				off: { triggers: trigger, events: [{ arm: 'passthrough', reads: 2, sharedReads: 0, failFastSkips: 0 }] },
			});
		});
		test('a git command that fails to start leaves no live process counted', async () => {
			const events: unknown[] = [];
			class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
				override publicLog2(eventName?: string, data?: object): void {
					super.publicLog2(eventName, data);
					if (eventName === 'agentHost.gitReads' && data) {
						events.push({ arm: (data as Record<string, unknown>).arm, spawns: (data as Record<string, unknown>).spawns, peakLiveProcesses: (data as Record<string, unknown>).peakLiveProcesses });
					}
				}
			}
			const args = gitArguments({ coalesceReads: true, telemetryService: new RecordingTelemetryService() });
			const git = store.add(new class extends AgentHostGitService {
				run(directory: URI, args: string[]) {
					return this._runGit(directory, args);
				}
			}(...args));
			const missing = URI.joinPath(URI.file(tmpdir()), 'agent-host-git-missing-directory');
			// Sequential, so a leaked count would show as a growing peak in the window that follows.
			for (const ref of ['a', 'b', 'c']) {
				await git.run(missing, ['rev-parse', ref]);
			}
			args[3].updateRootConfig({ [AgentHostGitCoalesceReadsConfigKey]: false });
			await git.run(missing, ['rev-parse', 'd']);
			git.dispose();
			assert.deepStrictEqual(events, [
				{ arm: 'coalesced', spawns: 3, peakLiveProcesses: 1 },
				{ arm: 'passthrough', spawns: 1, peakLiveProcesses: 1 },
			]);
		});
	});

	suite('getRepositoryRoot', () => {
		// An existing directory, so lookups reach the stubbed git probe.
		const directory = URI.file(tmpdir());

		function createGitService(runGit: () => Promise<string | undefined>): AgentHostGitService {
			return store.add(new class extends AgentHostGitService {
				protected override _runGit(): Promise<string | undefined> {
					return runGit();
				}
			}(...gitArguments()));
		}

		test('concurrent forced lookups share a failed probe without caching an I/O failure', async () => {
			const started = new DeferredPromise<void>();
			const answer = new DeferredPromise<string | undefined>();
			let probes = 0;
			const git = createGitService(() => {
				probes++;
				void started.complete();
				return answer.p;
			});
			const first = git.getRepositoryRoot(directory, { refreshIfNone: true });
			await started.p;
			const second = git.getRepositoryRoot(directory, { refreshIfNone: true });
			await answer.error(new Error('Git unavailable'));
			const roots = await Promise.all([first, second]);

			assert.deepStrictEqual({ roots, probes, availability: git.hasGitRoot(directory).get() }, {
				roots: [undefined, undefined], probes: 1, availability: undefined,
			});
		});

		test('a forced lookup after a shared failed probe settles re-probes', async () => {
			const answer = new DeferredPromise<string | undefined>();
			let probes = 0;
			const git = createGitService(() => ++probes === 1 ? answer.p : Promise.resolve(directory.fsPath));
			const pending = Promise.all([
				git.getRepositoryRoot(directory, { refreshIfNone: true }),
				git.getRepositoryRoot(directory, { refreshIfNone: true }),
			]);
			await answer.complete(undefined);
			const before = await pending;
			const after = await git.getRepositoryRoot(directory, { refreshIfNone: true });

			assert.deepStrictEqual({ before, after: after?.fsPath, probes }, {
				before: [undefined, undefined], after: directory.fsPath, probes: 2,
			});
		});
	});

	test('sorts the current and default branches before recent branches', () => {
		assert.deepStrictEqual(
			getBranchCompletions(
				['feature/recent', 'dev', 'feature/current', 'main', 'feature/older'],
				{ currentBranch: 'feature/current', defaultBranch: 'dev' },
			),
			['feature/current', 'dev', 'feature/recent', 'main', 'feature/older'],
		);
	});

	test('preserves git order for branches other than the current and default branches', () => {
		assert.deepStrictEqual(
			getBranchCompletions(
				['feature/recent', 'release', 'feature/older'],
				{ currentBranch: 'other', defaultBranch: 'main' },
			),
			['feature/recent', 'release', 'feature/older'],
		);
	});

	suite('GitCheckoutProgressParser', () => {
		function collect(chunks: readonly string[]): { filesDone: number; filesTotal: number }[] {
			const reported: { filesDone: number; filesTotal: number }[] = [];
			const parser = new GitCheckoutProgressParser(progress => reported.push(progress));
			for (const chunk of chunks) {
				parser.push(chunk);
			}
			return reported;
		}

		test('forwards every complete sample and ignores non-progress output', () => {
			assert.deepStrictEqual(collect([
				'Preparing worktree (new branch agents/foo)\n',
				'Updating files:   1% (8/800)\rUpdating files:   2% (16/800)\r',
				'Updating files:   2% (20/800)\r',
				'Updating files: 100% (800/800), done.\n',
			]), [
				{ filesDone: 8, filesTotal: 800 },
				{ filesDone: 16, filesTotal: 800 },
				{ filesDone: 20, filesTotal: 800 },
				{ filesDone: 800, filesTotal: 800 },
			]);
		});

		test('holds back a sample split across chunk boundaries until it completes', () => {
			assert.deepStrictEqual(collect(['Updating files:  42% (33', '6/800)\r']), [
				{ filesDone: 336, filesTotal: 800 },
			]);
		});
	});

	suite('parseGitStatusV2', () => {
		test('parses a clean checkout with upstream', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head main',
				'# branch.upstream origin/main',
				'# branch.ab +0 -0',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: 'main',
				isDetachedHead: undefined,
				upstreamBranchName: 'origin/main',
				outgoingChanges: 0,
				incomingChanges: 0,
				uncommittedChanges: 0,
			});
		});

		test('parses a dirty branch ahead and behind upstream', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head feature',
				'# branch.upstream origin/feature',
				'# branch.ab +3 -2',
				'1 .M N... 100644 100644 100644 abc abc src/a.ts',
				'2 R. N... 100644 100644 100644 abc abc R100 src/b.ts\tsrc/old-b.ts',
				'? src/untracked.ts',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: 'feature',
				isDetachedHead: undefined,
				upstreamBranchName: 'origin/feature',
				outgoingChanges: 3,
				incomingChanges: 2,
				uncommittedChanges: 3,
			});
		});

		test('treats (detached) HEAD as no branch and omits upstream/ab when absent', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head (detached)',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: undefined,
				isDetachedHead: true,
				upstreamBranchName: undefined,
				outgoingChanges: undefined,
				incomingChanges: undefined,
				uncommittedChanges: 0,
			});
		});

		test('returns empty object for undefined input', () => {
			assert.deepStrictEqual(parseGitStatusV2(undefined), {});
		});
	});

	suite('needsSessionGitStateRefresh', () => {
		test('separates a branch-less probe failure from a detached HEAD', () => {
			assert.deepStrictEqual({
				neverComputed: needsSessionGitStateRefresh(undefined),
				// The residue of a failed `git status`, as persisted before the
				// probe learned to withhold state it could not compute.
				probeFailureRemnant: needsSessionGitStateRefresh({ baseBranchName: 'main' }),
				detachedHead: needsSessionGitStateRefresh({ isDetachedHead: true, baseBranchName: 'main' }),
				onABranch: needsSessionGitStateRefresh({ branchName: 'feature', baseBranchName: 'main' }),
			}, {
				neverComputed: true,
				probeFailureRemnant: true,
				detachedHead: false,
				onABranch: false,
			});
		});
	});

	suite('parseHasGitHubRemote', () => {
		test('detects ssh github remote', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\tgit@github.com:owner/repo.git (fetch)\n'), true);
		});
		test('detects https github remote', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\thttps://github.com/owner/repo.git (fetch)\n'), true);
		});
		test('returns false for non-github remotes', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\thttps://gitlab.com/owner/repo.git (fetch)\n'), false);
		});
		test('returns false when there are no remotes', () => {
			assert.strictEqual(parseHasGitHubRemote(''), false);
		});
		test('returns undefined when probe failed (output absent)', () => {
			assert.strictEqual(parseHasGitHubRemote(undefined), undefined);
		});
	});

	suite('parseDefaultBranchRef', () => {
		test('strips refs/remotes/origin/ prefix', () => {
			assert.strictEqual(parseDefaultBranchRef('refs/remotes/origin/main\n'), 'main');
		});
		test('returns the ref as-is when prefix is not present', () => {
			assert.strictEqual(parseDefaultBranchRef('main'), 'main');
		});
		test('returns undefined for empty/missing output', () => {
			assert.strictEqual(parseDefaultBranchRef(undefined), undefined);
			assert.strictEqual(parseDefaultBranchRef('   '), undefined);
		});
	});

	suite('parseDefaultRemoteBranchRef', () => {
		test('splits an origin remote-tracking ref into the default branch and its remote branch', () => {
			assert.deepStrictEqual({
				main: parseDefaultRemoteBranchRef('refs/remotes/origin/main\n'),
				nested: parseDefaultRemoteBranchRef('refs/remotes/origin/release/1.0'),
				otherRemote: parseDefaultRemoteBranchRef('refs/remotes/upstream/main'),
				localRef: parseDefaultRemoteBranchRef('refs/heads/main'),
				prefixOnly: parseDefaultRemoteBranchRef('refs/remotes/origin/'),
				missing: parseDefaultRemoteBranchRef(undefined),
			}, {
				main: { branchName: 'main', remoteBranchName: 'origin/main' },
				nested: { branchName: 'release/1.0', remoteBranchName: 'origin/release/1.0' },
				otherRemote: undefined,
				localRef: undefined,
				prefixOnly: undefined,
				missing: undefined,
			});
		});
	});

	suite('parseGitHubRepoFromRemote', () => {
		test('parses only the requested fork remote', () => {
			const out = [
				'origin\tgit@github.com:base-owner/repo.git (fetch)',
				'fork\thttps://github.com/fork-owner/repo.git (fetch)',
			].join('\n');
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out, 'fork'), { owner: 'fork-owner', repo: 'repo' });
		});

		test('does not fall back when the requested remote is not GitHub', () => {
			const out = [
				'origin\tgit@github.com:base-owner/repo.git (fetch)',
				'fork\thttps://gitlab.com/fork-owner/repo.git (fetch)',
			].join('\n');
			assert.strictEqual(parseGitHubRepoFromRemote(out, 'fork'), undefined);
		});

		test('parses ssh (scp-like) origin remote', () => {
			const out = 'origin\tgit@github.com:microsoft/vscode.git (fetch)\norigin\tgit@github.com:microsoft/vscode.git (push)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('parses https origin remote without .git suffix', () => {
			const out = 'origin\thttps://github.com/microsoft/vscode (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('parses ssh:// scheme remote', () => {
			const out = 'origin\tssh://git@github.com/microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('prefers origin over other remotes', () => {
			const out =
				'fork\tgit@github.com:me/vscode.git (fetch)\n' +
				'origin\tgit@github.com:microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('falls back to first github remote when origin is not github', () => {
			const out =
				'origin\tgit@gitlab.com:foo/bar.git (fetch)\n' +
				'upstream\thttps://github.com/microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('returns undefined when no remotes are present', () => {
			assert.strictEqual(parseGitHubRepoFromRemote(''), undefined);
			assert.strictEqual(parseGitHubRepoFromRemote(undefined), undefined);
		});
		test('returns undefined when no GitHub remote is present', () => {
			const out = 'origin\thttps://gitlab.com/foo/bar.git (fetch)\n';
			assert.strictEqual(parseGitHubRepoFromRemote(out), undefined);
		});
	});

	test('orders fetch remote URLs with origin first and excludes push URLs', () => {
		assert.deepStrictEqual(parseFetchRemoteUrls([
			'upstream\tgit@github.com:microsoft/vscode.git (fetch)',
			'origin\thttps://github.com/me/vscode.git (push)',
			'origin\thttps://github.com/me/vscode.git (fetch)',
		].join('\n')), [
			'https://github.com/me/vscode.git',
			'git@github.com:microsoft/vscode.git',
		]);
	});

	test('reads fetch remote URLs of partial clones', () => {
		assert.deepStrictEqual(parseFetchRemoteUrls([
			'origin\thttps://github.com/microsoft/vscode.git (fetch) [blob:none]',
			'origin\thttps://github.com/microsoft/vscode.git (push)',
		].join('\n')), [
			'https://github.com/microsoft/vscode.git',
		]);
	});

	test('prefers the branch upstream remote before origin', () => {
		assert.deepStrictEqual(parseFetchRemoteUrls([
			'origin\thttps://github.com/me/vscode.git (fetch)',
			'upstream\thttps://github.com/microsoft/vscode.git (fetch)',
		].join('\n'), 'upstream'), [
			'https://github.com/microsoft/vscode.git',
			'https://github.com/me/vscode.git',
		]);
	});

	test('selects the default push remote when a branch has no upstream', () => {
		const remotes = (...entries: [name: string, url: string][]) => entries.map(([name, url]) => `${name}\t${url} (fetch)\n${name}\t${url} (push)`).join('\n');
		assert.deepStrictEqual({
			onlyUpstream: selectDefaultPushRemote(remotes(['upstream', 'https://github.com/microsoft/vscode.git']), undefined),
			configuredPushRemote: selectDefaultPushRemote(remotes(['origin', 'https://github.com/me/vscode.git'], ['upstream', 'https://github.com/microsoft/vscode.git']), 'upstream'),
			originPreferred: selectDefaultPushRemote(remotes(['fork', 'https://github.com/me/vscode.git'], ['origin', 'https://github.com/microsoft/vscode.git']), undefined),
			gitHubRemote: selectDefaultPushRemote(remotes(['gitlab', 'https://gitlab.com/me/vscode.git'], ['upstream', 'git@github.com:microsoft/vscode.git']), undefined),
			nonGitHubOrigin: selectDefaultPushRemote(remotes(['origin', 'https://gitlab.com/me/vscode.git'], ['other', 'https://example.com/vscode.git']), undefined),
			onlyNonGitHub: selectDefaultPushRemote(remotes(['other', 'https://example.com/vscode.git']), undefined),
			ambiguous: selectDefaultPushRemote(remotes(['a', 'https://example.com/a.git'], ['b', 'https://example.com/b.git']), undefined),
		}, {
			onlyUpstream: 'upstream',
			configuredPushRemote: 'upstream',
			originPreferred: 'origin',
			gitHubRemote: 'upstream',
			nonGitHubOrigin: 'origin',
			onlyNonGitHub: 'other',
			ambiguous: undefined,
		});
	});

	suite('parseUntrackedPaths', () => {
		test('returns empty for empty/undefined output', () => {
			assert.deepStrictEqual(parseUntrackedPaths(undefined), []);
			assert.deepStrictEqual(parseUntrackedPaths(''), []);
		});

		test('extracts untracked entries and skips others', () => {
			// `git status --porcelain=v1 -z` emits NUL-separated entries; the
			// rename entry includes a second NUL-separated "from" path that
			// must be skipped.
			const out = '?? new.txt\x00 M edited.txt\x00R  to.txt\x00from.txt\x00?? other.txt\x00';
			assert.deepStrictEqual(parseUntrackedPaths(out), ['new.txt', 'other.txt']);
		});
	});

	suite('parseChangedPaths', () => {
		test('returns every changed path including delete and index rename/copy sources', () => {
			const out = [
				' M modified.txt',
				'A  added.txt',
				' D deleted.txt',
				'?? untracked.txt',
				'R  renamed-new.txt',
				'renamed-old.txt',
				' C copied-new.txt',
				'copied-old.txt',
				'AD deleted-index-addition.txt',
				'RD deleted-rename-destination.txt',
				'rename-source.txt',
				' M modified.txt',
				'',
			].join('\x00');

			assert.deepStrictEqual(parseChangedPaths(out), [
				'modified.txt',
				'added.txt',
				'deleted.txt',
				'untracked.txt',
				'renamed-new.txt',
				'renamed-old.txt',
				'copied-new.txt',
				'copied-old.txt',
				'rename-source.txt',
			]);
		});

		test('returns worktree rename/copy source paths too', () => {
			const out = [
				' R worktree-renamed-new.txt',
				'worktree-renamed-old.txt',
				' C worktree-copied-new.txt',
				'worktree-copied-old.txt',
				'',
			].join('\x00');

			assert.deepStrictEqual(parseChangedPaths(out), [
				'worktree-renamed-new.txt',
				'worktree-renamed-old.txt',
				'worktree-copied-new.txt',
				'worktree-copied-old.txt',
			]);
		});
	});

	suite('canRestageOntoIndexCopy', () => {
		test('copies only HEAD-equivalent indexes without staged blob metadata', () => {
			const statuses = [' M', 'M ', 'MM', 'A ', 'AM', ' D', ' T', 'T ', '??', 'D ', 'AD', 'R ', 'C ', ' R', 'UU', 'AA', 'DD'];
			assert.deepStrictEqual(
				Object.fromEntries(statuses.map(status => [status, canRestageOntoIndexCopy(`${status} file.txt\x00`)])),
				{
					' M': true, 'M ': false, 'MM': false, 'A ': false, 'AM': false, ' D': true, ' T': true, 'T ': false, '??': true,
					'D ': false, 'AD': false, 'R ': false, 'C ': false, ' R': false, 'UU': false, 'AA': false, 'DD': false,
				},
			);
		});
	});

	suite('parseGitDiffRawNumstat', () => {
		const root = URI.file('/repo');
		const sessionUri = 'copilot:/abc';
		const sha = 'cafe1234cafe1234cafe1234cafe1234cafe1234';

		test('parses an add, modify, delete and rename in a single stream', () => {
			// Format: alternating `--raw` and `--numstat` segments separated by
			// NUL bytes. Renames have an extra path segment in both halves.
			const segments: string[] = [
				':100644 100644 0000000 1111111 M', 'modified.ts',
				':000000 100644 0000000 2222222 A', 'added.ts',
				':100644 000000 3333333 0000000 D', 'deleted.ts',
				':100644 100644 4444444 5555555 R100', 'old/path.ts', 'new/path.ts',
				'5\t2\tmodified.ts',
				'10\t0\tadded.ts',
				'0\t7\tdeleted.ts',
				'3\t3\t', 'old/path.ts', 'new/path.ts',
				'',
			];
			const out = segments.join('\x00');
			const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
			assert.deepStrictEqual(diffs, [
				{
					before: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'modified.ts', '/repo/modified.ts') } },
					after: { uri: 'file:///repo/modified.ts', content: { uri: 'file:///repo/modified.ts' } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///repo/added.ts', content: { uri: 'file:///repo/added.ts' } },
					diff: { added: 10, removed: 0 },
				},
				{
					before: { uri: 'file:///repo/deleted.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'deleted.ts', '/repo/deleted.ts') } },
					diff: { added: 0, removed: 7 },
				},
				{
					before: { uri: 'file:///repo/old/path.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'old/path.ts', '/repo/old/path.ts') } },
					after: { uri: 'file:///repo/new/path.ts', content: { uri: 'file:///repo/new/path.ts' } },
					diff: { added: 3, removed: 3 },
				},
			]);
		});

		test('treats `-` numstat values (binary) as zero', () => {
			const out = [':100644 100644 0 0 M', 'image.png', '-\t-\timage.png', ''].join('\x00');
			const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
			assert.strictEqual(diffs.length, 1);
			assert.deepStrictEqual(diffs[0].diff, { added: 0, removed: 0 });
		});

		test('returns empty for empty input', () => {
			assert.deepStrictEqual(parseGitDiffRawNumstat('', root, sessionUri, sha), []);
		});

		test('anchors after side to afterRef when provided (ref->ref diffs)', () => {
			// In a checkpoint / ref->ref diff, both the before and the after
			// content must be anchored to commits — never to the working
			// tree. With `afterRef` set, both `after.uri` and
			// `after.content.uri` are `git-blob:` URIs so the diff reflects
			// the state at that commit even if the working tree diverges
			// (e.g. file renamed, deleted, or modified on disk since).
			const toSha = 'beef5678beef5678beef5678beef5678beef5678';
			const segments: string[] = [
				':100644 100644 0000000 1111111 M', 'modified.ts',
				':000000 100644 0000000 2222222 A', 'added.ts',
				':100644 000000 3333333 0000000 D', 'deleted.ts',
				':100644 100644 4444444 5555555 R100', 'old/path.ts', 'new/path.ts',
				'5\t2\tmodified.ts',
				'10\t0\tadded.ts',
				'0\t7\tdeleted.ts',
				'3\t3\t', 'old/path.ts', 'new/path.ts',
				'',
			];
			const diffs = parseGitDiffRawNumstat(segments.join('\x00'), root, sessionUri, sha, toSha);
			assert.deepStrictEqual(diffs, [
				{
					before: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'modified.ts', '/repo/modified.ts') } },
					after: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'modified.ts', '/repo/modified.ts') } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///repo/added.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'added.ts', '/repo/added.ts') } },
					diff: { added: 10, removed: 0 },
				},
				{
					before: { uri: 'file:///repo/deleted.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'deleted.ts', '/repo/deleted.ts') } },
					diff: { added: 0, removed: 7 },
				},
				{
					before: { uri: 'file:///repo/old/path.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'old/path.ts', '/repo/old/path.ts') } },
					after: { uri: 'file:///repo/new/path.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'new/path.ts', '/repo/new/path.ts') } },
					diff: { added: 3, removed: 3 },
				},
			]);
		});
	});

	test('exports the well-known empty-tree object SHA', () => {
		assert.strictEqual(EMPTY_TREE_OBJECT, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
	});

	suite('formatGitError', () => {
		test('reports timeout when our timer fired and summarises progress-meter stderr', () => {
			const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' as const });
			const progress = 'Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r';
			assert.strictEqual(
				formatGitError(['worktree', 'add', '-b', 'x', '/tmp/y', 'origin/main'], 30_000, true, err, progress),
				'git worktree timed out after 30000ms: Updating files:   0% (149/14834)',
			);
		});

		test('reports kill signal when killed but not by our timer', () => {
			const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' as const });
			assert.strictEqual(
				formatGitError(['worktree', 'add'], 30_000, false, err, ''),
				'git worktree killed by SIGTERM',
			);
		});

		test('reports numeric exit code when git failed normally', () => {
			const err = Object.assign(new Error('Command failed'), { code: 128 });
			assert.strictEqual(
				formatGitError(['worktree', 'add', '/tmp/y', 'missing-branch'], 30_000, false, err, 'fatal: invalid reference: missing-branch\n'),
				'git worktree exited with code 128: fatal: invalid reference: missing-branch',
			);
		});

		test('keeps missing git-lfs error over the later generic fatal line', () => {
			const err = Object.assign(new Error('Command failed'), { code: 128 });
			const stderr = [
				'Preparing worktree (new branch \'agents/example\')',
				'git-lfs filter-process: git-lfs: command not found',
				'fatal: the remote end hung up unexpectedly',
			].join('\n');
			assert.strictEqual(
				formatGitError(['worktree', 'add', '--no-track', '-b', 'agents/example', '/tmp/worktree', 'origin/main'], 60_000, false, err, stderr),
				'git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found',
			);
		});

		test('names the subcommand after leading -c options', () => {
			const err = Object.assign(new Error('Command failed'), { code: 128 });
			assert.strictEqual(
				formatGitError(['-c', 'checkout.workers=0', 'worktree', 'add', '/tmp/y', 'main'], 30_000, false, err, 'fatal: invalid reference: main\n'),
				'git worktree exited with code 128: fatal: invalid reference: main',
			);
		});

		test('falls back to error message when there is no signal or exit code', () => {
			const err = new Error('spawn git ENOENT');
			assert.strictEqual(
				formatGitError(['status'], 5_000, false, err, ''),
				'spawn git ENOENT',
			);
		});
	});

	suite('isRetryableWorktreeRemovalError', () => {
		test('retries transient lock / dir-not-empty races but not fatal removal errors', () => {
			assert.deepStrictEqual({
				dirNotEmpty: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 255: error: failed to delete '.git/worktrees/reply-exactly-materialized': Directory not empty`)),
				indexLock: isRetryableWorktreeRemovalError(new Error('git worktree exited with code 128: fatal: Unable to create \'.git/worktrees/x/index.lock\': File exists')),
				couldNotLock: isRetryableWorktreeRemovalError(new Error('git worktree exited with code 1: fatal: could not lock config file')),
				dirtyTree: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 1: fatal: 'wt' contains modified or untracked files, use --force to delete it`)),
				notAWorktree: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 128: fatal: 'wt' is not a working tree`)),
				nonError: isRetryableWorktreeRemovalError('boom'),
			}, {
				dirNotEmpty: true,
				indexLock: true,
				couldNotLock: true,
				dirtyTree: false,
				notAWorktree: false,
				nonError: false,
			});
		});
	});

	suite('summarizeStderrForError', () => {
		test('returns empty string for empty input', () => {
			assert.strictEqual(summarizeStderrForError(''), '');
		});

		test('returns empty string for whitespace-only input', () => {
			assert.strictEqual(summarizeStderrForError('  \r\n\r\n  '), '');
		});

		test('keeps the last non-empty line of a multi-line progress meter', () => {
			const progress = 'Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r';
			assert.strictEqual(summarizeStderrForError(progress), 'Updating files:   0% (149/14834)');
		});

		test('passes through a normal single-line message', () => {
			assert.strictEqual(summarizeStderrForError('fatal: invalid reference: x\n'), 'fatal: invalid reference: x');
		});

		test('keeps the lock failure instead of trailing lock removal advice', () => {
			const diagnostic = 'fatal: Unable to create \'/repo/.git/worktrees/session/index.lock\': File exists.';
			assert.strictEqual(summarizeStderrForError([
				diagnostic, '',
				'Another git process seems to be running in this repository, e.g.',
				'an editor opened by \'git commit\'. Please make sure all processes',
				'are terminated then try again. If it still fails, a git process',
				'may have crashed in this repository earlier:',
				'remove the file manually to continue.',
			].join('\n')), diagnostic);
		});

		test('truncates very long lines with an ellipsis', () => {
			const long = `fatal: ${'a'.repeat(500)}`;
			const result = summarizeStderrForError(long);
			assert.strictEqual(result.length, 200);
			assert.ok(result.endsWith('…'), 'expected trailing ellipsis');
		});
	});

	test('getWorktreeAddFailureMessage explains well-known git worktree add failures', () => {
		const gitLfsMissing = 'The repository uses Git LFS, but Git LFS isn\'t installed or can\'t be found on the PATH.';
		assert.deepStrictEqual([
			'Preparing worktree (new branch \'agents/a\')\nerror: unable to create file src/a: Filename too long\nfatal: Could not reset index file to revision \'HEAD\'.\n',
			'Preparing worktree (new branch \'agents/a\')\ngit-lfs filter-process: git-lfs: command not found\nfatal: the remote end hung up unexpectedly\n',
			'Preparing worktree (new branch \'agents/a\')\n/bin/sh: 1: git-lfs: not found\nfatal: the remote end hung up unexpectedly\n',
			'Preparing worktree (new branch \'agents/a\')\nHEAD is now at 14e5e32 lfs\n\nThis repository is configured for Git LFS but \'git-lfs\' was not found on your path. If you no longer wish to use Git LFS, remove this hook by deleting the \'post-checkout\' file in the hooks directory (set by \'core.hookspath\'; usually \'.git/hooks\').\n\n',
			'Preparing worktree (new branch \'agents/a\')\nfatal: cannot lock ref \'refs/heads/agents/a\': Unable to create \'/repo/.git/refs/heads/agents/a.lock\': File exists.\n\nAnother git process seems to be running in this repository, or the lock file may be stale\n',
			'Preparing worktree (new branch \'agents/a\')\nerror: unable to write file \'big.bin\'\nfatal: Could not reset index file to revision \'HEAD\'.\n',
		].map(getWorktreeAddFailureMessage), [
			isWindows
				? 'A file path in the worktree is too long for Windows. If the full path is longer than 260 characters, run `git config --global core.longpaths true` to allow long paths in Git. If a file or folder name is longer than 255 characters, shorten it in the repository.'
				: 'A file path in the worktree is too long for the file system.',
			gitLfsMissing,
			gitLfsMissing,
			gitLfsMissing,
			'Another Git process is using the repository. If no Git process is running, delete the lock file \'/repo/.git/refs/heads/agents/a.lock\'.',
			undefined,
		]);
	});

	suite('base branch refs', () => {
		test('parses local and remote refs at the longest remote name, and labels them without the ref prefix', () => {
			const refs = ['refs/heads/main', 'refs/heads/lszomoru/agents/foo', 'refs/remotes/origin/main', 'refs/remotes/fork/me/release/1.90', 'refs/remotes/gone/main', 'refs/tags/v1'];
			assert.deepStrictEqual({
				parsed: refs.map(ref => parseBaseBranchRef(ref, ['origin', 'fork/me'])),
				labels: ['refs/heads/main', 'refs/remotes/fork/me/release/1.90', 'origin/main'].map(getBaseBranchLabel),
			}, {
				parsed: [
					{ kind: 'local', ref: 'refs/heads/main', branch: 'main' },
					{ kind: 'local', ref: 'refs/heads/lszomoru/agents/foo', branch: 'lszomoru/agents/foo' },
					{ kind: 'remote', ref: 'refs/remotes/origin/main', remote: 'origin', branch: 'main' },
					{ kind: 'remote', ref: 'refs/remotes/fork/me/release/1.90', remote: 'fork/me', branch: 'release/1.90' },
					undefined,
					undefined,
				],
				labels: ['main', 'fork/me/release/1.90', 'origin/main'],
			});
		});
	});

	suite('parseSingleLsTreeEntry', () => {
		test('parses mode/oid and treats empty output as absent', () => {
			assert.deepStrictEqual(
				[
					parseSingleLsTreeEntry('100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391\ta.txt\x00'),
					parseSingleLsTreeEntry('100755 blob abc123\tdir/with space.txt\x00'),
					parseSingleLsTreeEntry(''),
					parseSingleLsTreeEntry(undefined),
				],
				[
					{ mode: '100644', oid: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391' },
					{ mode: '100755', oid: 'abc123' },
					undefined,
					undefined,
				],
			);
		});
	});
});
