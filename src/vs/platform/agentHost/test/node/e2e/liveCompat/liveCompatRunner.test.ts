/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract tests for the live-compat CLI, driven as a black box.
 *
 * The CLI is the only thing a developer or a CI job ever touches, so the
 * properties worth pinning here are the ones a caller depends on and cannot see
 * from the matrices themselves:
 *
 * - `--check` is **non-destructive**: it reports readiness and never prepares,
 *   compiles, checks out or writes anything.
 * - An unprepared checkpoint is a **reported failure with a nonzero exit**,
 *   never a skip — so a run covering two of three upgrades can never be
 *   mistaken for one covering three.
 * - Summaries land at **stable paths**, which is what makes CI able to collect
 *   evidence by name rather than by glob-and-hope.
 *
 * These run the script against a deliberately empty cache root, so no build is
 * ever launched and the suite stays fast. The scenario bodies are exercised for
 * real by `npm run agent-host-live-compat-all`.
 */

import assert from 'assert';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { fileURLToPath } from 'url';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

const repoRoot = fileURLToPath(new URL('../../../../../../../../', import.meta.url));
const cliPath = join(repoRoot, 'scripts', 'test-agent-host-live-compat.ts');

interface ICliResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Run the CLI against an empty cache root so no historical build resolves.
 *
 * `ELECTRON_RUN_AS_NODE` matters: this suite executes inside Electron, whose
 * `execPath` would otherwise boot a renderer instead of running the script.
 */
function runCli(args: readonly string[], cacheRoot: string): ICliResult {
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		cwd: repoRoot,
		encoding: 'utf8',
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AGENT_HOST_LIVE_COMPAT_CACHE: cacheRoot },
	});
	if (result.error) {
		throw result.error;
	}
	return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

suite('Agent Host live-compat runner', function () {

	// Every test forks the real CLI, which costs a process start each time.
	this.timeout(60_000);

	ensureNoDisposablesAreLeakedInTestSuite();

	test('--check reports unprepared builds without preparing anything', () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-check-'));
		const result = runCli(['--check'], cacheRoot);

		assert.deepStrictEqual(
			{
				status: result.status,
				namesMissingBuilds: /Not ready: .*legacy/.test(result.stderr),
				// Non-destructive: nothing was materialized under the cache root.
				cacheRootUntouched: readdirSync(cacheRoot).length === 0,
			},
			{ status: 1, namesMissingBuilds: true, cacheRootUntouched: true },
		);
	});

	test('an unprepared checkpoint fails the run and names the prepare command', () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-run-'));
		const outputDir = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-out-'));
		const result = runCli(['--run-backward', '--output-dir', outputDir], cacheRoot);
		const summaryPath = join(outputDir, 'backward-compatibility.json');
		const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
			outcome: string;
			results: readonly { outcome: string; error?: string }[];
		};

		assert.deepStrictEqual(
			{
				status: result.status,
				summaryWritten: existsSync(summaryPath),
				outcome: summary.outcome,
				// Every pair is present as a failed row, never absent.
				rowOutcomes: summary.results.map(entry => entry.outcome),
				everyRowExplains: summary.results.every(entry => (entry.error ?? '').includes('--prepare')),
			},
			{
				status: 1,
				summaryWritten: true,
				outcome: 'failed',
				rowOutcomes: ['failed', 'failed', 'failed'],
				everyRowExplains: true,
			},
		);
	});

	test('a multi-matrix run writes one stable summary per matrix plus an aggregate', () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-all-'));
		const outputDir = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-all-out-'));
		// Forward and backward both need a historical checkpoint on at least one
		// end, so an empty cache fails every pair at resolution and no build is
		// ever launched — which is what keeps this a unit test. Baselines and
		// recovery are excluded here precisely because they *would* launch the
		// working tree; the live run covers them.
		const result = runCli(['--run-forward', '--run-backward', '--output-dir', outputDir], cacheRoot);
		const run = JSON.parse(readFileSync(join(outputDir, 'run.json'), 'utf8')) as {
			outcome: string;
			subset: string;
			matrices: readonly { id: string }[];
		};

		assert.deepStrictEqual(
			{
				status: result.status,
				files: readdirSync(outputDir).filter(name => name.endsWith('.json')).sort(),
				outcome: run.outcome,
				subset: run.subset,
				matrices: run.matrices.map(entry => entry.id),
			},
			{
				status: 1,
				files: ['backward-compatibility.json', 'forward-migration.json', 'run.json'],
				outcome: 'failed',
				subset: 'full',
				matrices: ['forward', 'backward'],
			},
		);
	});

	/**
	 * A checkpoint can be absent for reasons that are nobody's mistake: a
	 * shallow clone, a fork, or a checkpoint pinned to a feature-branch-only
	 * commit that the default branch cannot reach. This file runs in the
	 * ordinary unit job, which is shallow, so the CLI degrading to its own
	 * actionable result rather than a raw `git rev-parse` failure is what keeps
	 * that job green — and is a property worth pinning rather than assuming.
	 */
	test('an unresolvable checkpoint ref degrades to an actionable result, not a git error', () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-unresolvable-'));
		const listing = runCli(['--list'], cacheRoot);
		const check = runCli(['--check'], cacheRoot);

		assert.deepStrictEqual(
			{
				// `--list` is a status report; an absent checkpoint is data, not
				// a crash, so it stays successful.
				listStatus: listing.status,
				// `--check` reports unreadiness by exiting nonzero.
				checkStatus: check.status,
				// Neither leaks git's own vocabulary for a missing revision.
				mentionsGitFailure: /unknown revision|ambiguous argument|fatal:/.test(listing.stdout + listing.stderr + check.stdout + check.stderr),
				// Every historical checkpoint is accounted for by name.
				namesEveryCheckpoint: ['legacy', 'predecessor', 'intermediate'].every(id => listing.stdout.includes(id)),
			},
			{ listStatus: 0, checkStatus: 1, mentionsGitFailure: false, namesEveryCheckpoint: true },
		);
	});

	test('--pr requires a run command and --json requires a single matrix', () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'agent-host-live-compat-args-'));

		assert.deepStrictEqual(
			{
				prAlone: runCli(['--pr'], cacheRoot).stderr.includes('combine it with'),
				jsonWithAll: runCli(['--run-all', '--json', 'x.json'], cacheRoot).stderr.includes('single matrix'),
				buildWithoutBaselines: runCli(['--run-forward', '--build', 'legacy'], cacheRoot).stderr.includes('--run-baselines'),
			},
			{ prAlone: true, jsonWithAll: true, buildWithoutBaselines: true },
		);
	});
});
