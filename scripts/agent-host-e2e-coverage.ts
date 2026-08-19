/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const childProcess: typeof import('child_process') = require('child_process');
const fs: typeof import('fs') = require('fs');
const path: typeof import('path') = require('path');
const { spawnSync } = childProcess;
const { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } = fs;
const { dirname, isAbsolute, join, relative, resolve, sep } = path;

const repoRoot = resolve(__dirname, '..');
const coverageRoot = join(repoRoot, '.build', 'agent-host-e2e-coverage');
const rawCoveragePath = join(coverageRoot, 'raw');
const reportPath = join(coverageRoot, 'report');
const summaryPath = join(reportPath, 'coverage-summary.json');
const observedSurfacePath = join(coverageRoot, 'protocol-surface', 'observed.json');
const e2eRoot = join(repoRoot, 'src', 'vs', 'platform', 'agentHost', 'test', 'node', 'e2e');
const statsPath = join(e2eRoot, 'coverage', 'summary.json');
const surfaceStatsPath = join(e2eRoot, 'coverage', 'protocol-surface.json');
const protocolRoot = join(repoRoot, 'src', 'vs', 'platform', 'agentHost', 'common', 'state', 'protocol');
const metricNames = ['statements', 'branches', 'functions', 'lines'] as const;

type MetricName = typeof metricNames[number];

interface ICoverageMetric {
	readonly covered: number;
	readonly total: number;
	readonly percentage: number;
}

type Coverage = Record<MetricName, ICoverageMetric>;

const providerPackages = [
	'@anthropic-ai/claude-agent-sdk',
	'@github/copilot',
	'@github/copilot-sdk',
	'@openai/codex',
];

const incompatibleFlags = [
	'AGENT_HOST_REAL_CODEX',
	'AGENT_HOST_REPLAY_RECORD',
	'AGENT_HOST_UPDATE_AHP_SNAPSHOTS',
	'AGENT_HOST_UPDATE_SNAPSHOTS',
];

function main(): void {
	validateEnvironment();

	const environment = { ...process.env };
	delete environment.ELECTRON_RUN_AS_NODE;
	delete environment.NODE_V8_COVERAGE;

	rmSync(coverageRoot, { recursive: true, force: true });
	mkdirSync(rawCoveragePath, { recursive: true });

	run(process.execPath, [join(repoRoot, 'build', 'next', 'index.ts'), 'transpile'], environment);

	const testEnvironment = {
		...environment,
		AGENT_HOST_E2E_COVERAGE: '1',
		AGENT_HOST_RECORD_PROTOCOL_SURFACE: '1',
		AGENT_HOST_PROTOCOL_SURFACE_OUT: observedSurfacePath,
	};
	run(process.execPath, [join(repoRoot, 'scripts', 'test-agent-host-e2e.ts')], testEnvironment);

	const rawFiles = readdirSync(rawCoveragePath).filter(file => file.endsWith('.json'));
	if (rawFiles.length === 0) {
		throw new Error(`No raw V8 coverage files were written to ${rawCoveragePath}`);
	}

	const c8Path = join(repoRoot, 'node_modules', 'c8', 'bin', 'c8.js');
	run(process.execPath, [
		c8Path,
		'report',
		'--temp-directory', rawCoveragePath,
		'--reports-dir', reportPath,
		'--reporter', 'text',
		'--reporter', 'html',
		'--reporter', 'lcov',
		'--reporter', 'json-summary',
		'--include', 'out/vs/platform/agentHost/common/**/*.js',
		'--include', 'out/vs/platform/agentHost/node/**/*.js',
		'--exclude', 'out/vs/platform/agentHost/**/test/**',
		'--exclude', 'out/vs/platform/agentHost/**/*.test.js',
		'--exclude', 'out/vs/platform/agentHost/**/*.integrationTest.js',
		'--exclude', 'out/vs/platform/agentHost/common/state/protocol/channels-*/{actions,commands,notifications,state}.js',
		'--exclude', 'out/vs/platform/agentHost/common/state/protocol/common/state.js',
	], environment);

	writeStats();
	console.log(`Agent host E2E coverage stats written to ${relative(repoRoot, statsPath)}`);
	writeProtocolSurfaceStats();
	console.log(`Agent host protocol surface stats written to ${relative(repoRoot, surfaceStatsPath)}`);
}

function validateEnvironment(): void {
	const enabledFlags = incompatibleFlags.filter(flag => process.env[flag] === '1');
	if (enabledFlags.length > 0) {
		throw new Error(`Agent host E2E coverage requires deterministic replay; unset ${enabledFlags.join(', ')}`);
	}

	const missingPackages = providerPackages.filter(packageName => !existsSync(join(repoRoot, 'node_modules', ...packageName.split('/'))));
	if (missingPackages.length > 0) {
		throw new Error(`Agent host E2E coverage requires all provider dependencies; run npm install to add ${missingPackages.join(', ')}`);
	}
}

function run(command: string, args: readonly string[], environment: NodeJS.ProcessEnv): void {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: environment,
		stdio: 'inherit',
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const reason = result.signal ? `signal ${result.signal}` : `code ${result.status}`;
		throw new Error(`${command} exited with ${reason}`);
	}
}

function writeStats(): void {
	const summary: unknown = JSON.parse(readFileSync(summaryPath, 'utf8'));
	if (!isRecord(summary)) {
		throw new Error('The c8 coverage summary must be an object');
	}
	const fileEntries = Object.entries(summary)
		.filter(([filePath]) => filePath !== 'total')
		.map(([filePath, coverage]): readonly [string, Coverage] => [toSourcePath(filePath), normalizeCoverage(coverage, filePath)])
		.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
	if (fileEntries.length === 0) {
		throw new Error('The c8 report did not contain any loaded agent host source files');
	}

	const files: Record<string, Coverage> = {};
	for (const [filePath, coverage] of fileEntries) {
		if (files[filePath]) {
			throw new Error(`The c8 report contains duplicate source coverage for ${filePath}`);
		}
		files[filePath] = coverage;
	}

	const total = aggregateCoverage(Object.values(files));
	const reportedTotal = normalizeCoverage(summary.total, 'total');
	for (const metricName of metricNames) {
		if (total[metricName].total !== reportedTotal[metricName].total || total[metricName].covered !== reportedTotal[metricName].covered) {
			throw new Error(`The normalized ${metricName} total does not match c8's total`);
		}
	}

	const stats = {
		version: 1,
		scope: {
			loadedFilesOnly: true,
			include: [
				'src/vs/platform/agentHost/common/**/*.ts',
				'src/vs/platform/agentHost/node/**/*.ts',
			],
			suites: ['conformance', 'claude', 'codex', 'copilotcli'],
		},
		total,
		files,
	};

	writeJsonAtomically(statsPath, stats);
}

function toSourcePath(filePath: string): string {
	const absolutePath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
	const repoRelativePath = relative(repoRoot, absolutePath).split(sep).join('/');
	if (!/^src\/vs\/platform\/agentHost\/(?:common|node)\/.+\.ts$/.test(repoRelativePath) || repoRelativePath.includes('/test/')) {
		throw new Error(`Unexpected file in agent host E2E coverage: ${filePath}`);
	}
	return repoRelativePath;
}

function normalizeCoverage(coverage: unknown, label: string): Coverage {
	if (!isRecord(coverage)) {
		throw new Error(`Missing coverage metrics for ${label}`);
	}
	return {
		statements: normalizeMetric(coverage.statements, 'statements', label),
		branches: normalizeMetric(coverage.branches, 'branches', label),
		functions: normalizeMetric(coverage.functions, 'functions', label),
		lines: normalizeMetric(coverage.lines, 'lines', label),
	};
}

function normalizeMetric(metric: unknown, metricName: MetricName, label: string): ICoverageMetric {
	if (!isRecord(metric)
		|| typeof metric.total !== 'number'
		|| typeof metric.covered !== 'number'
		|| !Number.isInteger(metric.total)
		|| !Number.isInteger(metric.covered)
		|| metric.total < 0
		|| metric.covered < 0
		|| metric.covered > metric.total
	) {
		throw new Error(`Invalid ${metricName} coverage for ${label}`);
	}
	return createMetric(metric.covered, metric.total);
}

function aggregateCoverage(coverageEntries: readonly Coverage[]): Coverage {
	const counts: Record<MetricName, { covered: number; total: number }> = {
		statements: { covered: 0, total: 0 },
		branches: { covered: 0, total: 0 },
		functions: { covered: 0, total: 0 },
		lines: { covered: 0, total: 0 },
	};
	for (const coverage of coverageEntries) {
		for (const metricName of metricNames) {
			counts[metricName].covered += coverage[metricName].covered;
			counts[metricName].total += coverage[metricName].total;
		}
	}
	return {
		statements: createMetric(counts.statements.covered, counts.statements.total),
		branches: createMetric(counts.branches.covered, counts.branches.total),
		functions: createMetric(counts.functions.covered, counts.functions.total),
		lines: createMetric(counts.lines.covered, counts.lines.total),
	};
}

function createMetric(covered: number, total: number): ICoverageMetric {
	const percentage = total === 0 ? 100 : Math.floor((100_000 * covered) / total / 10) / 100;
	return { covered, total, percentage };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

interface ISurfaceGroup {
	readonly covered: number;
	readonly total: number;
	readonly percentage: number;
	readonly uncovered: readonly string[];
}

/**
 * Records how much of the Agent Host Protocol the E2E suites actually touch.
 *
 * Line coverage measures the current host implementation; this measures the
 * contract, so it stays meaningful if the implementation behind
 * `IAgentHostTarget` is replaced. A symbol counts as covered when it crosses
 * the wire in either direction, which is a floor on how well it is tested — the
 * value is in the `uncovered` lists, which name contract areas that no test
 * exercises at all.
 */
function writeProtocolSurfaceStats(): void {
	const observed = readObservedSurface();
	const stats = {
		version: 1,
		scope: {
			source: 'src/vs/platform/agentHost/common/state/protocol',
			note: 'A symbol is "covered" when an E2E test sends or receives it; this does not measure how deeply its semantics are asserted.',
		},
		commands: buildSurfaceGroup(declaredCommands(), observed.commands),
		notifications: buildSurfaceGroup(declaredNotifications(), observed.notifications),
		actions: buildSurfaceGroup(declaredActions(), observed.actions),
	};
	writeJsonAtomically(surfaceStatsPath, stats);
}

function readObservedSurface(): { commands: Set<string>; notifications: Set<string>; actions: Set<string> } {
	if (!existsSync(observedSurfacePath)) {
		throw new Error(`No protocol surface observations were written to ${observedSurfacePath}`);
	}
	const parsed: unknown = JSON.parse(readFileSync(observedSurfacePath, 'utf8'));
	if (!isRecord(parsed)) {
		throw new Error('The protocol surface observation file must be an object');
	}
	return {
		commands: toStringSet(parsed.commands, 'commands'),
		notifications: toStringSet(parsed.notifications, 'notifications'),
		actions: toStringSet(parsed.actions, 'actions'),
	};
}

function toStringSet(value: unknown, label: string): Set<string> {
	if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
		throw new Error(`Expected ${label} to be an array of strings in the protocol surface observations`);
	}
	return new Set(value as string[]);
}

function buildSurfaceGroup(declared: readonly string[], observed: ReadonlySet<string>): ISurfaceGroup {
	if (declared.length === 0) {
		throw new Error('Failed to extract any protocol symbols from the generated protocol sources');
	}
	const uncovered = declared.filter(symbol => !observed.has(symbol));
	const covered = declared.length - uncovered.length;
	return {
		covered,
		total: declared.length,
		percentage: Math.floor((100_000 * covered) / declared.length / 10) / 100,
		uncovered,
	};
}

/**
 * Extracts `@method` tags from the generated protocol sources. Both commands
 * and notifications are documented the same way, so the two are told apart by
 * the file they are declared in.
 */
function declaredMethods(fileName: 'commands.ts' | 'notifications.ts'): readonly string[] {
	const methods = new Set<string>();
	for (const directory of protocolSourceDirectories()) {
		const filePath = join(directory, fileName);
		if (!existsSync(filePath)) {
			continue;
		}
		for (const match of readFileSync(filePath, 'utf8').matchAll(/@method\s+([A-Za-z][A-Za-z0-9/]*)/g)) {
			methods.add(match[1]);
		}
	}
	return [...methods].sort();
}

function declaredCommands(): readonly string[] {
	return declaredMethods('commands.ts');
}

function declaredNotifications(): readonly string[] {
	return declaredMethods('notifications.ts');
}

/** Extracts the `ActionType` enum members, which are the action discriminants. */
function declaredActions(): readonly string[] {
	const source = readFileSync(join(protocolRoot, 'common', 'actions.ts'), 'utf8');
	const enumBody = /export const enum ActionType \{([^}]*)\}/.exec(source);
	if (!enumBody) {
		throw new Error('Failed to locate the ActionType enum in the generated protocol sources');
	}
	const actions = new Set<string>();
	for (const match of enumBody[1].matchAll(/=\s*'([^']+)'/g)) {
		actions.add(match[1]);
	}
	return [...actions].sort();
}

function protocolSourceDirectories(): readonly string[] {
	return readdirSync(protocolRoot, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && (entry.name === 'common' || entry.name.startsWith('channels-')))
		.map(entry => join(protocolRoot, entry.name));
}

function writeJsonAtomically(filePath: string, value: unknown): void {
	mkdirSync(dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(value, undefined, '\t')}\n`);
		renameSync(temporaryPath, filePath);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
}
