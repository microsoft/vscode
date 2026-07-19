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
const statsPath = join(repoRoot, 'src', 'vs', 'platform', 'agentHost', 'test', 'node', 'protocol', 'coverage', 'agentHostE2E.json');
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
	'AGENT_HOST_REAL_SDK',
	'AGENT_HOST_REPLAY_RECORD',
	'AGENT_HOST_UPDATE_AHP_SNAPSHOTS',
	'AGENT_HOST_UPDATE_SNAPSHOTS',
];

const resourceIntegrationGlob = '**/agentHost/test/node/protocol/resourceOperations.integrationTest.js';
const protocolIntegrationGlob = '**/agentHost/test/node/protocol/{agentHostServer,clientTools,copilotAgentHostE2EMocked,handshake,multiClient,networkDiagnostics,otlpLogs,sessionConfig,sessionDiffs,sessionFeatures,sessionLifecycle,toolApproval,turnExecution}.integrationTest.js';
const providerE2EGlob = '**/*AgentHostE2E.integrationTest.js';

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
	};
	const testScript = join(repoRoot, 'scripts', process.platform === 'win32' ? 'test-integration.bat' : 'test-integration.sh');
	run(testScript, ['--runGlob', resourceIntegrationGlob], testEnvironment, process.platform === 'win32');
	run(testScript, ['--runGlob', protocolIntegrationGlob], testEnvironment, process.platform === 'win32');
	run(testScript, ['--runGlob', providerE2EGlob], testEnvironment, process.platform === 'win32');

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

function run(command: string, args: readonly string[], environment: NodeJS.ProcessEnv, shell = false): void {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: environment,
		shell,
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
			suites: ['protocol', 'claude', 'codex', 'copilotcli'],
		},
		total,
		files,
	};

	mkdirSync(dirname(statsPath), { recursive: true });
	const temporaryStatsPath = `${statsPath}.${process.pid}.tmp`;
	try {
		writeFileSync(temporaryStatsPath, `${JSON.stringify(stats, undefined, '\t')}\n`);
		renameSync(temporaryStatsPath, statsPath);
	} finally {
		rmSync(temporaryStatsPath, { force: true });
	}
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

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
}
