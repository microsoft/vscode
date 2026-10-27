/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Runs the unit tests in several worker processes at once (`--workers <count>`).
 *
 * Every worker loads all test files, but a test file only runs in the worker that claims it
 * first. Claims are atomic directory creations in a directory shared by all workers, so every
 * file runs exactly once. The browser runner's page claims files through the test server of its
 * worker process. Workers claim files lazily whenever they run out of suites to run, so
 * faster workers pick up more files and all workers finish at about the same time. Files are
 * claimed in load order, so every worker runs its files in the same relative order as a single
 * process would. This way, tests that leak global state cannot affect tests that ran before
 * them in a single process.
 *
 * Only the first attempt runs in workers. Every worker reports its failures to the process that
 * started it, which reruns them in a single process or browser (see `--rerun-failed-files`).
 */

const cp: typeof import('child_process') = require('child_process');
const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const path: typeof import('path') = require('path');

type Suite = import('mocha').Suite;
type Test = import('mocha').Test;

interface ITestFile {
	readonly suites: Suite[];
	readonly tests: Test[];
}

/**
 * How a worker claims test files. All workers of a run share the claims, so every test file
 * runs in the worker that claims it first. Repeating a call returns the same result, so that
 * the browser runner's page can repeat a request whose response it did not receive.
 */
interface ITestFileClaims {
	/** Records how many test files the worker loaded, to verify that every one ran */
	start(fileCount: number): void;
	/** Claims a test file, returns false if another worker already did */
	claim(file: string): boolean;
	/** Claims the run of all test files when tests are exclusive (`.only`), returns false if another worker already did */
	claimAll(): boolean;
	/** Records that the worker runs the test files after those it ran before, to reproduce failures */
	recordRun(files: string[]): void;
}

/**
 * A failed test or hook of a test file, as the runners record it. Runners may record more,
 * such as the title path, which reaches the process that started the workers as is.
 */
interface IFailure {
	readonly title: string;
	readonly file: string;
	readonly type: string;
	readonly parentTitle?: string;
}

/**
 * The failures of a worker, or of all workers together.
 */
interface IWorkerReport {
	/** failed tests and hooks that belong to a test file */
	readonly failures: IFailure[];
	/** failures that do not belong to a test file, which are not rerun */
	readonly unattributedFailures: string[];
}

/**
 * @param value the value of the `--workers` argument, or `undefined` if it is missing
 * @returns the number of workers to start: the given count, at most one per CPU and per 2 GB of
 * memory, or 1 without `--workers`
 */
function getWorkerCount(value: string | undefined): number {
	if (value === undefined) {
		return 1;
	}
	const count = value.trim() === '' ? NaN : Number(value);
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`--workers requires the number of worker processes, a positive integer, but got '${value}'.`);
	}
	// Every worker loads all test files, which takes up to about 2 GB of memory
	const cpuLimit = os.availableParallelism();
	const memoryLimit = Math.floor(os.totalmem() / (2 * 1024 ** 3));
	const capped = Math.max(1, Math.min(count, cpuLimit, memoryLimit));
	if (capped < count) {
		console.log(`Using ${capped} instead of ${count} worker processes: ${cpuLimit} CPUs and ${Math.round(os.totalmem() / 1024 ** 3)} GB of memory available`);
	}
	return capped;
}

/**
 * @returns the arguments without `--name`, `--name=value` and `--name value`
 */
function removeArgument(argv: string[], name: string): string[] {
	const result: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === `--${name}`) {
			if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
				i++;
			}
		} else if (!argv[i].startsWith(`--${name}=`)) {
			result.push(argv[i]);
		}
	}
	return result;
}

function getReportPath(workerDir: string, workerId: string | number): string {
	return path.join(workerDir, `worker-${workerId}.report.json`);
}

/**
 * Reports the failures of this worker to the process that started it. Call this once the
 * tests ran, before exiting.
 */
function writeWorkerReport({ workerId, workerDir }: { workerId: string; workerDir: string }, report: IWorkerReport): void {
	fs.writeFileSync(getReportPath(workerDir, workerId), JSON.stringify({ failures: report.failures, unattributedFailures: report.unattributedFailures }));
}

/**
 * Runs `command args --worker=<id> --workerDir=<dir>` in `count` processes at once, prints the
 * output of each worker when it finishes, and collects the failures that they report. A
 * worker that does not complete normally, and test files that no worker ran, are failures
 * that do not belong to a test file, so they fail the run without a rerun.
 */
async function runInWorkers({ name, count, command, args }: { name: string; count: number; command: string; args: string[] }): Promise<IWorkerReport> {
	const workerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-unit-workers-'));
	fs.mkdirSync(path.join(workerDir, 'claims'));
	await write(`${name}: running in ${count} parallel worker processes (${os.availableParallelism()} CPUs available)\n`);

	const start = Date.now();
	const running = new Map<number, { child: import('child_process').ChildProcess; output: Buffer[] }>();

	// Print what we have if we are interrupted, e.g. by a CI step timeout
	const onSignal = () => {
		for (const [id, { child, output }] of running) {
			try {
				fs.writeSync(1, `\n=== ${name}: worker ${id} of ${count} was interrupted, output so far: ===\n`);
				fs.writeSync(1, Buffer.concat(output));
			} catch {
				// best effort
			}
			child.kill();
		}
		process.exit(1);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);

	const failures: IFailure[] = [];
	const unattributedFailures: string[] = [];

	const runWorker = (id: number) => new Promise<void>(resolve => {
		const output: Buffer[] = [];
		const child = cp.spawn(command, [...args, `--worker=${id}`, `--workerDir=${workerDir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
		running.set(id, { child, output });
		child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => output.push(chunk));
		child.on('error', error => output.push(Buffer.from(`${error}\n`)));
		child.on('close', async (code, signal) => {
			running.delete(id);
			// test.bat treats 255 as success too, see https://github.com/microsoft/vscode/issues/28582
			const exitedNormally = code === 0 || (process.platform === 'win32' && code === 255);
			const report = readWorkerReport(workerDir, id);
			const failureCount = report ? report.failures.length + report.unattributedFailures.length : 0;
			// A worker exits with 1 for failed tests, so a crash after reporting them is not mistaken for them
			const exitedConsistently = signal === null && (failureCount === 0 ? exitedNormally : code === 1);
			if (!report) {
				unattributedFailures.push(`${name}: worker ${id} did not complete normally or report its results (exit code ${signal ?? code})`);
			} else if (!exitedConsistently) {
				unattributedFailures.push(`${name}: worker ${id} exited with code ${signal ?? code}, inconsistent with its ${failureCount} reported failure(s)`);
			}
			if (report) {
				failures.push(...report.failures);
				unattributedFailures.push(...report.unattributedFailures);
			}

			const passed = report !== undefined && exitedConsistently && failureCount === 0;
			const filesRun = path.join(workerDir, `worker-${id}.files`);
			await write(Buffer.concat([
				Buffer.from(`\n=== ${name}: worker ${id} of ${count} ${passed ? 'passed' : 'FAILED'} (exit code ${signal ?? code}) after ${formatDuration(Date.now() - start)} ===\n`),
				...output,
				Buffer.from(!passed && fs.existsSync(filesRun) ? `\n=== ${name}: worker ${id} ran these test files in this order, pass them to --run to reproduce: ===\n${fs.readFileSync(filesRun, 'utf8')}` : ''),
			]));
			resolve();
		});
	});

	await Promise.all(Array.from({ length: count }, (_, i) => runWorker(i + 1)));
	process.off('SIGINT', onSignal);
	process.off('SIGTERM', onSignal);

	const notRun = verifyAllFilesRan(workerDir, count);
	if (notRun) {
		unattributedFailures.push(`${name}: ${notRun}`);
	}
	fs.rmSync(workerDir, { recursive: true, force: true });

	const failureCount = failures.length + unattributedFailures.length;
	await write(`\n=== ${name}: ${failureCount ? `${failureCount} failure(s)` : `all ${count} workers passed`} after ${formatDuration(Date.now() - start)} ===\n`);
	return { failures, unattributedFailures };
}

/**
 * @returns the failures that the worker reported, or `undefined` if it did not report any
 */
function readWorkerReport(workerDir: string, id: number): IWorkerReport | undefined {
	try {
		const report = JSON.parse(fs.readFileSync(getReportPath(workerDir, id), 'utf8'));
		return Array.isArray(report.failures) && Array.isArray(report.unattributedFailures) ? report : undefined;
	} catch {
		return undefined;
	}
}

/**
 * @returns an error message if not every test file was claimed by a worker
 */
function verifyAllFilesRan(workerDir: string, count: number): string | undefined {
	const claimed = fs.readdirSync(path.join(workerDir, 'claims')).length;
	for (let id = 1; id <= count; id++) {
		const file = path.join(workerDir, `worker-${id}.json`);
		if (!fs.existsSync(file)) {
			return `worker ${id} did not report its test files`;
		}
		const { files } = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (files !== claimed) {
			return `only ${claimed} of the ${files} test files ran`;
		}
	}
	return undefined;
}

/*
 * trackTestFiles and distributeClaimedTestFiles must not use anything outside of themselves: the
 * browser runner runs their source in the page that runs the tests (see browser/index.js).
 */

/**
 * Records the root-level suites and tests that each test file registers while it is loaded.
 * Call this before loading the test files.
 */
function trackTestFiles(root: Suite): Map<string, ITestFile> {
	const files = new Map<string, ITestFile>();
	let suiteCount = 0;
	let testCount = 0;
	root.on('pre-require', () => {
		suiteCount = root.suites.length;
		testCount = root.tests.length;
	});
	root.on('post-require', (_context: unknown, file: string | null) => {
		if (file) {
			files.set(file, { suites: root.suites.slice(suiteCount), tests: root.tests.slice(testCount) });
		}
	});
	return files;
}

/**
 * Makes this worker run only the test files that it claims. Call this after loading the test
 * files and before running them. Suites that do not belong to a test file (e.g. checks of the
 * test runner itself) run in every worker. With `.only`, one worker runs all test files.
 * @param files from {@link trackTestFiles}
 */
function distributeClaimedTestFiles(root: Suite, files: Map<string, ITestFile>, claims: ITestFileClaims): void {
	claims.start(files.size);

	const suitesOf = (file: string) => files.get(file)?.suites ?? [];
	const queue = [...files.keys()];

	// With `.only`, mocha runs only the exclusive tests and suites, which can be nested anywhere in
	// any file, so a worker that does not load their file would run its other tests instead. So one
	// worker runs all test files, as a single process would, and the other workers run nothing.
	if ((root as Suite & { hasOnly(): boolean }).hasOnly()) { // missing in the typings
		if (claims.claimAll()) {
			for (const file of queue) {
				claims.claim(file);
			}
			claims.recordRun(queue);
		} else {
			root.suites = [];
			root.tests = [];
			// mocha's own lists of `.only` tests and suites, which it runs instead of the root's tests and suites
			Object.assign(root, { _onlyTests: [], _onlySuites: [] });
		}
		return;
	}

	const fileOf = new Map<Suite | Test, string>();
	for (const [file, { suites, tests }] of files) {
		for (const runnable of [...suites, ...tests]) {
			fileOf.set(runnable, file);
		}
	}
	const firstFileSuite = root.suites.findIndex(suite => fileOf.has(suite));
	const otherSuitesBefore = root.suites.filter((suite, i) => !fileOf.has(suite) && (firstFileSuite === -1 || i < firstFileSuite));
	const otherSuitesAfter = root.suites.filter((suite, i) => !fileOf.has(suite) && firstFileSuite !== -1 && i > firstFileSuite);

	// Root-level tests run before any suite, so their files are claimed upfront
	const owned = new Set(queue.filter(file => files.get(file)?.tests.length && claims.claim(file)));
	root.tests = root.tests.filter(test => !fileOf.has(test) || owned.has(fileOf.get(test)!));

	const suites = [...otherSuitesBefore];
	let next = 0;

	/** Adds the suites of the next file that this worker runs, returns false if there is none */
	const claimNext = () => {
		while (next < queue.length) {
			const file = queue[next++];
			if (owned.has(file) || claims.claim(file)) {
				// Record the order in which this worker runs the files, to reproduce failures
				claims.recordRun([file]);
				suites.push(...suitesOf(file));
				if (suitesOf(file).length) {
					return true;
				}
			}
		}
		return false;
	};

	let done = false;
	/** Adds the suites that do not belong to a test file and run after them, e.g. checks of the runner itself */
	const finish = () => {
		done = true;
		suites.push(...otherSuitesAfter);
	};

	// The runner skips the root suite if it has no tests when it starts, so claim until it has
	let hasMore = true;
	while (hasMore && !root.tests.length && suites.every(suite => suite.total() === 0)) {
		hasMore = claimNext();
	}
	if (!hasMore) {
		// Other workers claimed every file, but this worker still runs the checks, e.g. of errors while loading
		finish();
	}

	root.suites = new Proxy(suites, {
		get(target, property, receiver) {
			// The runner reads `suites[i++]` until it gets `undefined`, so claim more files first
			if (property === String(target.length) && !done && !claimNext()) {
				finish();
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

/**
 * Claims test files with atomic directory creations in the directory that all workers share.
 */
function createTestFileClaims({ workerId, workerDir }: { workerId: string; workerDir: string }): ITestFileClaims {
	/** Creates the directory, returns false if another worker already did */
	const claimDirectory = (directory: string) => {
		try {
			fs.mkdirSync(directory);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				return false;
			}
			throw error;
		}
	};
	const claimed = new Set<string>();
	const recorded = new Set<string>();
	let claimedAll: boolean | undefined;
	return {
		start: fileCount => fs.writeFileSync(path.join(workerDir, `worker-${workerId}.json`), JSON.stringify({ files: fileCount })),
		claim: file => {
			if (!claimed.has(file) && claimDirectory(path.join(workerDir, 'claims', encodeURIComponent(file)))) {
				claimed.add(file);
			}
			return claimed.has(file);
		},
		claimAll: () => claimedAll ??= claimDirectory(path.join(workerDir, 'only')),
		recordRun: files => {
			const unrecorded = files.filter(file => !recorded.has(file));
			unrecorded.forEach(file => recorded.add(file));
			fs.appendFileSync(path.join(workerDir, `worker-${workerId}.files`), unrecorded.map(file => `src/${file}.ts\n`).join(''));
		},
	};
}

/**
 * {@link distributeClaimedTestFiles} with the claims in the directory that all workers share.
 */
function distributeTestFiles(root: Suite, files: Map<string, ITestFile>, worker: { workerId: string; workerDir: string }): void {
	distributeClaimedTestFiles(root, files, createTestFileClaims(worker));
}

/**
 * @returns a promise that resolves once the data is flushed, so exiting does not truncate it
 */
function write(data: string | Buffer): Promise<void> {
	return new Promise(resolve => process.stdout.write(data, () => resolve()));
}

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

module.exports = { getWorkerCount, removeArgument, runInWorkers, writeWorkerReport, trackTestFiles, distributeTestFiles, createTestFileClaims, distributeClaimedTestFiles };
