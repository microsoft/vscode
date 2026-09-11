/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const childProcess: typeof import('child_process') = require('child_process');
const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const path: typeof import('path') = require('path');
const { spawn, spawnSync } = childProcess;
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = fs;
const { availableParallelism, cpus } = os;
const { basename, dirname, extname, join, resolve } = path;

const repoRoot = resolve(__dirname, '..');
const testScript = join(repoRoot, 'scripts', process.platform === 'win32' ? 'test-integration.bat' : 'test-integration.sh');
const windowsTestWrapper = join(repoRoot, 'scripts', 'test-agent-host-e2e-child.ps1');
const incompatibleFlags = [
	'AGENT_HOST_REPLAY_RECORD',
	'AGENT_HOST_UPDATE_AHP_SNAPSHOTS',
	'AGENT_HOST_UPDATE_SNAPSHOTS',
];

interface ISuite {
	readonly id: string;
	readonly label: string;
	readonly args: readonly string[];
}

interface IRunResult {
	readonly suite: ISuite;
	readonly succeeded: boolean;
	readonly durationSeconds: number;
	readonly failure?: string;
	readonly failureDetails?: string;
}

interface IObservedSurface {
	readonly commands: readonly string[];
	readonly notifications: readonly string[];
	readonly actions: readonly string[];
}

const suites: readonly ISuite[] = [
	{
		id: 'conformance',
		label: 'Conformance',
		args: ['--run', 'src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts'],
	},
	{
		id: 'claude',
		label: 'Claude',
		args: ['--run', 'src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts'],
	},
	{
		id: 'codex',
		label: 'Codex',
		args: ['--run', 'src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts'],
	},
	{
		id: 'copilot',
		label: 'Copilot',
		args: ['--run', 'src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts'],
	},
];

const nodeIntegrationSuite: ISuite = {
	id: 'node',
	label: 'Node.js integration',
	args: [
		'--runGlob', '**/*.integrationTest.js',
		'--excludeRunGlob', '**/agentHost/test/node/e2e/{providers/*AgentHostE2E,conformance/*}.integrationTest.js',
	],
};

async function main(): Promise<void> {
	validateEnvironment();
	const { jobs, forwardedArgs, includeNodeTests } = parseArguments(process.argv.slice(2));
	const skipAgentHostE2E = includeNodeTests && process.env['VSCODE_SKIP_AGENT_HOST_E2E'] === '1';
	const selectedSuites = skipAgentHostE2E ? [] : [...suites];
	if (includeNodeTests) {
		selectedSuites.push(nodeIntegrationSuite);
	}
	if (skipAgentHostE2E) {
		console.log('Skipping Agent Host E2E tests because no relevant files changed.');
	}
	const workerCount = Math.min(jobs, selectedSuites.length);
	const runLabel = includeNodeTests ? 'Node.js integration' : 'Agent Host E2E';
	prepareTestRuntime();

	const startedAt = process.hrtime.bigint();
	const surfaceOutputs = prepareSurfaceOutputs(selectedSuites);
	const results: IRunResult[] = [];
	let nextSuite = 0;

	const workers = Array.from({ length: workerCount }, async () => {
		while (nextSuite < selectedSuites.length) {
			const suiteIndex = nextSuite++;
			const suite = selectedSuites[suiteIndex];
			results[suiteIndex] = await runSuite(suite, forwardedArgs, surfaceOutputs.get(suite.id));
		}
	});
	await Promise.all(workers);

	const failures = results.filter(result => !result.succeeded);
	if (surfaceOutputs.size > 0 && failures.length === 0) {
		mergeSurfaceOutputs(surfaceOutputs);
	}

	const durationSeconds = elapsedSeconds(startedAt);
	console.log(`\n${runLabel} suites completed in ${durationSeconds.toFixed(1)}s (${workerCount} parallel ${workerCount === 1 ? 'worker' : 'workers'}).`);
	for (const result of results) {
		console.log(`  ${result.succeeded ? 'PASS' : 'FAIL'} ${result.suite.label}: ${result.durationSeconds.toFixed(1)}s`);
	}
	if (failures.length > 0) {
		printFailureDetails(failures, runLabel);
		process.exitCode = 1;
	}
}

function validateEnvironment(): void {
	const enabledFlags = incompatibleFlags.filter(flag => process.env[flag] === '1');
	if (enabledFlags.length > 0) {
		throw new Error(`Parallel Agent Host E2E runs only support deterministic replay; unset ${enabledFlags.join(', ')}`);
	}
}

function parseArguments(args: readonly string[]): { jobs: number; forwardedArgs: readonly string[]; includeNodeTests: boolean } {
	const forwardedArgs: string[] = [];
	let requestedJobs: string | undefined = process.env['AGENT_HOST_E2E_JOBS'];
	let includeNodeTests = false;

	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--jobs') {
			requestedJobs = args[++index];
			if (!requestedJobs) {
				throw new Error('--jobs requires a value');
			}
		} else if (argument.startsWith('--jobs=')) {
			requestedJobs = argument.slice('--jobs='.length);
		} else if (argument === '--include-node-tests') {
			includeNodeTests = true;
		} else {
			forwardedArgs.push(argument);
		}
	}

	const ownedArguments = ['--run', '--runGlob', '--glob', '--runGrep', '--testSplit'];
	const conflictingArgument = forwardedArgs.find(argument => ownedArguments.some(owned => argument === owned || argument.startsWith(`${owned}=`)));
	if (conflictingArgument) {
		throw new Error(`${conflictingArgument} is managed by the Agent Host E2E runner`);
	}

	const defaultJobs = Math.min(suites.length, availableParallelism?.() ?? cpus().length);
	const jobs = requestedJobs === undefined ? defaultJobs : Number(requestedJobs);
	if (!Number.isInteger(jobs) || jobs < 1) {
		throw new Error(`Invalid Agent Host E2E worker count: ${requestedJobs}`);
	}
	return { jobs: Math.min(jobs, suites.length), forwardedArgs, includeNodeTests };
}

function prepareTestRuntime(): void {
	const environment = { ...process.env };
	delete environment.ELECTRON_RUN_AS_NODE;

	mkdirSync(join(repoRoot, '.build', 'crashes'), { recursive: true });
	if (!existsSync(join(repoRoot, 'node_modules'))) {
		runSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], environment);
	}
	if (process.env['VSCODE_SKIP_PRELAUNCH'] !== '1') {
		runSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'electron'], environment);
	}
}

function runSync(command: string, args: readonly string[], environment: NodeJS.ProcessEnv): void {
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

async function runSuite(suite: ISuite, forwardedArgs: readonly string[], surfaceOutput: string | undefined): Promise<IRunResult> {
	const suiteLabel = suite === nodeIntegrationSuite ? suite.label : `Agent Host E2E — ${suite.label}`;
	console.log(`Starting ${suiteLabel}`);
	const startedAt = process.hrtime.bigint();
	const environment: NodeJS.ProcessEnv = {
		...process.env,
		VSCODE_SKIP_PRELAUNCH: '1',
		...(surfaceOutput ? { AGENT_HOST_PROTOCOL_SURFACE_OUT: surfaceOutput } : {}),
	};
	delete environment.ELECTRON_RUN_AS_NODE;
	if (suite === nodeIntegrationSuite) {
		delete environment.AGENT_HOST_RECORD_PROTOCOL_SURFACE;
		delete environment.AGENT_HOST_PROTOCOL_SURFACE_OUT;
	}
	const script = suite === nodeIntegrationSuite
		? join(repoRoot, 'scripts', process.platform === 'win32' ? 'test.bat' : 'test.sh')
		: testScript;

	return new Promise(resolveResult => {
		const testArguments = [...suite.args, ...suiteArguments(forwardedArgs, suite)];
		const child = process.platform === 'win32'
			? spawn(join(process.env['SYSTEMROOT'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
				'-NoLogo',
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy', 'Bypass',
				'-File', windowsTestWrapper,
				script,
				...testArguments,
			], {
				cwd: repoRoot,
				env: environment,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			: spawn(script, testArguments, {
				cwd: repoRoot,
				env: environment,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		let output = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', chunk => output += chunk);
		child.stderr.on('data', chunk => output += chunk);
		child.on('error', error => {
			resolveResult({
				suite,
				succeeded: false,
				durationSeconds: elapsedSeconds(startedAt),
				failure: error.message,
				failureDetails: extractFailureDetails(output),
			});
		});
		child.on('close', (code, signal) => {
			const succeeded = code === 0;
			const failure = succeeded ? undefined : signal ? `signal ${signal}` : `code ${code}`;
			console.log(`\n===== ${suiteLabel} =====`);
			process.stdout.write(output);
			if (!output.endsWith('\n')) {
				process.stdout.write('\n');
			}
			resolveResult({
				suite,
				succeeded,
				durationSeconds: elapsedSeconds(startedAt),
				failure,
				failureDetails: succeeded ? undefined : extractFailureDetails(output),
			});
		});
	});
}

function extractFailureDetails(output: string): string | undefined {
	const lines = output.split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index--) {
		const line = lines[index].replace(/\x1b\[[0-9;]*m/g, '').trim();
		if (/^\d+ failing$/.test(line)) {
			return `${lines.slice(index).join('\n').trimEnd()}\n`;
		}
	}

	const trimmed = output.trim();
	return trimmed.length > 0 ? `${trimmed}\n` : undefined;
}

function printFailureDetails(failures: readonly IRunResult[], runLabel: string): void {
	console.log(`\n${runLabel} failure details:`);
	for (const result of failures) {
		const suiteLabel = result.suite === nodeIntegrationSuite ? result.suite.label : `Agent Host E2E — ${result.suite.label}`;
		console.log(`\n===== ${suiteLabel} failure =====`);
		if (result.failureDetails) {
			process.stdout.write(result.failureDetails);
		}
		console.log(`${suiteLabel} failed with ${result.failure ?? 'an unknown error'}`);
	}
}

function suiteArguments(args: readonly string[], suite: ISuite): readonly string[] {
	const result = [...args];
	const tfsIndex = result.indexOf('--tfs');
	if (suite !== nodeIntegrationSuite && tfsIndex >= 0 && result[tfsIndex + 1]) {
		result[tfsIndex + 1] = `${result[tfsIndex + 1]} ${suite.label}`;
	}
	return result;
}

function prepareSurfaceOutputs(selectedSuites: readonly ISuite[]): ReadonlyMap<string, string> {
	if (process.env['AGENT_HOST_RECORD_PROTOCOL_SURFACE'] !== '1') {
		return new Map();
	}

	const combinedOutput = process.env['AGENT_HOST_PROTOCOL_SURFACE_OUT']
		?? join(repoRoot, '.build', 'agent-host-e2e-coverage', 'protocol-surface', 'observed.json');
	const extension = extname(combinedOutput);
	const stem = basename(combinedOutput, extension);
	const outputs = new Map<string, string>();
	for (const suite of selectedSuites) {
		if (suite === nodeIntegrationSuite) {
			continue;
		}
		const output = join(dirname(combinedOutput), `${stem}-${suite.id}${extension}`);
		rmSync(output, { force: true });
		outputs.set(suite.id, output);
	}
	return outputs;
}

function mergeSurfaceOutputs(outputs: ReadonlyMap<string, string>): void {
	const combinedOutput = process.env['AGENT_HOST_PROTOCOL_SURFACE_OUT']
		?? join(repoRoot, '.build', 'agent-host-e2e-coverage', 'protocol-surface', 'observed.json');
	const commands = new Set<string>();
	const notifications = new Set<string>();
	const actions = new Set<string>();

	for (const output of outputs.values()) {
		if (!existsSync(output)) {
			if (process.env['AGENT_HOST_E2E_COVERAGE'] === '1') {
				throw new Error(`Missing protocol surface observations from ${output}`);
			}
			continue;
		}
		const observed = readObservedSurface(output);
		observed.commands.forEach(command => commands.add(command));
		observed.notifications.forEach(notification => notifications.add(notification));
		observed.actions.forEach(action => actions.add(action));
		rmSync(output, { force: true });
	}

	mkdirSync(dirname(combinedOutput), { recursive: true });
	writeFileSync(combinedOutput, `${JSON.stringify({
		commands: [...commands].sort(),
		notifications: [...notifications].sort(),
		actions: [...actions].sort(),
	}, undefined, '\t')}\n`);
}

function readObservedSurface(file: string): IObservedSurface {
	const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
	if (!isRecord(value)
		|| !isStringArray(value.commands)
		|| !isStringArray(value.notifications)
		|| !isStringArray(value.actions)
	) {
		throw new Error(`Invalid protocol surface observations in ${file}`);
	}
	return {
		commands: value.commands,
		notifications: value.notifications,
		actions: value.actions,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function elapsedSeconds(startedAt: bigint): number {
	return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
