/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Runs the integration tests of scripts/test-integration.sh N at a time: each extension host
// suite, and each share of the node.js integration tests, in its own process with its own user
// data, extensions and logs directories. Optionally runs the Agent Host E2E suites before or at
// the same time. `scripts/test-integration.sh --jobs <n>` runs this script.

const childProcess: typeof import('child_process') = require('child_process');
const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const path: typeof import('path') = require('path');
const { spawn, spawnSync } = childProcess;
const { createWriteStream, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } = fs;
const { join, resolve } = path;

const repoRoot = resolve(__dirname, '../../..');
const isWindows = process.platform === 'win32';
const integrationScript = join(repoRoot, 'scripts', isWindows ? 'test-integration.bat' : 'test-integration.sh');
const agentHostScript = join(repoRoot, 'scripts', isWindows ? 'test-agent-host-e2e.bat' : 'test-agent-host-e2e.sh');
// Runs a batch file and exits with its exit code.
const windowsWrapper = join(repoRoot, 'test', 'integration', 'agentHost', 'child.ps1');
const logsRoot = join(repoRoot, '.build', 'logs', 'integration-tests');
const outputRoot = join(logsRoot, 'output');
const inGitHubActions = process.env['GITHUB_ACTIONS'] === 'true';
// More processes for the node.js integration tests would mostly add Electron startups.
const maxNodeShares = 8;
// Matches the files of AGENT_HOST_E2E_GLOB in scripts/test-integration.sh, which scripts/test-agent-host-e2e.sh runs instead.
const agentHostE2EFile = /\/agentHost\/test\/node\/e2e\/(providers\/[^/]*AgentHostE2E|conformance\/[^/]*)\.integrationTest\.ts$/;

/**
 * The extension host suites of scripts/test-integration.sh, by `--suite` name. Longest first
 * (from CI timings), so that a long suite does not start last.
 */
const suites: readonly { readonly name: string; readonly label: string }[] = [
	{ name: 'api-folder', label: 'API tests (folder)' },
	{ name: 'colorize', label: 'Colorize tests' },
	{ name: 'git', label: 'Git tests' },
	{ name: 'emmet', label: 'Emmet tests' },
	{ name: 'markdown', label: 'Markdown tests' },
	{ name: 'terminal-suggest', label: 'Terminal Suggest tests' },
	{ name: 'github-authentication', label: 'GitHub Authentication tests' },
	{ name: 'configuration-editing', label: 'Configuration editing tests' },
	{ name: 'notebook-renderers', label: 'Notebook Output tests' },
	{ name: 'ipynb', label: 'Ipynb tests' },
	{ name: 'typescript', label: 'TypeScript tests' },
	{ name: 'copilot', label: 'Copilot tests' },
	{ name: 'api-workspace', label: 'API tests (workspace)' },
	{ name: 'git-base', label: 'Git Base tests' },
	{ name: 'html', label: 'HTML tests' },
	{ name: 'json', label: 'JSON tests' },
	{ name: 'css', label: 'CSS tests' },
];

type AgentHostMode = 'before' | 'concurrent';

interface IOptions {
	/** 0 runs the integration tests in one process, one suite after another. */
	readonly jobs: number;
	readonly agentHost: AgentHostMode | undefined;
	readonly suiteFilter: string | undefined;
	/** --run or --runGlob select node.js integration test files, so no extension host suites run. */
	readonly fileFilter: boolean;
	readonly tfs: string | undefined;
	readonly forwardedArgs: readonly string[];
}

interface ITask {
	readonly id: string;
	readonly label: string;
	readonly script: string;
	readonly args: readonly string[];
	/** Runs other tasks at the same time, so on Linux it gets its own X display. */
	readonly parallel?: boolean;
	/** The test files of a share of the node.js integration tests, to rerun a failed share with --run. */
	readonly files?: readonly string[];
}

interface IResult {
	readonly task: ITask;
	readonly succeeded: boolean;
	readonly durationSeconds: number;
	readonly exit: string;
	readonly output: string;
}

interface ILaneResult {
	readonly results: readonly IResult[];
	readonly durationSeconds: number;
}

interface IResourceSummary {
	readonly cpus: number;
	readonly averageBusyPercent: number;
	readonly peakBusyPercent: number;
	readonly totalMemoryGB: number;
	readonly lowestFreeMemoryGB: number;
}

const running = new Map<ITask, { readonly startedAt: bigint; readonly output: () => string }>();
let temporaryRoot: string | undefined;
let nextTaskIndex = 0;

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	validateSuites();
	prepareTestRuntime();
	printRunningOutputOnTermination();

	const startedAt = process.hrtime.bigint();
	mkdirSync(outputRoot, { recursive: true });
	temporaryRoot = mkdtempSync(join(os.tmpdir(), 'vsci-'));
	const integrationTasks = createIntegrationTasks(options);
	const agentHostTask: ITask | undefined = options.agentHost && {
		id: 'agent-host-e2e',
		label: 'Agent Host E2E',
		script: agentHostScript,
		args: options.tfs ? ['--tfs', options.tfs] : [],
	};
	const workers = Math.max(1, options.jobs);
	// A task prints its output as it runs when nothing runs at the same time.
	const integrationLive = integrationTasks.length === 1 && options.agentHost !== 'concurrent';
	console.log(describePlan(options, integrationTasks, workers));

	const resources = startResourceMonitor();
	const heartbeat = setInterval(printHeartbeat, 60_000);
	heartbeat.unref();
	let agentHost: IResult | undefined;
	let integration: ILaneResult;
	try {
		if (agentHostTask && options.agentHost === 'before') {
			agentHost = await runTask(agentHostTask, true);
			integration = await runLane(integrationTasks, workers, integrationLive);
		} else if (agentHostTask) {
			[agentHost, integration] = await Promise.all([
				runTask(agentHostTask, false),
				runLane(integrationTasks, workers, integrationLive),
			]);
		} else {
			integration = await runLane(integrationTasks, workers, integrationLive);
		}
	} finally {
		clearInterval(heartbeat);
		killApp();
		rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5 });
	}

	const resourceSummary = resources.stop();
	const failures = [...(agentHost ? [agentHost] : []), ...integration.results].filter(result => !result.succeeded);
	printSummary(options, workers, agentHost, integration, resourceSummary, elapsedSeconds(startedAt));
	if (failures.length > 0) {
		printFailures(failures);
		process.exitCode = 1;
	}
}

function parseArguments(args: readonly string[]): IOptions {
	let jobs: string | undefined;
	let agentHost: string | undefined;
	let suiteFilter: string | undefined;
	let tfs: string | undefined;
	let fileFilter = false;
	const forwardedArgs: string[] = [];

	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		const valueOf = (name: string): string => {
			const value = argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : args[++index];
			if (value === undefined) {
				throw new Error(`${name} requires a value`);
			}
			return value;
		};
		if (argument === '--help' || argument === '-h') {
			printHelp();
			process.exit(0);
		} else if (argument === '--jobs' || argument.startsWith('--jobs=')) {
			jobs = valueOf('--jobs');
		} else if (argument === '--agent-host-e2e' || argument.startsWith('--agent-host-e2e=')) {
			agentHost = valueOf('--agent-host-e2e');
		} else if (argument === '--suite') {
			suiteFilter = valueOf('--suite');
		} else if (argument === '--tfs') {
			tfs = valueOf('--tfs');
		} else if (['--run', '--runGlob', '--glob', '--runGrep'].includes(argument)) {
			fileFilter = true;
			forwardedArgs.push(argument, valueOf(argument));
		} else {
			forwardedArgs.push(argument);
		}
	}

	const jobCount = jobs === undefined ? 0 : Number(jobs);
	if (!Number.isInteger(jobCount) || jobCount < 0) {
		throw new Error(`Invalid --jobs value: ${jobs}`);
	}
	if (agentHost !== undefined && agentHost !== 'before' && agentHost !== 'concurrent') {
		throw new Error(`Invalid --agent-host-e2e value: ${agentHost} (expected 'before' or 'concurrent')`);
	}
	if (suiteFilter !== undefined && !suites.some(suite => matchesSuiteFilter(suite.name, suiteFilter))) {
		throw new Error(`No suites match filter '${suiteFilter}'. Available suites: ${suites.map(suite => suite.name).join(' ')}`);
	}
	return { jobs: jobCount, agentHost, suiteFilter, fileFilter, tfs, forwardedArgs };
}

function printHelp(): void {
	console.log(`Usage: node test/integration/electron/parallel.ts [options]

Runs the integration tests of scripts/test-integration.sh N at a time. Each extension host
suite and each share of the node.js integration tests runs in its own process, with its own
user data, extensions and logs directories. Each process's output is printed when it finishes
and is also written to .build/logs/integration-tests/output.

Options:
  --jobs <n>                          number of processes to run at a time; 0 runs the
                                      integration tests in one process, one suite after another
  --agent-host-e2e <before|concurrent> also run scripts/test-agent-host-e2e, before the
                                      integration tests or at the same time
  --suite <pattern>                   run only matching extension host suites (see scripts/test-integration.sh)
  --run, --runGlob <pattern>          run only these node.js integration tests, in one process
  --tfs <title>                       test results title; each process adds its own suffix
  --help, -h                          show this help

All other options are forwarded to scripts/test-integration.sh.`);
}

/** Fails when scripts/test-integration.sh gains a suite that this runner would not run. */
function validateSuites(): void {
	const script = readFileSync(join(repoRoot, 'scripts', 'test-integration.sh'), 'utf8');
	const known = script.match(/^KNOWN_SUITES="(?<suites>[^"]+)"$/m)?.groups?.suites.split(' ').sort();
	const scheduled = suites.map(suite => suite.name).sort();
	if (!known || known.join(' ') !== scheduled.join(' ')) {
		throw new Error(`test/integration/electron/parallel.ts runs the suites ${scheduled.join(' ')}, but scripts/test-integration.sh has ${known?.join(' ')}`);
	}
}

/** Prepares Electron and the built-in extensions once, so that the processes don't do it at the same time. */
function prepareTestRuntime(): void {
	if (process.env['VSCODE_SKIP_PRELAUNCH']) {
		return;
	}
	const result = spawnSync(process.execPath, [join(repoRoot, 'build', 'lib', 'preLaunch.ts')], { cwd: repoRoot, stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`build/lib/preLaunch.ts exited with ${describeExit(result.status, result.signal)}`);
	}
}

function createIntegrationTasks(options: IOptions): ITask[] {
	const tfsArgs = (suffix?: string) => options.tfs ? ['--tfs', suffix ? `${options.tfs} ${suffix}` : options.tfs] : [];
	if (options.jobs === 0 || (options.fileFilter && !options.suiteFilter)) {
		return [{
			id: 'integration',
			label: 'Integration tests',
			script: integrationScript,
			args: [...options.forwardedArgs, ...tfsArgs(), ...(options.suiteFilter ? ['--suite', options.suiteFilter] : [])],
		}];
	}

	const tasks: ITask[] = [];
	if (!options.suiteFilter) {
		const files = findNodeIntegrationTestFiles();
		const shares = Math.min(options.jobs, maxNodeShares, files.length);
		for (let share = 1; share <= shares; share++) {
			// Every share gets every n-th file, which spreads the long Agent Host files, and runs them in the serial order.
			const shareFiles = files.filter((_, index) => index % shares === share - 1);
			tasks.push({
				id: `node-${share}-of-${shares}`,
				label: shares === 1 ? 'node.js integration tests' : `node.js integration tests ${share}/${shares}`,
				script: integrationScript,
				args: [...options.forwardedArgs, ...tfsArgs(shares === 1 ? undefined : `node.js ${share} of ${shares}`), ...shareFiles.flatMap(file => ['--run', file])],
				parallel: true,
				files: shareFiles,
			});
		}
	}
	for (const suite of suites) {
		if (matchesSuiteFilter(suite.name, options.suiteFilter)) {
			tasks.push({
				id: suite.name,
				label: suite.label,
				script: integrationScript,
				args: [...options.forwardedArgs, '--suite', suite.name],
				parallel: true,
			});
		}
	}
	return tasks;
}

/** The node.js integration tests that scripts/test-integration.sh runs, as src/ paths in the order it loads them. */
function findNodeIntegrationTestFiles(): string[] {
	return readdirSync(join(repoRoot, 'src'), { recursive: true, encoding: 'utf8' })
		.map(file => `src/${file.split(path.sep).join('/')}`)
		.filter(file => file.endsWith('.integrationTest.ts') && !agentHostE2EFile.test(file))
		.sort();
}

/** Matches the comma-separated `--suite` patterns of scripts/test-integration.sh, where `*` and `?` are wildcards. */
function matchesSuiteFilter(name: string, filter: string | undefined): boolean {
	if (filter === undefined) {
		return true;
	}
	return filter.split(',').map(pattern => pattern.trim()).some(pattern => {
		const expression = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
		return new RegExp(`^${expression}$`).test(name);
	});
}

function describePlan(options: IOptions, tasks: readonly ITask[], workers: number): string {
	const integration = tasks.length === 1
		? 'the integration tests in one process'
		: `${tasks.length} integration test processes, ${workers} at a time`;
	const agentHost = options.agentHost === 'before' ? 'Agent Host E2E, then '
		: options.agentHost === 'concurrent' ? 'Agent Host E2E at the same time as ' : '';
	return `Running ${agentHost}${integration} on ${os.cpus().length} CPUs.`;
}

async function runLane(tasks: readonly ITask[], workers: number, live: boolean): Promise<ILaneResult> {
	const startedAt = process.hrtime.bigint();
	const results: IResult[] = [];
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, async () => {
		while (next < tasks.length) {
			const index = next++;
			results[index] = await runTask(tasks[index], live);
		}
	}));
	return { results, durationSeconds: elapsedSeconds(startedAt) };
}

function runTask(task: ITask, live: boolean): Promise<IResult> {
	const index = nextTaskIndex++;
	const environment = createTaskEnvironment(task, index);
	const outputFile = createWriteStream(join(outputRoot, `${task.id}.log`));
	const startedAt = process.hrtime.bigint();
	let output = '';
	running.set(task, { startedAt, output: () => output });
	console.log(live ? `\n### ${task.label}\n` : `Started ${task.label}`);

	return new Promise(resolveResult => {
		const [command, args]: [string, readonly string[]] = isWindows
			? [join(process.env['SYSTEMROOT'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
				'-NoLogo',
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy', 'Bypass',
				'-File', windowsWrapper,
				task.script,
				...task.args,
			]]
			: task.parallel && hasXvfbRun()
				// Windows on one X display cover each other, and Chromium hides covered pages, which stalls tests
				// that render (such as the browser tool API tests). Uses the screen of build/azure-pipelines/linux/xvfb.init.
				? ['xvfb-run', ['-n', String(100 + index), '-s', '-ac -screen 0 1024x768x24', task.script, ...task.args]]
				: [task.script, task.args];
		const child = spawn(command, args, { cwd: repoRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
		const onOutput = (chunk: string) => {
			output += chunk;
			outputFile.write(chunk);
			if (live) {
				process.stdout.write(chunk);
			}
		};
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', onOutput);
		child.stderr.on('data', onOutput);

		let settled = false;
		const finish = (succeeded: boolean, exit: string) => {
			if (settled) {
				return;
			}
			settled = true;
			running.delete(task);
			outputFile.end();
			const result: IResult = { task, succeeded, durationSeconds: elapsedSeconds(startedAt), exit, output };
			if (!live) {
				printTaskOutput(result);
			}
			console.log(`${succeeded ? 'Passed' : 'FAILED'} ${task.label} in ${result.durationSeconds.toFixed(1)}s${succeeded ? '' : ` (${exit})`}`);
			resolveResult(result);
		};
		child.on('error', error => finish(false, error.message));
		child.on('close', (code, signal) => finish(code === 0, describeExit(code, signal)));
	});
}

function createTaskEnvironment(task: ITask, index: number): NodeJS.ProcessEnv {
	// Short paths: macOS limits the length of the IPC socket path that VS Code creates in the user data directory.
	const directory = join(temporaryRoot!, `t${index}`);
	const environment: NodeJS.ProcessEnv = {
		...process.env,
		VSCODE_SKIP_PRELAUNCH: '1',
		VSCODE_INTEGRATION_USER_DATA_DIR: join(directory, 'u'),
		VSCODE_INTEGRATION_EXTENSIONS_DIR: join(directory, 'e'),
		VSCODE_INTEGRATION_LOGS_DIR: join(logsRoot, task.id),
	};
	delete environment.ELECTRON_RUN_AS_NODE;
	// scripts/test-integration.sh kills the app by name after each suite, which would also stop the other suites. killApp() runs at the end instead.
	delete environment.INTEGRATION_TEST_APP_NAME;
	// Some node.js integration tests start agent host servers without --user-data-dir, which then use the default
	// user data directory (and its databases), as do the servers of the other processes. Move the default per process.
	if (task.script === integrationScript) {
		const configHome = join(directory, 'c');
		mkdirSync(configHome, { recursive: true });
		if (process.platform === 'linux') {
			environment.XDG_CONFIG_HOME = configHome;
		} else if (isWindows) {
			environment.APPDATA = configHome;
		}
	}
	return environment;
}

function killApp(): void {
	const name = process.env['INTEGRATION_TEST_APP_NAME'];
	if (name && !isWindows) {
		spawnSync('killall', [name], { stdio: 'ignore' });
	}
}

let xvfbRun: boolean | undefined;
function hasXvfbRun(): boolean {
	if (xvfbRun === undefined) {
		xvfbRun = process.platform === 'linux' && spawnSync('which', ['xvfb-run'], { stdio: 'ignore' }).status === 0;
		if (process.platform === 'linux' && !xvfbRun) {
			console.warn('xvfb-run is not installed, so the suites share one display and their windows can cover each other.');
		}
	}
	return xvfbRun;
}

function printTaskOutput(result: IResult): void {
	const title = `${result.succeeded ? 'Passed' : 'FAILED'}: ${result.task.label} (${result.durationSeconds.toFixed(1)}s)`;
	// Collapse passing output in GitHub Actions; failing output stays visible.
	const grouped = inGitHubActions && result.succeeded;
	console.log(grouped ? `::group::${title}` : `\n===== ${title} =====`);
	process.stdout.write(result.output);
	if (!result.output.endsWith('\n')) {
		process.stdout.write('\n');
	}
	console.log(grouped ? '::endgroup::' : `===== End of ${result.task.label} =====\n`);
}

function printHeartbeat(): void {
	if (running.size === 0) {
		return;
	}
	const tasks = [...running].map(([task, { startedAt }]) => `${task.label} (${elapsedSeconds(startedAt).toFixed(0)}s)`);
	console.log(`Still running: ${tasks.join(', ')}`);
}

/** A step timeout or cancellation would otherwise lose the output of the processes that are still running. */
function printRunningOutputOnTermination(): void {
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.once(signal, () => {
			console.log(`\nReceived ${signal}. Output of the processes that are still running:`);
			for (const [task, { startedAt, output }] of running) {
				printTaskOutput({ task, succeeded: false, durationSeconds: elapsedSeconds(startedAt), exit: signal, output: output() });
			}
			process.exit(signal === 'SIGINT' ? 130 : 143);
		});
	}
}

function startResourceMonitor(): { stop(): IResourceSummary } {
	const cpus = os.cpus().length;
	const totalMemoryGB = os.totalmem() / 1024 ** 3;
	const startedAt = process.hrtime.bigint();
	const samples = createWriteStream(join(outputRoot, 'resources.csv'));
	samples.write('seconds,cpuBusyPercent,freeMemoryGB,runningProcesses\n');
	let previous = cpuTimes();
	let busySum = 0;
	let sampleCount = 0;
	let peakBusyPercent = 0;
	let lowestFreeMemoryGB = os.freemem() / 1024 ** 3;
	const sample = () => {
		const current = cpuTimes();
		const total = current.total - previous.total;
		const busyPercent = total > 0 ? 100 * (1 - (current.idle - previous.idle) / total) : 0;
		previous = current;
		const freeMemoryGB = os.freemem() / 1024 ** 3;
		busySum += busyPercent;
		sampleCount++;
		peakBusyPercent = Math.max(peakBusyPercent, busyPercent);
		lowestFreeMemoryGB = Math.min(lowestFreeMemoryGB, freeMemoryGB);
		samples.write(`${elapsedSeconds(startedAt).toFixed(0)},${busyPercent.toFixed(0)},${freeMemoryGB.toFixed(1)},${running.size}\n`);
	};
	const timer = setInterval(sample, 5_000);
	timer.unref();
	return {
		stop: () => {
			clearInterval(timer);
			sample();
			samples.end();
			return { cpus, averageBusyPercent: busySum / sampleCount, peakBusyPercent, totalMemoryGB, lowestFreeMemoryGB };
		}
	};
}

function cpuTimes(): { idle: number; total: number } {
	let idle = 0;
	let total = 0;
	for (const cpu of os.cpus()) {
		idle += cpu.times.idle;
		total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
	}
	return { idle, total };
}

function printSummary(options: IOptions, workers: number, agentHost: IResult | undefined, integration: ILaneResult, resources: IResourceSummary, totalSeconds: number): void {
	const status = (result: IResult) => result.succeeded ? 'PASS' : 'FAIL';
	console.log(`\nIntegration tests: ${integration.results.length} ${integration.results.length === 1 ? 'process' : `processes, ${workers} at a time,`} in ${integration.durationSeconds.toFixed(1)}s.`);
	for (const result of integration.results) {
		console.log(`  ${status(result)} ${result.task.label}: ${result.durationSeconds.toFixed(1)}s`);
	}
	if (agentHost) {
		console.log(`Agent Host E2E (${options.agentHost}): ${status(agentHost)} in ${agentHost.durationSeconds.toFixed(1)}s.`);
	}
	console.log(`Total: ${totalSeconds.toFixed(1)}s. CPU (${resources.cpus}): ${resources.averageBusyPercent.toFixed(0)}% busy on average, ${resources.peakBusyPercent.toFixed(0)}% at peak. Memory: at least ${resources.lowestFreeMemoryGB.toFixed(1)} of ${resources.totalMemoryGB.toFixed(1)} GB free.`);
	// One line to compare runs with.
	console.log(`[integration-benchmark] ${JSON.stringify({
		agentHost: options.agentHost ?? 'none',
		jobs: options.jobs,
		cpus: resources.cpus,
		totalSeconds: round(totalSeconds),
		agentHostSeconds: agentHost && round(agentHost.durationSeconds),
		integrationSeconds: round(integration.durationSeconds),
		cpuAveragePercent: round(resources.averageBusyPercent),
		cpuPeakPercent: round(resources.peakBusyPercent),
		lowestFreeMemoryGB: round(resources.lowestFreeMemoryGB),
		failed: [...(agentHost ? [agentHost] : []), ...integration.results].filter(result => !result.succeeded).map(result => result.task.id),
	})}`);
}

function printFailures(failures: readonly IResult[]): void {
	console.log('\nFailures:');
	for (const failure of failures) {
		const message = `${failure.task.label} failed with ${failure.exit}`;
		console.log(`\n===== ${message} =====`);
		const details = extractFailureDetails(failure.output);
		if (details) {
			process.stdout.write(details);
		}
		if (failure.task.files) {
			console.log(`It ran these files, in this order; rerun them with ${failure.task.files.map(file => `--run ${file}`).join(' ')}`);
		}
		// scripts/test-integration.sh reports failed suites itself.
		if (inGitHubActions && !failure.output.includes('::error ')) {
			console.log(`::error title=Integration tests failed::${message}`);
		}
	}
}

function extractFailureDetails(output: string): string | undefined {
	const lines = output.split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index--) {
		const line = lines[index].replace(/\x1b\[[0-9;]*m/g, '').trim();
		if (/^\d+ failing$/.test(line) || /^ℹ fail [1-9]\d*$/.test(line)) {
			return `${lines.slice(index).join('\n').trimEnd()}\n`;
		}
	}
	// The output was printed above; repeat only its end.
	const tail = lines.slice(-40).join('\n').trim();
	return tail.length > 0 ? `${tail}\n` : undefined;
}

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
	return signal ? `signal ${signal}` : `exit code ${code}`;
}

function elapsedSeconds(startedAt: bigint): number {
	return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
