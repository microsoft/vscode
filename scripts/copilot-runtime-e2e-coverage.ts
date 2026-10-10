/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('fs') = require('fs');
const path: typeof import('path') = require('path');
const childProcess: typeof import('child_process') = require('child_process');
const { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } = fs;
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = path;
const { spawnSync } = childProcess;

const repoRoot = resolve(__dirname, '..');
const statsPath = join(repoRoot, 'src', 'vs', 'platform', 'agentHost', 'test', 'node', 'e2e', 'coverage', 'copilot-runtime.json');
const nativeMetricNames = ['lines', 'functions', 'regions'] as const;
const suiteIds = ['conformance', 'claude', 'codex', 'copilot', 'prompts', 'otel'] as const;
type SuiteId = typeof suiteIds[number];
type NativeMetricName = typeof nativeMetricNames[number];
type JsonObject = Record<string, unknown>;

interface IMetric {
	readonly covered: number;
	readonly total: number;
	readonly percentage: number;
}
type NativeCoverage = Record<NativeMetricName, IMetric>;
interface INativeFile {
	readonly path: string;
	readonly lines: readonly [number, number];
	readonly functions: readonly [number, number];
	readonly regions: readonly [number, number];
}
interface ISuiteResult {
	readonly suite: SuiteId;
	readonly exitCode: number;
	readonly passing: number;
	readonly pending: number;
	readonly failing: number;
	readonly auxiliaryPassing: number;
}
interface IRunStatus {
	readonly status: 'passed' | 'failed' | 'incomplete';
	readonly selection: 'full' | 'focused';
	readonly suites: readonly ISuiteResult[];
}
interface IBuild {
	readonly source: string;
	readonly commit: string;
	readonly tag: string;
	readonly cliVersion: string;
	readonly sdkVersion: string;
	readonly rustToolchain: string;
	readonly rustFlags: string;
	readonly entrypoint: string;
	readonly runtime: string;
	readonly cli: string;
	readonly llvmTools: string;
	readonly manifest: JsonObject;
}
interface IOptions {
	readonly mode: 'run' | 'collect' | 'report' | 'import-existing';
	readonly buildInfo: string;
	readonly runDirectory: string;
	readonly source?: string;
	readonly llvmTools?: string;
	readonly publishedPackage?: string;
	readonly metrics?: string;
	readonly nativeSummary?: string;
	readonly status?: string;
	readonly profdata?: string;
	readonly profiles: readonly string[];
	readonly v8Directories: readonly string[];
	readonly suite?: SuiteId;
	readonly grep?: string;
	readonly jobs: number;
	readonly write: boolean;
	readonly skipTranspile: boolean;
	readonly acceptFailed: boolean;
}

function record(value: unknown, label: string): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as JsonObject;
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${label} must be a nonempty string`);
	}
	return value;
}

function count(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative integer`);
	}
	return value;
}

function readJson(file: string): JsonObject {
	return record(JSON.parse(readFileSync(file, 'utf8')), file);
}

function metric(covered: number, total: number): IMetric {
	if (covered > total) {
		throw new Error('Covered count exceeds total');
	}
	return { covered, total, percentage: total === 0 ? 100 : Math.round(covered * 10_000 / total) / 100 };
}

function parseArguments(args: readonly string[]): IOptions {
	const values = new Map<string, string>();
	const profiles: string[] = [];
	const v8Directories: string[] = [];
	const booleans = new Set<string>();
	const valueFlags = ['mode', 'build-info', 'run-dir', 'source', 'llvm-tools', 'published-package', 'metrics', 'native-summary', 'status', 'profdata', 'suite', 'grep', 'jobs'];
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (['--write', '--skip-transpile', '--accept-failed'].includes(argument)) {
			booleans.add(argument);
			continue;
		}
		const flag = argument.startsWith('--') ? argument.slice(2) : '';
		if (![...valueFlags, 'profiles', 'v8'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) {
			throw new Error(`Unknown argument or missing value: ${argument}`);
		}
		const value = args[++index];
		if (flag === 'profiles') {
			profiles.push(resolve(value));
		} else if (flag === 'v8') {
			v8Directories.push(resolve(value));
		} else {
			if (values.has(flag)) {
				throw new Error(`Duplicate --${flag}`);
			}
			values.set(flag, value);
		}
	}
	const mode = values.get('mode') ?? 'run';
	if (mode !== 'run' && mode !== 'collect' && mode !== 'report' && mode !== 'import-existing') {
		throw new Error(`Invalid mode: ${mode}`);
	}
	const suite = values.get('suite');
	if (suite !== undefined && !suiteIds.includes(suite as SuiteId)) {
		throw new Error(`Invalid suite: ${suite}`);
	}
	if ((suite !== undefined || values.has('grep')) && mode !== 'collect') {
		throw new Error('--suite and --grep are allowed only in collect mode; focused runs never update tracked stats');
	}
	if (mode === 'collect' && !suite) {
		throw new Error('collect mode requires --suite');
	}
	if (booleans.has('--write') && mode === 'collect') {
		throw new Error('collect mode cannot write tracked stats');
	}
	if (booleans.has('--accept-failed') && (mode === 'collect' || mode === 'import-existing' || (mode === 'report' && !booleans.has('--write')))) {
		throw new Error('--accept-failed requires a full run or report --write');
	}
	const jobs = Number(values.get('jobs') ?? 2);
	if (!Number.isInteger(jobs) || jobs < 1 || jobs > 4) {
		throw new Error('--jobs must be between 1 and 4');
	}
	const buildInfo = values.get('build-info') ?? process.env['COPILOT_RUNTIME_COVERAGE_BUILD_INFO'];
	if (!buildInfo) {
		throw new Error('Provide --build-info or COPILOT_RUNTIME_COVERAGE_BUILD_INFO; this command does not clone or build a runtime');
	}
	const optionalPath = (flag: string, environment?: string): string | undefined => {
		const value = values.get(flag) ?? (environment ? process.env[environment] : undefined);
		return value ? resolve(value) : undefined;
	};
	return {
		mode, buildInfo: resolve(buildInfo),
		runDirectory: optionalPath('run-dir', 'COPILOT_RUNTIME_COVERAGE_OUT') ?? join(repoRoot, '.build', 'copilot-runtime-coverage', 'runs', `${Date.now()}-${process.pid}`),
		source: optionalPath('source', 'COPILOT_RUNTIME_COVERAGE_SOURCE'),
		llvmTools: optionalPath('llvm-tools', 'COPILOT_RUNTIME_COVERAGE_LLVM_TOOLS'),
		publishedPackage: optionalPath('published-package'),
		metrics: optionalPath('metrics'), nativeSummary: optionalPath('native-summary'),
		status: optionalPath('status'), profdata: optionalPath('profdata'),
		profiles, v8Directories, suite: suite as SuiteId | undefined, grep: values.get('grep'), jobs,
		write: booleans.has('--write'), skipTranspile: booleans.has('--skip-transpile'),
		acceptFailed: booleans.has('--accept-failed'),
	};
}

function cleanEnvironment(): NodeJS.ProcessEnv {
	const environment = { ...process.env };
	for (const name of ['ELECTRON_RUN_AS_NODE', 'NODE_V8_COVERAGE', 'LLVM_PROFILE_FILE', 'COPILOT_CLI_VERSION', 'AGENT_HOST_RECORD_PROTOCOL_SURFACE', 'AGENT_HOST_PROTOCOL_SURFACE_OUT']) {
		delete environment[name];
	}
	return environment;
}

function capture(command: string, args: readonly string[], environment = cleanEnvironment()): string {
	const result = spawnSync(command, args, { cwd: repoRoot, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
	if (result.error || result.status !== 0) {
		throw result.error ?? new Error(`${basename(command)} failed (${result.status}): ${result.stderr}`);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}
	return result.stdout.trim();
}

function sameIdentity(info: JsonObject, build: Pick<IBuild, 'commit' | 'cliVersion'>, label: string): void {
	const metadata = record(info.buildMetadata, `${label}.buildMetadata`);
	const commit = text(metadata.gitCommit, `${label}.gitCommit`);
	if (info.version !== build.cliVersion || commit.length < 8 || !build.commit.startsWith(commit)) {
		throw new Error(`${label} version/git metadata does not match the source build`);
	}
}

function loadBuild(options: IOptions): IBuild {
	const manifest = readJson(options.buildInfo);
	if (manifest.status !== 'verified') {
		throw new Error('The build manifest must describe a verified coverage-instrumented runtime');
	}
	const artifact = record(manifest.nativeArtifacts, 'nativeArtifacts');
	const source = options.source ?? resolve(repoRoot, text(manifest.sourceCheckout, 'sourceCheckout'));
	const resolveArtifact = (value: unknown, label: string): string => {
		const file = resolve(repoRoot, text(value, label));
		if (!existsSync(file)) {
			throw new Error(`Missing ${label}: ${file}`);
		}
		return file;
	};
	const build: IBuild = {
		source,
		commit: text(manifest.sourceCommit, 'sourceCommit'),
		tag: text(manifest.sourceTag, 'sourceTag'),
		cliVersion: text(manifest.publishedCliVersion, 'publishedCliVersion'),
		sdkVersion: text(record(manifest.shutdownAcknowledgmentVerification, 'shutdownAcknowledgmentVerification').sdkVersion, 'sdkVersion'),
		rustToolchain: text(manifest.rustToolchain, 'rustToolchain'),
		rustFlags: text(manifest.rustFlags, 'rustFlags'),
		entrypoint: resolveArtifact(manifest.javascriptEntrypoint, 'javascriptEntrypoint'),
		runtime: resolveArtifact(artifact.runtime, 'runtime addon'),
		cli: resolveArtifact(artifact.cli, 'CLI addon'),
		llvmTools: options.llvmTools ?? resolve(repoRoot, text(manifest.llvmTools, 'llvmTools')),
		manifest,
	};
	if (!/^[a-f0-9]{40}$/.test(build.commit)
		|| capture('git', ['-C', source, 'rev-parse', 'HEAD']) !== build.commit
		|| capture('git', ['-C', source, 'rev-parse', `${build.tag}^{commit}`]) !== build.commit
		|| build.tag !== `cli-${build.cliVersion}`) {
		throw new Error('Source checkout, tag, commit and CLI version must agree');
	}
	sameIdentity(record(manifest.nativePackageInfo, 'nativePackageInfo'), build, 'nativePackageInfo');
	const published = record(manifest.publishedPackageMetadata, 'publishedPackageMetadata');
	sameIdentity({ version: build.cliVersion, buildMetadata: published }, build, 'publishedPackageMetadata');
	if (!build.rustFlags.includes('instrument-coverage')
		|| record(manifest.coverageBuildEnvironment, 'coverageBuildEnvironment').COPILOT_LLVM_COVERAGE_EXPORTS !== '1'
		|| record(manifest.profiling, 'profiling').runtimeShutdownPreAcknowledgmentFlushVerified !== true) {
		throw new Error('Coverage instrumentation and shutdown publication must be validated in the build manifest');
	}
	for (const name of ['llvm-profdata', 'llvm-cov']) {
		if (!existsSync(llvmTool(build, name))) {
			throw new Error(`Missing ${name} in ${build.llvmTools}`);
		}
	}
	for (const file of [build.entrypoint, build.runtime, build.cli]) {
		if (sourcePath(file, source) === undefined) {
			throw new Error('Runtime artifacts must be inside the verified source checkout');
		}
	}
	return build;
}

function llvmTool(build: IBuild, name: string): string {
	return join(build.llvmTools, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
}

/** Portable source paths only; external dependencies never enter the first-party denominator. */
function sourcePath(file: string, source: string): string | undefined {
	const normalized = relative(source, resolve(file)).split(sep).join('/');
	if (normalized === '..' || normalized.startsWith('../') || isAbsolute(normalized)) {
		return undefined;
	}
	return normalized;
}

function normalizeNative(summary: JsonObject, source: string): { total: NativeCoverage; files: readonly INativeFile[] } {
	if (summary.type !== 'llvm.coverage.json.export' || !Array.isArray(summary.data) || summary.data.length !== 1) {
		throw new Error('Expected one LLVM coverage export');
	}
	const data = record(summary.data[0], 'LLVM data');
	if (!Array.isArray(data.files)) {
		throw new Error('Missing LLVM file summaries');
	}
	const files: INativeFile[] = [];
	const seen = new Set<string>();
	const totals = { lines: [0, 0], functions: [0, 0], regions: [0, 0] };
	for (const item of data.files) {
		const entry = record(item, 'LLVM file');
		const normalized = sourcePath(text(entry.filename, 'LLVM filename'), source);
		if (!normalized?.startsWith('src/') || ['build.rs', 'coverage_profiles.rs'].includes(basename(normalized))) {
			continue;
		}
		if (seen.has(normalized)) {
			throw new Error(`Duplicate LLVM source: ${normalized}`);
		}
		seen.add(normalized);
		const coverage = record(entry.summary, normalized);
		const pairs: Record<NativeMetricName, readonly [number, number]> = { lines: [0, 0], functions: [0, 0], regions: [0, 0] };
		for (const name of nativeMetricNames) {
			const raw = record(coverage[name], `${normalized}.${name}`);
			const covered = count(raw.covered, `${name}.covered`);
			const total = count(raw.count, `${name}.count`);
			metric(covered, total);
			pairs[name] = [covered, total];
			totals[name][0] += covered;
			totals[name][1] += total;
		}
		files.push({ path: normalized, ...pairs });
	}
	if (files.length === 0) {
		throw new Error('No first-party native source files found');
	}
	files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	return {
		total: { lines: metric(totals.lines[0], totals.lines[1]), functions: metric(totals.functions[0], totals.functions[1]), regions: metric(totals.regions[0], totals.regions[1]) },
		files,
	};
}

function validateStatus(value: JsonObject): IRunStatus {
	if (!Array.isArray(value.suites) || (value.selection !== 'full' && value.selection !== 'focused')) {
		throw new Error('Run status requires selection and suites');
	}

	const suites: ISuiteResult[] = value.suites.map(item => {
		const entry = record(item, 'suite result');
		const suite = text(entry.suite, 'suite');
		if (!suiteIds.includes(suite as SuiteId)) {
			throw new Error(`Unknown suite result: ${suite}`);
		}
		return {
			suite: suite as SuiteId, exitCode: count(entry.exitCode, 'exitCode'),
			passing: count(entry.passing, 'passing'), pending: count(entry.pending, 'pending'),
			failing: count(entry.failing, 'failing'), auxiliaryPassing: count(entry.auxiliaryPassing, 'auxiliaryPassing'),
		};
	});
	if (new Set(suites.map(item => item.suite)).size !== suites.length) {
		throw new Error('Duplicate suite results');
	}
	const status = suites.some(item => item.exitCode !== 0 || item.failing !== 0) ? 'failed'
		: value.selection === 'full' && suites.length === suiteIds.length && suites.every(item => item.suite === 'prompts' ? item.passing + item.pending > 0 : item.passing > 0) ? 'passed' : 'incomplete';
	if (value.status !== status) {
		throw new Error(`Run status must be ${status}, not ${String(value.status)}`);
	}
	return { status, selection: value.selection, suites: suiteIds.flatMap(id => suites.filter(item => item.suite === id)) };
}

function canWriteMeasurement(status: IRunStatus, acceptFailed: boolean): boolean {
	return status.status === 'passed' || (acceptFailed && status.status === 'failed' && status.selection === 'full'
		&& status.suites.length === suiteIds.length
		&& status.suites.every(item => item.suite === 'prompts' ? item.passing + item.pending > 0 : item.passing > 0));
}

function importStatus(metrics: JsonObject): IRunStatus {
	if (!Array.isArray(metrics.tests)) {
		throw new Error('Historical metrics require explicit test outcomes');
	}
	const names: Record<string, SuiteId> = { Conformance: 'conformance', Claude: 'claude', Codex: 'codex', Copilot: 'copilot', 'Copilot prompts': 'prompts', 'Copilot OTel': 'otel' };
	const suites = metrics.tests.map(item => {
		const entry = record(item, 'historical suite');
		const suite = names[text(entry.suite, 'suite')];
		if (!suite) {
			throw new Error('Unknown historical suite');
		}
		return { suite, exitCode: count(entry.failing, 'failing') > 0 ? 1 : 0, passing: entry.passing, pending: entry.pending, failing: entry.failing, auxiliaryPassing: entry.auxiliaryPassing };
	});
	const status = suites.some(item => item.exitCode !== 0) ? 'failed' : suites.length === suiteIds.length ? 'passed' : 'incomplete';
	return validateStatus({ status, selection: 'full', suites });
}

function writeJson(file: string, value: unknown, compactFiles = false): void {
	mkdirSync(dirname(file), { recursive: true });
	const scratch = `${file}.${process.pid}.tmp`;
	let output = `${JSON.stringify(value, undefined, '\t')}\n`;
	if (compactFiles) {
		output = output.replace(/\{\n\t{4}"path": [\s\S]*?\n\t{3}\}/g, block => JSON.stringify(JSON.parse(block)));
	}
	try {
		writeFileSync(scratch, output);
		renameSync(scratch, file);
	} finally {
		rmSync(scratch, { force: true });
	}
}

function wrapperSummary(value: JsonObject): { files: number; total: Record<'lines' | 'functions' | 'branches', IMetric> } {
	const rawTotal = record(value.total, 'c8 total');
	const total: Record<'lines' | 'functions' | 'branches', IMetric> = { lines: metric(0, 0), functions: metric(0, 0), branches: metric(0, 0) };
	for (const name of ['lines', 'functions', 'branches'] as const) {
		const entry = record(rawTotal[name], name);
		total[name] = metric(count(entry.covered, 'covered'), count(entry.total, 'total'));
	}
	const files = Object.keys(value).filter(key => key !== 'total');
	if (files.length === 0 || total.lines.total === 0) {
		throw new Error('No SDK wrapper coverage');
	}
	const sdkSource = join(repoRoot, 'node_modules', '@github', 'copilot-sdk', 'dist');
	for (const file of files) {
		const normalized = sourcePath(file, sdkSource);
		if (!normalized?.endsWith('.js') || normalized.includes('/node_modules/') || normalized.startsWith('cjs/')) {
			throw new Error(`Unexpected file in SDK wrapper report: ${file}`);
		}
	}
	return { files: files.length, total };
}

function importedWrapper(value: JsonObject): { files: number; total: Record<'lines' | 'functions' | 'branches', IMetric> } {
	const wrapper = record(value.sdkWrapper, 'sdkWrapper');
	const total = record(wrapper.total, 'sdkWrapper.total');
	const normalized: Record<'lines' | 'functions' | 'branches', IMetric> = { lines: metric(0, 0), functions: metric(0, 0), branches: metric(0, 0) };
	for (const name of ['lines', 'functions', 'branches'] as const) {
		const entry = record(total[name], name);
		normalized[name] = metric(count(entry.covered, 'covered'), count(entry.count, 'count'));
	}
	return { total: normalized, files: count(wrapper.files, 'sdkWrapper.files') };
}

function trackedStats(build: IBuild, status: IRunStatus, native: ReturnType<typeof normalizeNative>, wrapper: ReturnType<typeof wrapperSummary>, vscodeCommit: string) {
	const profiling = record(build.manifest.profiling, 'profiling');
	if (!/^[a-f0-9]{40}$/.test(vscodeCommit) || /(?:[a-z]:[\\/]|\/(?:home|Users)\/)/i.test(build.rustFlags)) {
		throw new Error('Tracked provenance must contain a commit identity and portable Rust flags, not local paths');
	}
	return {
		version: 1,
		source: { repository: 'github/copilot-agent-runtime', commit: build.commit, tag: build.tag, cliVersion: build.cliVersion, sdkVersion: build.sdkVersion, vscodeCommit },
		build: { platform: process.platform, architecture: process.arch, rustToolchain: build.rustToolchain, rustFlags: build.rustFlags, profile: 'native-debug', objects: [sourcePath(build.runtime, build.source), sourcePath(build.cli, build.source)] },
		run: status,
		scope: {
			native: { include: ['src/**'], exclude: ['**/build.rs', '**/coverage_profiles.rs'], compiledFilesIncludingUnloaded: true, generatedCodeIncluded: true, branchesAvailable: false, fileMetricTuple: ['covered', 'total'] },
			sdkWrapper: { include: ['@github/copilot-sdk/dist/**/*.js'], exclude: ['**/cjs/**', '**/*.cjs', '**/node_modules/**'], includeUnloaded: true, sourceMapsAvailable: false },
			checkpointIntervalMs: count(profiling.checkpointIntervalMs, 'checkpointIntervalMs'),
			forcedTerminationMayLoseTail: true,
		},
		native: { filesCount: native.files.length, total: native.total, files: native.files },
		sdkWrapper: wrapper,
	};
}

function assertHistoricalMetrics(value: JsonObject, build: IBuild, native: ReturnType<typeof normalizeNative>): void {
	const revisions = record(value.revisions, 'historical revisions');
	if (revisions.runtime !== build.commit || revisions.cli !== build.cliVersion || revisions.sdk !== build.sdkVersion) {
		throw new Error('Historical metrics do not match the verified build');
	}
	const run = record(value.run, 'historical run');
	if (run.replayOnly !== true || run.retriesIncludedInCoverage !== false || run.platform !== 'Windows x64') {
		throw new Error('Historical import requires the original Windows replay-only measurement, without retries');
	}
	const expected = record(value.native, 'historical native');
	if (expected.files !== native.files.length || !Array.isArray(expected.filesByPath) || expected.filesByPath.length !== native.files.length) {
		throw new Error('Historical native file counts do not match the LLVM export');
	}
	const expectedTotal = record(expected.total, 'historical native total');
	for (const name of nativeMetricNames) {
		const entry = record(expectedTotal[name], name);
		if (entry.covered !== native.total[name].covered || entry.count !== native.total[name].total) {
			throw new Error(`Historical native ${name} do not match the LLVM export`);
		}
	}
	const byPath = new Map<string, JsonObject>(expected.filesByPath.map(item => {
		const entry = record(item, 'historical native file');
		return [`src/${text(entry.path, 'path')}`, record(entry.metrics, 'metrics')] as const;
	}));
	if (byPath.size !== native.files.length) {
		throw new Error('Duplicate historical native paths');
	}
	for (const file of native.files) {
		const expectedFile = record(byPath.get(file.path), file.path);
		for (const name of nativeMetricNames) {
			const entry = record(expectedFile[name], name);
			if (entry.covered !== file[name][0] || entry.count !== file[name][1]) {
				throw new Error(`Historical native counts differ for ${file.path}`);
			}
		}
	}
}

function runLogged(command: string, args: readonly string[], environment: NodeJS.ProcessEnv, stdout: string, stderr: string): number {
	const output = openSync(stdout, 'w');
	const errors = openSync(stderr, 'w');
	try {
		const result = spawnSync(command, args, { cwd: repoRoot, env: environment, stdio: ['ignore', output, errors] });
		if (result.error) {
			throw result.error;
		}
		return result.status ?? 1;
	} finally {
		closeSync(output);
		closeSync(errors);
		const warnings = readFileSync(stderr, 'utf8');
		if (warnings) {
			process.stderr.write(warnings);
		}
	}
}

function profileFiles(directory: string, extension: string): readonly string[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	return entries.flatMap(entry => entry.isDirectory() ? profileFiles(join(directory, entry.name), extension) : entry.name.endsWith(extension) ? [join(directory, entry.name)] : []).sort();
}

function exportNative(build: IBuild, options: IOptions, environment: NodeJS.ProcessEnv): JsonObject {
	const profdata = options.profdata ?? join(options.runDirectory, 'native.profdata');
	if (!options.profdata) {
		const profiles = [...new Set(options.profiles.flatMap(directory => profileFiles(directory, '.profraw')))].sort();
		if (profiles.length === 0) {
			throw new Error('No published .profraw profiles; checkpoints ending .tmp are deliberately excluded');
		}
		const inputs = join(options.runDirectory, 'native-profile-inputs.txt');
		writeFileSync(inputs, `${profiles.join('\n')}\n`);
		if (runLogged(llvmTool(build, 'llvm-profdata'), ['merge', '--sparse', '--num-threads=1', '-f', inputs, '-o', profdata], environment, join(options.runDirectory, 'merge.stdout.log'), join(options.runDirectory, 'merge.stderr.log')) !== 0) {
			throw new Error('Native profile merge failed');
		}
	}
	const output = join(options.runDirectory, 'native-summary.json');
	const exportArguments = ['export', '--summary-only', '--num-threads=1', `--instr-profile=${profdata}`, build.runtime, `--object=${build.cli}`];
	const stderr = join(options.runDirectory, 'native.stderr.log');
	if (runLogged(llvmTool(build, 'llvm-cov'), exportArguments, environment, output, stderr) !== 0) {
		throw new Error('Native coverage export failed');
	}
	if (readFileSync(stderr, 'utf8').includes('mismatched')) {
		const diagnosticStderr = join(options.runDirectory, 'native-diagnostics.stderr.log');
		if (runLogged(llvmTool(build, 'llvm-cov'), [...exportArguments, '--dump'], environment, join(options.runDirectory, 'native-diagnostics.stdout.log'), diagnosticStderr) !== 0) {
			throw new Error('Native mapping diagnostics failed');
		}
		const diagnostics = readFileSync(diagnosticStderr, 'utf8').split(/\r?\n/).filter(line => line.includes('hash-mismatch:'));
		if (diagnostics.length === 0 || diagnostics.some(line => !line.includes('hash = 0x0') || !/Cs[A-Za-z0-9]+_(?:7tracing|11flatbuffers|12aho_corasick|6memchr|11markup5ever)/.test(line))) {
			throw new Error('LLVM mapping mismatch is not one of the documented excluded hash-zero dependencies');
		}
	}
	return readJson(output);
}

function reportWrapper(build: IBuild, options: IOptions, environment: NodeJS.ProcessEnv): ReturnType<typeof wrapperSummary> {
	if (readJson(join(repoRoot, 'node_modules', '@github', 'copilot-sdk', 'package.json')).version !== build.sdkVersion) {
		throw new Error('Installed SDK differs from the original profiles; wrapper counts would not be comparable');
	}
	const raw = join(options.runDirectory, 'v8-combined');
	mkdirSync(raw);
	let number = 0;
	for (const directory of options.v8Directories) {
		for (const file of profileFiles(directory, '.json')) {
			fs.copyFileSync(file, join(raw, `coverage-${number++}.json`));
		}
	}
	if (number === 0) {
		throw new Error('No V8 profiles; wrapper coverage must not be fabricated from unloaded files alone');
	}
	const reportDirectory = join(options.runDirectory, 'sdk-report');
	const code = runLogged(process.execPath, [
		join(repoRoot, 'node_modules', 'c8', 'bin', 'c8.js'), 'report',
		'--temp-directory', raw, '--reports-dir', reportDirectory, '--reporter', 'json-summary', '--reporter', 'lcov',
		'--all', '--src', 'node_modules/@github/copilot-sdk/dist',
		'--include', 'node_modules/@github/copilot-sdk/dist/**/*.js',
		'--exclude', '**/cjs/**', '--exclude', '**/*.cjs', '--exclude', '**/node_modules/**/node_modules/**', '--exclude-after-remap=false', '--exclude-node-modules=false',
	], environment, join(options.runDirectory, 'c8.stdout.log'), join(options.runDirectory, 'c8.stderr.log'));
	if (code !== 0) {
		throw new Error('SDK wrapper coverage report failed');
	}
	return wrapperSummary(readJson(join(reportDirectory, 'coverage-summary.json')));
}

/** The entrypoint is the only installed file changed; restore even when tests or reporting fail. */
function withEntrypointOverride(entrypoint: string, replacement: string, callback: () => void): void {
	const original = readFileSync(entrypoint);
	const backup = `${entrypoint}.copilot-runtime-coverage-backup`;
	const lock = openSync(backup, 'wx');
	try {
		fs.writeFileSync(lock, original);
	} finally {
		closeSync(lock);
	}
	try {
		writeFileSync(entrypoint, replacement);
		callback();
	} finally {
		writeFileSync(entrypoint, original);
		rmSync(backup);
	}
}

function parseSuiteOutput(suite: SuiteId, output: string, exitCode: number, focused = false): ISuiteResult {
	const summary = (name: string): number => {
		const match = new RegExp(`^\\s*(?<count>\\d+) ${name}(?:\\s|$)`, 'm').exec(output.replace(/\x1b\[[0-9;]*m/g, ''));
		return match ? Number(match.groups!.count) : 0;
	};
	const passing = summary('passing');
	const pending = summary('pending');
	const failing = summary('failing');
	const auxiliaryPassing = focused ? 0 : suite === 'prompts' ? 3 : suite === 'otel' ? 1 : 0;
	if (passing < auxiliaryPassing || passing + pending + failing === 0) {
		throw new Error(`Missing or incomplete Mocha summary for ${suite}`);
	}
	return { suite, exitCode, passing: passing - auxiliaryPassing, pending, failing, auxiliaryPassing };
}

function runSupplemental(suite: SuiteId, grep: string | undefined, options: IOptions, environment: NodeJS.ProcessEnv): ISuiteResult {
	const stem = suite === 'prompts' ? 'copilotPromptsE2E' : suite === 'otel' ? 'copilotOtelAgentHostE2E' : suite === 'conformance' ? 'agentHostConformance' : `${suite}AgentHostE2E`;
	const folder = suite === 'conformance' ? 'conformance' : 'providers';
	const file = join('src', 'vs', 'platform', 'agentHost', 'test', 'node', 'e2e', folder, `${stem}.integrationTest.ts`);
	const testScript = join(repoRoot, 'scripts', process.platform === 'win32' ? 'test-integration.bat' : 'test-integration.sh');
	const args = ['--run', file, ...(grep ? ['--grep', grep] : [])];
	const output = join(options.runDirectory, `${suite}.stdout.log`);
	const code = process.platform === 'win32'
		? runLogged(join(process.env['SYSTEMROOT'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(repoRoot, 'test', 'integration', 'agentHost', 'child.ps1'), testScript, ...args], environment, output, join(options.runDirectory, `${suite}.stderr.log`))
		: runLogged(testScript, args, environment, output, join(options.runDirectory, `${suite}.stderr.log`));
	return parseSuiteOutput(suite, readFileSync(output, 'utf8'), code, grep !== undefined);
}

function validateRunEnvironment(build: IBuild, options: IOptions): string {
	const flags = ['AGENT_HOST_REAL_CODEX', 'AGENT_HOST_REPLAY_RECORD', 'AGENT_HOST_UPDATE_AHP_SNAPSHOTS', 'AGENT_HOST_UPDATE_SNAPSHOTS', 'AGENT_HOST_RUN_KNOWN_ISSUES', 'VSCODE_SKIP_AGENT_HOST_E2E'];
	for (const name of flags) {
		if (process.env[name] && process.env[name] !== '0') {
			throw new Error(`Unset ${name}; coverage requires the complete deterministic replay suite`);
		}
	}
	for (const name of ['@anthropic-ai/claude-agent-sdk', '@openai/codex', '@github/copilot', '@github/copilot-sdk', 'c8']) {
		if (!existsSync(join(repoRoot, 'node_modules', ...name.split('/'), 'package.json'))) {
			throw new Error(`Missing installed dependency ${name}; restore dependencies separately before overriding the CLI`);
		}
	}
	if (readJson(join(repoRoot, 'node_modules', '@github', 'copilot-sdk', 'package.json')).version !== build.sdkVersion) {
		throw new Error('Installed SDK version differs from the verified build measurement');
	}
	const installed = readJson(join(repoRoot, 'node_modules', '@github', 'copilot', 'package.json'));
	sameIdentity(installed, build, 'installed CLI');
	if (options.publishedPackage) {
		sameIdentity(readJson(options.publishedPackage), build, 'published CLI');
	}
	const platformDirectory = join(repoRoot, 'node_modules', '@github', `copilot-${process.platform}-${process.arch}`);
	if (readJson(join(platformDirectory, 'package.json')).version !== build.cliVersion) {
		throw new Error('Installed CLI platform package version differs from the verified runtime');
	}
	const validationDirectory = join(options.runDirectory, 'validation-native-profiles');
	mkdirSync(validationDirectory);
	const validationEnvironment = { ...cleanEnvironment(), LLVM_PROFILE_FILE: join(validationDirectory, 'validation-%p-%m.profraw') };
	const nativeInfo = JSON.parse(capture(process.execPath, ['-e', 'console.log(JSON.stringify(require(process.argv[1]).supportPackageInfo()))', build.runtime], validationEnvironment)) as unknown;
	sameIdentity(record(nativeInfo, 'runtime addon metadata'), build, 'runtime addon');
	const version = capture(process.execPath, [build.entrypoint, '--version'], validationEnvironment);
	if (!version.includes(`GitHub Copilot CLI ${build.cliVersion}.`)) {
		throw new Error('Runtime CLI --version differs from the verified manifest');
	}
	return join(platformDirectory, 'index.js');
}

function executeTests(build: IBuild, options: IOptions, environment: NodeJS.ProcessEnv): IRunStatus {
	const entrypoint = validateRunEnvironment(build, options);
	if (!options.skipTranspile) {
		if (runLogged(process.execPath, [join(repoRoot, 'build', 'next', 'index.ts'), 'transpile'], environment, join(options.runDirectory, 'transpile.stdout.log'), join(options.runDirectory, 'transpile.stderr.log')) !== 0) {
			throw new Error('VS Code transpilation failed');
		}
	}
	const helper = join(repoRoot, 'out', 'vs', 'platform', 'agentHost', 'test', 'node', 'serverIntegrationTestHelpers.js');
	if (!existsSync(helper) || !readFileSync(helper, 'utf8').includes('AGENT_HOST_E2E_COVERAGE_DIR')) {
		throw new Error('Compiled serverIntegrationTestHelpers must honor AGENT_HOST_E2E_COVERAGE_DIR before isolated coverage runs');
	}
	const nativeDirectory = join(options.runDirectory, 'native-profiles');
	const v8Directory = join(options.runDirectory, 'v8-profiles');
	mkdirSync(nativeDirectory);
	mkdirSync(v8Directory);
	const testEnvironment: NodeJS.ProcessEnv = {
		...environment, VSCODE_SKIP_PRELAUNCH: '1', AGENT_HOST_E2E_COVERAGE: '1',
		AGENT_HOST_E2E_COVERAGE_DIR: v8Directory, NODE_V8_COVERAGE: v8Directory,
		LLVM_PROFILE_FILE: join(nativeDirectory, 'e2e-%p-%m.profraw'),
	};
	const results: ISuiteResult[] = [];
	const entrypointUrl = require('url').pathToFileURL(build.entrypoint).href as string;
	withEntrypointOverride(entrypoint, `await import(${JSON.stringify(entrypointUrl)});\n`, () => {
		if (options.mode === 'collect') {
			results.push(runSupplemental(options.suite!, options.grep, options, testEnvironment));
		} else {
			const output = join(options.runDirectory, 'full.stdout.log');
			const code = runLogged(process.execPath, [join(repoRoot, 'test', 'integration', 'agentHost', 'runner.ts'), '--jobs', String(options.jobs), '--storage', 'disk'], testEnvironment, output, join(options.runDirectory, 'full.stderr.log'));
			const log = readFileSync(output, 'utf8');
			const labels: Record<string, SuiteId> = { Conformance: 'conformance', Claude: 'claude', Codex: 'codex', Copilot: 'copilot' };
			for (const [label, suite] of Object.entries(labels)) {
				const section = log.split(`===== Agent Host E2E — ${label} =====`)[1]?.split('=====')[0];
				const suiteCode = new RegExp(`^\\s*PASS ${label}:`, 'm').test(log) ? 0 : 1;
				if (!section) {
					throw new Error(`Missing ${label} output; full suite failed with ${code}`);
				}
				results.push(parseSuiteOutput(suite, section, suiteCode));
			}
			if (code !== 0 && results.every(item => item.exitCode === 0)) {
				throw new Error('Full suite runner failed despite per-suite success');
			}
			results.push(runSupplemental('prompts', undefined, options, testEnvironment), runSupplemental('otel', undefined, options, testEnvironment));
		}
	});
	const status = results.some(item => item.exitCode !== 0 || item.failing !== 0) ? 'failed' : options.mode === 'collect' ? 'incomplete' : 'passed';
	return validateStatus({ status, selection: options.mode === 'collect' ? 'focused' : 'full', suites: results });
}

function main(): void {
	if (process.argv.includes('--help')) {
		console.log([
			'Usage: npm run test-copilot-runtime-e2e-coverage -- --build-info <verified-manifest.json> [options]',
			'  --mode run                Fresh full replay, then reports and atomic tracked update (default)',
			'  --mode collect --suite <conformance|claude|codex|copilot|prompts|otel> [--grep <pattern>]',
			'                            Fresh focused profiles and run-status.json; never tracked',
			'  --mode report --status <run-status.json> --profiles <dir> --v8 <dir> [--write]',
			'                            Merge/report existing profiles; repeat --profiles/--v8 for discovery unions',
			'  --mode import-existing --metrics <coverage-metrics.json> --native-summary <llvm-export.json> [--write]',
			'                            Explicit historical import, including failed/incomplete baseline status',
			'  --profdata <file>          Use a previously merged native profile in report mode',
			'  --run-dir <empty-dir>      Isolated output (default: .build/copilot-runtime-coverage/runs/<unique>)',
			'  --source <checkout> --llvm-tools <dir> --published-package <package.json>',
			'  --jobs <1..4> --skip-transpile',
			'  --accept-failed           Explicitly track a complete failed attempt; status and exit code stay failed',
			'No runtime build, clone, dependency install, snapshot update or recording is performed.',
			'Report mode --write requires a full passing status unless --accept-failed is explicit. Import mode preserves failures.',
		].join('\n'));
		return;
	}
	const options = parseArguments(process.argv.slice(2));
	if (sourcePath(options.runDirectory, join(repoRoot, '.build')) === undefined) {
		throw new Error('--run-dir must be inside this worktree .build directory');
	}
	if (existsSync(options.runDirectory) && readdirSync(options.runDirectory).length !== 0) {
		throw new Error('--run-dir must be empty; existing measurements are never deleted');
	}
	mkdirSync(options.runDirectory, { recursive: true });
	try {
		const build = loadBuild(options);
		const environment = cleanEnvironment();
		let status: IRunStatus;
		let native: ReturnType<typeof normalizeNative>;
		let wrapper: ReturnType<typeof wrapperSummary>;
		let vscodeCommit: string;
		if (options.mode === 'import-existing') {
			if (!options.metrics || !options.nativeSummary) {
				throw new Error('import-existing requires --metrics and --native-summary');
			}
			const metrics = readJson(options.metrics);
			native = normalizeNative(readJson(options.nativeSummary), build.source);
			assertHistoricalMetrics(metrics, build, native);
			status = importStatus(metrics);
			wrapper = importedWrapper(metrics);
			vscodeCommit = text(record(metrics.revisions, 'revisions').vscode, 'vscode revision');
		} else {
			status = options.mode === 'report'
				? validateStatus(readJson(options.status ?? ''))
				: executeTests(build, options, environment);
			writeJson(join(options.runDirectory, 'run-status.json'), status);
			if (options.mode === 'collect') {
				console.log(`Focused ${status.status} profiles: ${options.runDirectory}`);
				process.exitCode = status.status === 'failed' ? 1 : 0;
				return;
			}
			const reportingOptions = options.mode === 'run' ? { ...options, profiles: [join(options.runDirectory, 'native-profiles')], v8Directories: [join(options.runDirectory, 'v8-profiles')] } : options;
			native = normalizeNative(exportNative(build, reportingOptions, environment), build.source);
			wrapper = reportWrapper(build, reportingOptions, environment);
			vscodeCommit = capture('git', ['rev-parse', 'HEAD']);
		}
		const denominator = record(build.manifest.nativeDenominatorVerification, 'nativeDenominatorVerification');
		if (denominator.firstPartyFiles !== native.files.length
			|| denominator.firstPartyLines !== native.total.lines.total
			|| denominator.firstPartyFunctions !== native.total.functions.total
			|| denominator.firstPartyRegions !== native.total.regions.total) {
			throw new Error('LLVM denominator differs from the verified build; do not compare different compiled scopes');
		}
		const stats = trackedStats(build, status, native, wrapper, vscodeCommit);
		writeJson(join(options.runDirectory, 'copilot-runtime.json'), stats, true);
		writeJson(join(options.runDirectory, 'run-status.json'), status);
		if (options.mode === 'run' || options.write) {
			if (options.mode !== 'import-existing' && !canWriteMeasurement(status, options.acceptFailed)) {
				throw new Error(`Measurement is ${status.status}; previous tracked stats retained (diagnostic report is available)`);
			}
			writeJson(statsPath, stats, true);
		}
		console.log(`Native lines: ${native.total.lines.covered}/${native.total.lines.total} (${native.total.lines.percentage}%). Run: ${status.status}. Outputs: ${options.runDirectory}`);
		if (status.status !== 'passed') {
			process.exitCode = 1;
		}
	} catch (error) {
		writeJson(join(options.runDirectory, 'workflow-error.json'), { error: error instanceof Error ? error.message : String(error), trackedStatsUpdated: false });
		throw error;
	}
}

if (require.main === module) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

module.exports = { normalizeNative, validateStatus, canWriteMeasurement, parseArguments, withEntrypointOverride, parseSuiteOutput, assertHistoricalMetrics, sameIdentity, wrapperSummary, validateRunEnvironment };
