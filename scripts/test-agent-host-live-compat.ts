/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Prepare the Agent Host builds that live-compatibility E2E scenarios run
 * against.
 *
 * Historical checkpoints are materialized into **detached git worktrees** under
 * a cache root outside the repository and compiled there. The repository the
 * developer is working in is never checked out, reset, stashed or cleaned: the
 * `current` checkpoint is simply built in place.
 *
 * Once builds are prepared it also *runs* the live-compat scenarios against
 * them, since the two steps share the same checkpoint list and cache layout.
 * Preparation and execution stay separate commands: preparing compiles whole
 * source trees and is slow, while a scenario run is cheap and repeated.
 *
 * Usage:
 *   node scripts/test-agent-host-live-compat.ts --list
 *   node scripts/test-agent-host-live-compat.ts --prepare legacy [--prepare current]
 *   node scripts/test-agent-host-live-compat.ts --prepare-all [--force]
 *   node scripts/test-agent-host-live-compat.ts --check
 *   node scripts/test-agent-host-live-compat.ts --run-baselines [--build legacy]
 *   node scripts/test-agent-host-live-compat.ts --run-forward
 *   node scripts/test-agent-host-live-compat.ts --run-backward
 *   node scripts/test-agent-host-live-compat.ts --run-recovery
 *   node scripts/test-agent-host-live-compat.ts --run-all [--pr] [--output-dir <dir>]
 *
 * Every `--run-*` command writes a stable JSON summary under
 * `.build/agent-host-live-compat` (override with `--output-dir`) and exits
 * nonzero if any scenario failed, including scenarios that failed only because
 * their checkpoint was not prepared: an unresolved checkpoint is reported as a
 * failure, never skipped.
 *
 * The cache layout and marker format are the contract shared with
 * `src/vs/platform/agentHost/test/node/e2e/harness/agentHostBuildPlan.ts`;
 * change both together.
 */

const childProcess: typeof import('child_process') = require('child_process');
const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const path: typeof import('path') = require('path');
const { spawnSync } = childProcess;
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = fs;
const { tmpdir } = os;
const { dirname, join, resolve } = path;
const { pathToFileURL }: typeof import('url') = require('url');

const repoRoot = resolve(__dirname, '..');

/** Keep in sync with `AGENT_HOST_LIVE_COMPAT_RECIPE_VERSION`. */
const RECIPE_VERSION = '1';
/**
 * Legacy marker location: inside the worktree, per `IAgentHostBuildPlan`.
 *
 * Still read so an already-prepared cache keeps working, but no longer written
 * — see {@link markerPathFor} for why an in-worktree marker is a problem.
 */
const CACHE_MARKER_NAME = '.agent-host-live-compat-build.json';
/**
 * Files this script may itself leave in a worktree, and which therefore must
 * not count as "local modifications" when deciding whether reuse is safe.
 */
const SCRIPT_OWNED_WORKTREE_FILES: readonly string[] = [CACHE_MARKER_NAME];
/** Keep in sync with `AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH`. */
const SERVER_ENTRY_RELATIVE_PATH = join('out', 'vs', 'platform', 'agentHost', 'node', 'agentHostServerMain.js');

interface IBuild {
	readonly id: string;
	readonly ref?: string;
	readonly description: string;
}

/** Keep in sync with `agentHostLiveCompatBuilds`. */
const builds: readonly IBuild[] = [
	{ id: 'legacy', ref: '97ed7b57c6d9becb4fe386c59157eda016050d6a', description: 'Oldest supported Agent Host build in the compatibility matrix.' },
	{ id: 'predecessor', ref: '49f24d87cd32d2a696e469d2c61fb8d0cada4cc9', description: 'The build immediately preceding the in-flight changes.' },
	{ id: 'intermediate', ref: '7453d67fdcde27faba527d69a535ddd51b8d1afa', description: 'Intermediate build used to exercise multi-hop upgrades.' },
	{ id: 'current', description: 'The current working tree, built in place; never checked out or reset.' },
];

function cacheRoot(): string {
	return process.env['AGENT_HOST_LIVE_COMPAT_CACHE'] || join(tmpdir(), 'vscode-agent-host-live-compat');
}

function sourceRootFor(build: IBuild): string {
	return build.ref === undefined ? repoRoot : join(cacheRoot(), 'builds', build.id);
}

/**
 * The matrices, in the order `--run-all` executes them.
 *
 * Order is cheapest-first and dependency-shaped: baselines prove each build can
 * restart against its own profile at all, so a failure there explains every
 * later cross-build failure and is worth seeing before spending time on them.
 *
 * They run **sequentially**, never in parallel. Each scenario forks real Agent
 * Host processes from separately compiled trees that share this machine's temp
 * space, ports and Electron caches; overlapping them would make a failure
 * attributable to contention rather than to compatibility.
 */
const MATRICES = ['baselines', 'forward', 'backward', 'recovery'] as const;
type MatrixId = typeof MATRICES[number];

/** Default location for retained JSON evidence, relative to the repo root. */
const DEFAULT_OUTPUT_DIR = join('.build', 'agent-host-live-compat');

/** Stable, per-matrix summary file names; CI collects these by name. */
const SUMMARY_FILE_NAMES: Readonly<Record<MatrixId, string>> = {
	baselines: 'baselines.json',
	forward: 'forward-migration.json',
	backward: 'backward-compatibility.json',
	recovery: 'recovery.json',
};

interface IOptions {
	readonly prepare: readonly string[];
	readonly force: boolean;
	readonly list: boolean;
	readonly check: boolean;
	readonly matrices: readonly MatrixId[];
	readonly runBuilds: readonly string[] | undefined;
	readonly jsonPath: string | undefined;
	readonly outputDir: string;
	readonly pr: boolean;
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	if (options.list) {
		printStatus();
		return;
	}
	if (options.check) {
		// Non-destructive by contract: it reports readiness and never prepares,
		// compiles, checks out or deletes anything.
		const missing = builds.filter(build => !isReady(build).ready);
		printStatus();
		if (missing.length > 0) {
			console.error(`\nNot ready: ${missing.map(build => build.id).join(', ')}. Run with --prepare-all.`);
			process.exitCode = 1;
		}
		return;
	}
	for (const id of options.prepare) {
		prepare(lookup(id), options.force);
	}
	if (options.matrices.length > 0) {
		await runMatrices(options);
		return;
	}
	printStatus();
}

function parseArguments(args: readonly string[]): IOptions {
	const prepare: string[] = [];
	const runBuilds: string[] = [];
	const matrices: MatrixId[] = [];
	let force = false;
	let list = false;
	let check = false;
	let jsonPath: string | undefined;
	let outputDir: string | undefined;
	let pr = false;
	const addMatrix = (id: MatrixId) => {
		if (!matrices.includes(id)) {
			matrices.push(id);
		}
	};
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--prepare') {
			const value = args[++index];
			if (!value) {
				throw new Error('--prepare requires a build id');
			}
			prepare.push(value);
		} else if (argument.startsWith('--prepare=')) {
			prepare.push(argument.slice('--prepare='.length));
		} else if (argument === '--prepare-all') {
			prepare.push(...builds.map(build => build.id));
		} else if (argument === '--force') {
			force = true;
		} else if (argument === '--list') {
			list = true;
		} else if (argument === '--check') {
			check = true;
		} else if (argument === '--run-baselines') {
			addMatrix('baselines');
		} else if (argument === '--run-forward') {
			addMatrix('forward');
		} else if (argument === '--run-backward') {
			addMatrix('backward');
		} else if (argument === '--run-recovery') {
			addMatrix('recovery');
		} else if (argument === '--run-all') {
			for (const id of MATRICES) {
				addMatrix(id);
			}
		} else if (argument === '--pr') {
			pr = true;
		} else if (argument === '--build') {
			const value = args[++index];
			if (!value) {
				throw new Error('--build requires a build id');
			}
			runBuilds.push(value);
		} else if (argument.startsWith('--build=')) {
			runBuilds.push(argument.slice('--build='.length));
		} else if (argument === '--json') {
			const value = args[++index];
			if (!value) {
				throw new Error('--json requires a path');
			}
			jsonPath = value;
		} else if (argument.startsWith('--json=')) {
			jsonPath = argument.slice('--json='.length);
		} else if (argument === '--output-dir') {
			const value = args[++index];
			if (!value) {
				throw new Error('--output-dir requires a path');
			}
			outputDir = value;
		} else if (argument.startsWith('--output-dir=')) {
			outputDir = argument.slice('--output-dir='.length);
		} else {
			throw new Error(`Unknown argument '${argument}'`);
		}
	}
	if (runBuilds.length > 0 && !matrices.includes('baselines')) {
		throw new Error('--build only applies to --run-baselines');
	}
	if (jsonPath !== undefined && matrices.length !== 1) {
		throw new Error('--json applies to a single matrix; use --output-dir to place several summaries');
	}
	if (pr && matrices.length === 0) {
		throw new Error('--pr selects a faster subset of a run; combine it with --run-all or a --run-* command');
	}
	if (prepare.length === 0 && !list && !check && matrices.length === 0) {
		list = true;
	}
	return {
		prepare,
		force,
		list,
		check,
		matrices,
		runBuilds: runBuilds.length > 0 ? runBuilds : undefined,
		jsonPath,
		outputDir: outputDir ?? DEFAULT_OUTPUT_DIR,
		pr,
	};
}


function lookup(id: string): IBuild {
	const build = builds.find(candidate => candidate.id === id);
	if (!build) {
		throw new Error(`Unknown build '${id}'; known: ${builds.map(candidate => candidate.id).join(', ')}`);
	}
	return build;
}

function isReady(build: IBuild): { ready: boolean; reason?: string } {
	const sourceRoot = sourceRootFor(build);
	if (!existsSync(join(sourceRoot, SERVER_ENTRY_RELATIVE_PATH))) {
		return { ready: false, reason: 'not compiled' };
	}
	if (build.ref === undefined) {
		// The working tree is never cached: it changes under us by design.
		return { ready: true };
	}
	const cacheKey = tryCacheKeyFor(build);
	if (cacheKey === undefined) {
		return { ready: false, reason: unresolvedRefReason(build.ref) };
	}
	if (readMarker(build)?.cacheKey !== cacheKey) {
		return { ready: false, reason: 'stale build output' };
	}
	return { ready: true };
}

/**
 * Where this script records a build's cache key, outside the worktree.
 *
 * The marker is *also* written inside the worktree, because that in-worktree
 * path is the contract `IAgentHostBuildPlan.cacheMarkerPath` reads when the
 * matrices decide whether a build is launchable — see {@link writeMarker}.
 * This copy exists so the CLI's own readiness check does not depend on a file
 * living in a tree it may have to re-checkout.
 */
function markerPathFor(build: IBuild): string {
	return join(cacheRoot(), 'markers', `${build.id}.json`);
}

function readMarker(build: IBuild): { cacheKey?: string } | undefined {
	// The legacy in-worktree location is still read so an already-prepared
	// cache is not silently invalidated by this change; it is never written.
	for (const candidate of [markerPathFor(build), join(sourceRootFor(build), CACHE_MARKER_NAME)]) {
		try {
			return JSON.parse(readFileSync(candidate, 'utf8')) as { cacheKey?: string };
		} catch {
			// Try the next location.
		}
	}
	return undefined;
}

/**
 * Record a completed build in both places that need to know about it.
 *
 * The in-worktree copy is not optional: `IAgentHostBuildPlan.cacheMarkerPath`
 * points there, and it is what the matrices consult to decide a build is
 * launchable rather than stale. Writing only the external copy makes every
 * historical build report as "stale build output" at run time — which is
 * exactly what a cold end-to-end run caught.
 *
 * It is an untracked file, so it would ordinarily make the worktree look dirty
 * and block reuse for another checkpoint. That is handled by excluding this one
 * known name in {@link SCRIPT_OWNED_WORKTREE_FILES}, rather than by loosening
 * the dirty check, so a genuine local edit still stops reuse.
 */
function writeMarker(build: IBuild, cacheKey: string): void {
	const contents = `${JSON.stringify({ cacheKey, builtAt: new Date().toISOString() }, undefined, '\t')}\n`;
	const markerPath = markerPathFor(build);
	mkdirSync(dirname(markerPath), { recursive: true });
	writeFileSync(markerPath, contents);
	writeFileSync(join(sourceRootFor(build), CACHE_MARKER_NAME), contents);
}

function tryCacheKeyFor(build: IBuild): string | undefined {
	const commit = tryResolveCommit(build.ref!);
	return commit === undefined ? undefined : `commit:${commit}|recipe:${RECIPE_VERSION}`;
}

/**
 * Resolve a checkpoint ref to a commit, or `undefined` when it is not present.
 *
 * Non-throwing by design. A checkpoint can legitimately be absent — a shallow
 * clone, a fork, or a checkpoint that only ever existed on a feature branch —
 * and in every one of those cases the useful outcome is the runner's own
 * "not ready, here is what to do" result, not a raw `git rev-parse` stack from
 * deep inside a status listing.
 */
function tryResolveCommit(ref: string): string | undefined {
	const result = spawnSync('git', ['rev-parse', `${ref}^{commit}`], {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const commit = (result.stdout ?? '').trim();
	return /^[0-9a-f]{40}$/.test(commit) ? commit : undefined;
}

/** Resolve a ref for a command that genuinely cannot proceed without it. */
function resolveCommit(ref: string): string {
	const commit = tryResolveCommit(ref);
	if (commit === undefined) {
		throw new Error(unresolvedRefMessage(ref));
	}
	return commit;
}

function unresolvedRefReason(ref: string): string {
	return `checkpoint ${ref.slice(0, 10)} is not present in this repository`;
}

/**
 * Explain an absent checkpoint, including the case this suite actually hits.
 *
 * Some checkpoints are pinned to commits that live only on a feature branch.
 * Those are unreachable from a shallow clone, from a fork, and from the default
 * branch until that work lands — so "fetch it" is only half the advice, and
 * re-pinning is the other half.
 */
function unresolvedRefMessage(ref: string): string {
	return [
		`[agent-host-live-compat] checkpoint '${ref}' could not be resolved in ${repoRoot}.`,
		`  Fetch it: git fetch origin ${ref}`,
		'  If it was never on a shared branch (a feature-branch-only checkpoint), re-pin it',
		'  to a commit reachable from the default branch in agentHostLiveCompatBuilds.ts.',
	].join('\n');
}

function prepare(build: IBuild, force: boolean): void {
	const sourceRoot = sourceRootFor(build);
	const state = isReady(build);
	if (state.ready && !force && build.ref !== undefined) {
		console.log(`[live-compat] ${build.id}: up to date (${sourceRoot})`);
		return;
	}

	if (build.ref === undefined) {
		// The working tree is never *cached* — it changes under us by design —
		// but it can still be already built, and recompiling it is the single
		// slowest thing this command does. `--force` remains the way to insist.
		if (state.ready && !force) {
			console.log(`[live-compat] ${build.id}: already compiled (${repoRoot}); pass --force to rebuild`);
			return;
		}
		console.log(`[live-compat] ${build.id}: building the current working tree in place (${repoRoot})`);
		compile(repoRoot);
		console.log(`[live-compat] ${build.id}: ready`);
		return;
	}

	const commit = resolveCommit(build.ref);
	materializeWorktree(build, commit, sourceRoot);
	installDependencies(build, sourceRoot);
	compile(sourceRoot);
	writeMarker(build, `commit:${commit}|recipe:${RECIPE_VERSION}`);
	console.log(`[live-compat] ${build.id}: ready at ${sourceRoot} (${commit})`);
}

function materializeWorktree(build: IBuild, commit: string, sourceRoot: string): void {
	mkdirSync(join(cacheRoot(), 'builds'), { recursive: true });
	if (existsSync(join(sourceRoot, '.git'))) {
		// A cached worktree restored onto a fresh machine (as CI does) carries a
		// `.git` file pointing at administrative data that lives in the *main*
		// repository and was never part of the archive. Detect that here rather
		// than letting the first git command fail with a link-resolution error
		// that reads like a corrupt checkout.
		const detached = isDetachedWorktree(sourceRoot);
		if (!detached) {
			console.log(`[live-compat] ${build.id}: cached worktree at ${sourceRoot} is no longer linked to this repository; re-registering it`);
			rmSync(sourceRoot, { recursive: true, force: true });
			run('git', ['worktree', 'prune'], repoRoot);
		} else {
			const head = (run('git', ['rev-parse', 'HEAD'], sourceRoot, { capture: true }) ?? '').trim();
			if (head === commit) {
				return;
			}
			// Reuse the worktree for a different checkpoint only when it is clean:
			// a dirty cached worktree may hold work someone put there on purpose.
			// Files this script owns are not "someone's work": the legacy
			// in-worktree marker and the install sentinel are excluded by name,
			// and nothing else is, so a real edit still stops the reuse.
			const status = run('git', ['status', '--porcelain'], sourceRoot, { capture: true }) ?? '';
			const foreign = status.split('\n')
				.map(line => line.trim())
				.filter(line => line.length > 0)
				.filter(line => !SCRIPT_OWNED_WORKTREE_FILES.some(name => line.endsWith(name)));
			if (foreign.length > 0) {
				throw new Error(`Cached worktree ${sourceRoot} has local modifications; inspect and remove it manually (git worktree remove ${sourceRoot}).`);
			}
			run('git', ['checkout', '--detach', commit], sourceRoot);
			return;
		}
	}
	if (existsSync(sourceRoot)) {
		throw new Error(`${sourceRoot} exists but is not a git worktree; remove it manually before preparing '${build.id}'.`);
	}
	console.log(`[live-compat] ${build.id}: creating worktree at ${sourceRoot} (${commit})`);
	run('git', ['worktree', 'add', '--detach', sourceRoot, commit], repoRoot);
}

/** True when `sourceRoot` is a git worktree this repository can still drive. */
function isDetachedWorktree(sourceRoot: string): boolean {
	const result = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	return result.status === 0;
}

/**
 * Native modules the Agent Host loads at run time.
 *
 * `--ignore-scripts` skips the install hooks that compile these, which is most
 * of the saving — but the host does not merely reference them, it fails to
 * start without them. A cold end-to-end run caught exactly that: every
 * historical build exited 1 on `Cannot find module '../build/Debug/vscode_fs.node'`.
 * So they are rebuilt explicitly, which is bounded work (~19 s) rather than the
 * repository-wide postinstall.
 *
 * `sqlite3` backs the session database — the very thing these scenarios migrate
 * — and `fs-copyfile` is reached during startup, so neither is optional.
 */
const AGENT_HOST_NATIVE_MODULES: readonly string[] = [
	'@vscode/fs-copyfile',
	'@vscode/sqlite3',
	'@vscode/spdlog',
	'@parcel/watcher',
	'node-pty',
];

/**
 * Install only what a checkpoint needs to transpile and run an Agent Host.
 *
 * A plain `npm install` here is enormously more than that. It runs the
 * repository-wide `postinstall`, which installs every built-in extension and
 * the remote tree: measured on a checkpoint, that is **7.6 GB** and several
 * minutes, of which the Agent Host uses none. `--ignore-scripts` skips exactly
 * that step, leaving the root and `build/` dependency sets — which is what
 * `transpile-client` and the compiled server actually load — at **2.9 GB**.
 *
 * The sentinel is the other half. `node_modules` exists from the moment npm
 * starts writing into it, so treating its mere presence as "installed" silently
 * reuses a half-installed tree left by an interrupted or failed run, and the
 * failure resurfaces later as a confusing missing-module error during compile.
 * The sentinel is written only after every install has exited zero.
 */
function installDependencies(build: IBuild, sourceRoot: string): void {
	const sentinel = join(cacheRoot(), 'markers', `${build.id}.install.json`);
	if (existsSync(sentinel)) {
		return;
	}
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const args = ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
	console.log(`[live-compat] ${build.id}: installing dependencies in ${sourceRoot}`);
	run(npm, args, sourceRoot);
	// `transpile-client` runs out of `build/`, whose dependencies the root
	// install does not provide and whose postinstall step we just skipped.
	console.log(`[live-compat] ${build.id}: installing build dependencies`);
	run(npm, args, join(sourceRoot, 'build'));
	console.log(`[live-compat] ${build.id}: rebuilding native modules`);
	run(npm, ['rebuild', ...AGENT_HOST_NATIVE_MODULES], sourceRoot);
	mkdirSync(dirname(sentinel), { recursive: true });
	writeFileSync(sentinel, `${JSON.stringify({ installedAt: new Date().toISOString(), args, nativeModules: AGENT_HOST_NATIVE_MODULES }, undefined, '\t')}\n`);
}

function compile(sourceRoot: string): void {
	console.log(`[live-compat] compiling ${sourceRoot}`);
	run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'transpile-client'], sourceRoot);
	const entry = join(sourceRoot, SERVER_ENTRY_RELATIVE_PATH);
	if (!existsSync(entry)) {
		throw new Error(`Compilation completed but ${entry} is missing; the build recipe may not apply to this checkpoint.`);
	}
}

function run(command: string, args: readonly string[], cwd: string, options?: { capture?: boolean }): string | undefined {
	const result = spawnSync(command, args, {
		cwd,
		env: process.env,
		encoding: 'utf8',
		stdio: options?.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const reason = result.signal ? `signal ${result.signal}` : `code ${result.status}`;
		const details = options?.capture ? `\n${(result.stderr ?? '').trim()}` : '';
		throw new Error(`${command} ${args.join(' ')} (in ${cwd}) exited with ${reason}${details}`);
	}
	return options?.capture ? result.stdout : undefined;
}

/** Compiled location of the scenario runners, produced by `npm run transpile-client`. */
const OUT_LIVE_COMPAT_DIR = join('out', 'vs', 'platform', 'agentHost', 'test', 'node', 'e2e', 'liveCompat');

interface IStepResult {
	readonly name: string;
	readonly outcome: string;
	readonly durationMs: number;
	readonly detail?: string;
}

/**
 * The shape every matrix summary shares.
 *
 * Deliberately structural rather than a union of the four concrete summary
 * types: this script only ever needs the aggregate outcome and a per-entry
 * label, and the matrices remain free to add fields (recovery's classification
 * tally, backward's two protocol versions) that flow into the JSON untouched.
 */
interface IMatrixSummary {
	readonly suite: string;
	readonly outcome: string;
	readonly durationMs: number;
	readonly results: readonly IScenarioResult[];
}

interface IScenarioResult {
	readonly scenario?: string;
	readonly build?: string;
	readonly currentBuild?: string;
	readonly olderBuild?: string;
	readonly secondBuild?: string;
	readonly outcome: string;
	readonly durationMs: number;
	readonly protocolVersion?: string;
	readonly diagnosticsPath: string;
	readonly error?: string;
	readonly steps: readonly IStepResult[];
}

interface IMatrixDefinition {
	readonly id: MatrixId;
	readonly title: string;
	/** Module under `out/` exporting the entry point, without extension. */
	readonly module: string;
	readonly run: (module: Record<string, unknown>, options: IMatrixRunOptions) => Promise<IMatrixSummary>;
}

interface IMatrixRunOptions {
	readonly repoRoot: string;
	readonly resolveCommit: (ref: string) => string | undefined;
	readonly cacheRoot: string;
	readonly diagnosticsRoot: string;
	/** Builds to exercise, when the matrix takes an explicit list. */
	readonly buildIds: readonly string[] | undefined;
	/** True for the reduced subset a pull request runs. */
	readonly pr: boolean;
}

/**
 * How each matrix is invoked, and what `--pr` trims from it.
 *
 * The PR subset is chosen to keep the *shape* of every claim while cutting
 * repetition: each matrix still runs, but against the nearest checkpoint only
 * (`predecessor`), because a break introduced by an in-flight change shows up
 * against its immediate predecessor first. The full three-checkpoint sweep —
 * which is what actually pins "oldest supported" — belongs to the scheduled
 * run, where its cost is paid once a day rather than once a push.
 */
const MATRIX_DEFINITIONS: readonly IMatrixDefinition[] = [
	{
		id: 'baselines',
		title: 'same-build restart baselines',
		module: 'agentHostLiveCompatMatrix',
		run: (module, options) => {
			const run = module['runSameBuildRestartBaselines'] as (ids: readonly string[], o: object) => Promise<IMatrixSummary>;
			const ids = options.buildIds ?? (options.pr ? ['predecessor', 'current'] : builds.map(build => build.id));
			return run(ids, matrixContext(options));
		},
	},
	{
		id: 'forward',
		title: 'forward migrations',
		module: 'runForwardMigrationMatrix',
		run: (module, options) => {
			const run = module['runForwardMigrations'] as (o: object) => Promise<IMatrixSummary>;
			return run({
				...matrixContext(options),
				...(options.pr ? { sources: ['predecessor'], includeMultiSession: true } : {}),
			});
		},
	},
	{
		id: 'backward',
		title: 'backward-compatibility round trips',
		module: 'runBackwardCompatibilityMatrix',
		run: (module, options) => {
			const run = module['runBackwardCompatibilityMatrixForBuilds'] as (ids: readonly string[], o: object) => Promise<IMatrixSummary>;
			const olderBuilds = module['BACKWARD_COMPAT_OLDER_BUILDS'] as readonly string[];
			return run(options.pr ? ['predecessor'] : olderBuilds, matrixContext(options));
		},
	},
	{
		id: 'recovery',
		title: 'process recovery',
		module: 'runRecoveryMatrix',
		run: (module, options) => {
			const run = module['runRecoveryMatrix'] as (ids: readonly string[], o: object) => Promise<IMatrixSummary>;
			const ids = options.pr ? ['current'] : ['current', 'predecessor'];
			return run(ids, matrixContext(options));
		},
	},
];

function matrixContext(options: IMatrixRunOptions): object {
	return {
		repoRoot: options.repoRoot,
		resolveCommit: options.resolveCommit,
		cacheRoot: options.cacheRoot,
		diagnosticsRoot: options.diagnosticsRoot,
	};
}

/**
 * Run the requested matrices in order and retain a JSON summary for each.
 *
 * Two properties are load-bearing and are the reason this is not a shell loop
 * over four commands:
 *
 * - **Sequential.** A single `await` chain, with no concurrency anywhere, so
 *   two compiled Agent Host trees never contend for temp space or ports.
 * - **Nothing is silently dropped.** A matrix that throws is recorded as a
 *   failed summary and the remaining matrices still run, so one broken matrix
 *   cannot hide the state of the others; the process still exits nonzero.
 */
async function runMatrices(options: IOptions): Promise<void> {
	const outputDir = resolve(repoRoot, options.outputDir);
	mkdirSync(outputDir, { recursive: true });
	const diagnosticsRoot = join(outputDir, 'diagnostics');
	mkdirSync(diagnosticsRoot, { recursive: true });
	for (const id of options.runBuilds ?? []) {
		lookup(id);
	}

	const startedAt = Date.now();
	const written: { id: MatrixId; outcome: string; durationMs: number; summaryPath: string }[] = [];
	for (const id of options.matrices) {
		const definition = MATRIX_DEFINITIONS.find(candidate => candidate.id === id)!;
		console.log(`\n[live-compat] running ${definition.title}${options.pr ? ' (pr subset)' : ''}`);
		const summary = await runMatrix(definition, {
			repoRoot,
			// The non-throwing resolver: an absent checkpoint becomes that
			// build's own "not ready" row, carrying the prepare-or-re-pin
			// advice, instead of aborting the whole matrix with a git error.
			resolveCommit: ref => tryResolveCommit(ref),
			cacheRoot: cacheRoot(),
			diagnosticsRoot,
			buildIds: options.runBuilds,
			pr: options.pr,
		});
		printSummary(definition, summary);
		const summaryPath = options.jsonPath ? resolve(repoRoot, options.jsonPath) : join(outputDir, SUMMARY_FILE_NAMES[id]);
		mkdirSync(dirname(summaryPath), { recursive: true });
		writeFileSync(summaryPath, `${JSON.stringify(summary, undefined, '\t')}\n`);
		console.log(`  summary written to ${summaryPath}`);
		written.push({ id, outcome: summary.outcome, durationMs: summary.durationMs, summaryPath });
	}

	const outcome = written.every(entry => entry.outcome === 'passed') ? 'passed' : 'failed';
	if (options.matrices.length > 1) {
		const runPath = join(outputDir, 'run.json');
		writeFileSync(runPath, `${JSON.stringify({
			suite: 'agent-host-live-compat',
			subset: options.pr ? 'pr' : 'full',
			startedAt: new Date(startedAt).toISOString(),
			durationMs: Date.now() - startedAt,
			outcome,
			matrices: written,
		}, undefined, '\t')}\n`);
		console.log('\nAgent Host live-compat — run summary');
		for (const entry of written) {
			console.log(`  ${entry.id.padEnd(10)} ${entry.outcome.toUpperCase().padEnd(6)} ${formatDuration(entry.durationMs)}`);
		}
		console.log(`  overall: ${outcome.toUpperCase()} in ${formatDuration(Date.now() - startedAt)}`);
		console.log(`  run summary written to ${runPath}`);
	}
	if (outcome !== 'passed') {
		process.exitCode = 1;
	}
}

/**
 * Load a matrix from `out/` and run it, turning a throw into a failed summary.
 *
 * A missing module means the working tree was never transpiled, which is worth
 * saying plainly rather than surfacing as a module-resolution stack. The
 * scenario modules are ESM under `out/`, so they are reached with a dynamic
 * import from this CommonJS script.
 */
async function runMatrix(definition: IMatrixDefinition, options: IMatrixRunOptions): Promise<IMatrixSummary> {
	const startedAt = Date.now();
	const modulePath = join(repoRoot, OUT_LIVE_COMPAT_DIR, `${definition.module}.js`);
	try {
		if (!existsSync(modulePath)) {
			throw new Error(`Missing ${modulePath}. Run 'npm run transpile-client' first.`);
		}
		const module = await import(pathToFileURL(modulePath).href) as Record<string, unknown>;
		return await definition.run(module, options);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			suite: `agent-host-live-compat/${definition.id}`,
			outcome: 'failed',
			durationMs: Date.now() - startedAt,
			results: [{
				scenario: definition.id,
				outcome: 'failed',
				durationMs: Date.now() - startedAt,
				diagnosticsPath: '',
				error: detail,
				steps: [{ name: 'load-matrix', outcome: 'failed', durationMs: Date.now() - startedAt, detail }],
			}],
		};
	}
}

function printSummary(definition: IMatrixDefinition, summary: IMatrixSummary): void {
	console.log(`\nAgent Host live-compat — ${definition.title}`);
	for (const result of summary.results) {
		console.log(`  ${labelOf(result).padEnd(34)} ${result.outcome.toUpperCase().padEnd(6)} ${formatDuration(result.durationMs)}${result.protocolVersion ? `  protocol=${result.protocolVersion}` : ''}`);
		for (const step of result.steps) {
			console.log(`      ${step.outcome.padEnd(7)} ${step.name}${step.detail ? ` — ${step.detail}` : ''}`);
		}
		if (result.diagnosticsPath) {
			console.log(`      diagnostics: ${result.diagnosticsPath}`);
		}
	}
	console.log(`  ${definition.id}: ${summary.outcome.toUpperCase()} in ${formatDuration(summary.durationMs)}`);
}

/** Name a scenario entry across the four differently-shaped result types. */
function labelOf(result: IScenarioResult): string {
	const build = result.currentBuild && result.olderBuild
		? `${result.currentBuild}->${result.olderBuild}`
		: result.secondBuild
			? `${result.build}->${result.secondBuild}`
			: result.build ?? '';
	return result.scenario ? `${build} ${result.scenario}`.trim() : build;
}

function formatDuration(durationMs: number): string {
	return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
}


function printStatus(): void {
	console.log(`Agent Host live-compat builds (cache root: ${cacheRoot()})`);
	for (const build of builds) {
		const state = isReady(build);
		const status = state.ready ? 'ready' : `NOT READY (${state.reason})`;
		console.log(`  ${build.id.padEnd(13)} ${build.ref ?? 'working tree'}  ${status}`);
		console.log(`  ${''.padEnd(13)} ${sourceRootFor(build)}`);
	}
}

main().catch(error => {
	console.error(`[live-compat] ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
