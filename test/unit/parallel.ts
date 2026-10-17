/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Runs the unit tests in several worker processes at once (`--workers`).
 *
 * Every worker loads all test files, but a test file only runs in the worker that claims it
 * first. Claims are atomic directory creations in a directory shared by all workers, so every
 * file runs exactly once. Workers claim files lazily whenever they run out of suites to run, so
 * faster workers pick up more files and all workers finish at about the same time. Files are
 * claimed in load order, so every worker runs its files in the same relative order as a single
 * process would. This way, tests that leak global state cannot affect tests that ran before
 * them in a single process.
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
 * @param value the value of the `--workers` argument: `undefined` if it is missing, `''` or
 * `'auto'` for one worker per CPU, or a number
 */
function getWorkerCount(value: string | undefined): number {
	if (value === undefined) {
		return 1;
	}
	if (value === '' || value === 'auto') {
		// Every worker loads all test files, which takes up to about 2 GB of memory
		return Math.max(1, Math.min(os.availableParallelism(), Math.floor(os.totalmem() / (2 * 1024 ** 3))));
	}
	const count = Number(value);
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`Invalid --workers value '${value}', expected a positive integer or 'auto'.`);
	}
	return count;
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

/**
 * Runs `command args --worker=<id> --workerDir=<dir>` in `count` processes at once and prints
 * the output of each worker when it finishes.
 * @returns the exit code
 */
async function runInWorkers({ name, count, command, args }: { name: string; count: number; command: string; args: string[] }): Promise<number> {
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

	const runWorker = (id: number) => new Promise<boolean>(resolve => {
		const output: Buffer[] = [];
		const child = cp.spawn(command, [...args, `--worker=${id}`, `--workerDir=${workerDir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
		running.set(id, { child, output });
		child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => output.push(chunk));
		child.on('error', error => output.push(Buffer.from(`${error}\n`)));
		child.on('close', async (code, signal) => {
			running.delete(id);
			// test.bat treats 255 as success too, see https://github.com/microsoft/vscode/issues/28582
			const succeeded = code === 0 || (process.platform === 'win32' && code === 255);
			const filesRun = path.join(workerDir, `worker-${id}.files`);
			await write(Buffer.concat([
				Buffer.from(`\n=== ${name}: worker ${id} of ${count} ${succeeded ? 'passed' : 'FAILED'} (exit code ${signal ?? code}) after ${formatDuration(Date.now() - start)} ===\n`),
				...output,
				Buffer.from(!succeeded && fs.existsSync(filesRun) ? `\n=== ${name}: worker ${id} ran these test files in this order, pass them to --run to reproduce: ===\n${fs.readFileSync(filesRun, 'utf8')}` : ''),
			]));
			resolve(succeeded);
		});
	});

	const results = await Promise.all(Array.from({ length: count }, (_, i) => runWorker(i + 1)));
	process.off('SIGINT', onSignal);
	process.off('SIGTERM', onSignal);

	const failed = results.flatMap((succeeded, i) => succeeded ? [] : [i + 1]);
	const error = failed.length
		? `FAILED in worker${failed.length > 1 ? 's' : ''} ${failed.join(', ')}, see the output above`
		: verifyAllFilesRan(workerDir, count);
	fs.rmSync(workerDir, { recursive: true, force: true });
	await write(`\n=== ${name}: ${error ?? `all ${count} workers passed`} after ${formatDuration(Date.now() - start)} ===\n`);
	return error ? 1 : 0;
}

/**
 * @returns an error message if not every test file was claimed by a worker
 */
function verifyAllFilesRan(workerDir: string, count: number): string | undefined {
	const claimed = fs.readdirSync(path.join(workerDir, 'claims')).length;
	for (let id = 1; id <= count; id++) {
		const file = path.join(workerDir, `worker-${id}.json`);
		if (!fs.existsSync(file)) {
			return `FAILED because worker ${id} did not report its test files`;
		}
		const { files } = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (files !== claimed) {
			return `FAILED because only ${claimed} of the ${files} test files ran`;
		}
	}
	return undefined;
}

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
 * test runner itself) run in every worker.
 * @param files from {@link trackTestFiles}
 */
function distributeTestFiles(root: Suite, files: Map<string, ITestFile>, { workerId, workerDir }: { workerId: string; workerDir: string }): void {
	fs.writeFileSync(path.join(workerDir, `worker-${workerId}.json`), JSON.stringify({ files: files.size }));

	const claim = (file: string) => {
		try {
			fs.mkdirSync(path.join(workerDir, 'claims', encodeURIComponent(file)));
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				return false;
			}
			throw error;
		}
	};
	const suitesOf = (file: string) => files.get(file)?.suites ?? [];

	const fileOf = new Map<Suite | Test, string>();
	for (const [file, { suites, tests }] of files) {
		for (const runnable of [...suites, ...tests]) {
			fileOf.set(runnable, file);
		}
	}
	const firstFileSuite = root.suites.findIndex(suite => fileOf.has(suite));
	const otherSuitesBefore = root.suites.filter((suite, i) => !fileOf.has(suite) && (firstFileSuite === -1 || i < firstFileSuite));
	const otherSuitesAfter = root.suites.filter((suite, i) => !fileOf.has(suite) && firstFileSuite !== -1 && i > firstFileSuite);

	// Root-level tests run before any suite, so their files are claimed upfront. Everything is
	// claimed upfront with `.only` because mocha then replaces the suites with filtered ones.
	const queue = [...files.keys()];
	const hasOnly = (root as Suite & { hasOnly(): boolean }).hasOnly(); // missing in the typings
	const owned = new Set(queue.filter(file => (hasOnly || files.get(file)?.tests.length) && claim(file)));
	root.tests = root.tests.filter(test => !fileOf.has(test) || owned.has(fileOf.get(test)!));

	if (hasOnly) {
		root.suites = [...otherSuitesBefore, ...queue.filter(file => owned.has(file)).flatMap(suitesOf), ...otherSuitesAfter];
		return;
	}

	const suites = [...otherSuitesBefore];
	let next = 0;

	/** Adds the suites of the next file that this worker runs, returns false if there is none */
	const claimNext = () => {
		while (next < queue.length) {
			const file = queue[next++];
			if (owned.has(file) || claim(file)) {
				// Record the order in which this worker runs the files, to reproduce failures
				fs.appendFileSync(path.join(workerDir, `worker-${workerId}.files`), `src/${file}.ts\n`);
				suites.push(...suitesOf(file));
				if (suitesOf(file).length) {
					return true;
				}
			}
		}
		return false;
	};

	// The runner skips the root suite if it has no tests when it starts, so claim until it has
	let hasMore = true;
	while (hasMore && !root.tests.length && suites.every(suite => suite.total() === 0)) {
		hasMore = claimNext();
	}

	let done = false;
	root.suites = new Proxy(suites, {
		get(target, property, receiver) {
			// The runner reads `suites[i++]` until it gets `undefined`, so claim more files first
			if (property === String(target.length) && !done && !claimNext()) {
				done = true;
				target.push(...otherSuitesAfter);
			}
			return Reflect.get(target, property, receiver);
		}
	});
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

module.exports = { getWorkerCount, removeArgument, runInWorkers, trackTestFiles, distributeTestFiles };
