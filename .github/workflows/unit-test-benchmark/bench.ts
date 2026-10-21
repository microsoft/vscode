/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// [experiment] DO NOT MERGE. Runs the unit test benchmark variants of pr-linux-test.yml and
// pr-win32-test.yml (`benchmark` input) and records how long they take.
//
//   node bench.ts run <suites> <workers>
//     <suites>   `electron`, `node`, `browser` (Chromium), or `electron+node` to run both at the same time
//     <workers>  `auto` for `--workers` (one per CPU, memory permitting), or a factor of the CPU count
//   node bench.ts summary
//     prints the recorded results and fails if any variant failed

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface IResult {
	readonly suite: string;
	readonly concurrent: boolean;
	readonly workers: string;
	readonly workerCount: number;
	readonly cpus: number;
	readonly start: number;
	readonly end: number;
	readonly exitCode: number;
}

const resultsFile = path.join('.build', 'logs', 'bench', 'results.jsonl');
const cpus = os.availableParallelism();

const commands: Record<string, string> = {
	electron: process.platform === 'win32' ? 'scripts\\test.bat --tfs "Unit Tests"' : './scripts/test.sh --tfs "Unit Tests"',
	node: 'npm run test-node --',
	browser: 'node test/unit/browser/index.js --browser chromium --tfs "Browser Unit Tests"',
};

/**
 * @returns the number of workers for `--workers <workers>`, the same as test/unit/parallel.ts for `auto`
 */
function getWorkerCount(workers: string): number {
	if (workers === 'auto') {
		return Math.max(1, Math.min(cpus, Math.floor(os.totalmem() / (2 * 1024 ** 3))));
	}
	const factor = Number(workers);
	if (!(factor > 0)) {
		throw new Error(`Invalid workers '${workers}', expected 'auto' or a positive factor of the CPU count`);
	}
	return Math.max(1, Math.round(cpus * factor));
}

function succeeded(exitCode: number): boolean {
	// test.bat treats 255 as success too, see https://github.com/microsoft/vscode/issues/28582
	return exitCode === 0 || (process.platform === 'win32' && exitCode === 255);
}

function forwardLines(stream: NodeJS.ReadableStream, target: NodeJS.WriteStream, prefix: string): void {
	let pending = '';
	stream.setEncoding('utf8');
	stream.on('data', (chunk: string) => {
		const lines = (pending + chunk).split('\n');
		pending = lines.pop() ?? '';
		target.write(lines.map(line => `${prefix}${line}\n`).join(''));
	});
	stream.on('end', () => {
		if (pending) {
			target.write(`${prefix}${pending}\n`);
		}
	});
}

function runSuite(suite: string, workers: string, concurrent: boolean): Promise<IResult> {
	const command = commands[suite];
	if (!command) {
		throw new Error(`Unknown suite '${suite}', expected one of ${Object.keys(commands).join(', ')}`);
	}
	const workerCount = getWorkerCount(workers);
	const commandLine = `${command} --workers${workers === 'auto' ? '' : ` ${workerCount}`}`;
	const prefix = concurrent ? `[${suite}] ` : '';
	console.log(`${prefix}[bench] running \`${commandLine}\` (${workerCount} workers, ${cpus} CPUs)`);

	const start = Date.now();
	const child = spawn(commandLine, { shell: true, stdio: ['ignore', concurrent ? 'pipe' : 'inherit', concurrent ? 'pipe' : 'inherit'] });
	if (concurrent) {
		forwardLines(child.stdout!, process.stdout, prefix);
		forwardLines(child.stderr!, process.stderr, prefix);
	}
	return new Promise(resolve => {
		child.on('close', code => {
			const result: IResult = { suite, concurrent, workers, workerCount, cpus, start, end: Date.now(), exitCode: code ?? 1 };
			console.log(`${prefix}[bench] ${suite} with ${workerCount} workers ${succeeded(result.exitCode) ? 'passed' : 'FAILED'} (exit code ${result.exitCode}) after ${formatDuration(result.end - start)}`);
			fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
			fs.appendFileSync(resultsFile, `${JSON.stringify(result)}\n`);
			resolve(result);
		});
	});
}

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

async function run(suites: string, workers: string): Promise<number> {
	const names = suites.split('+');
	const results = await Promise.all(names.map(suite => runSuite(suite, workers, names.length > 1)));
	return results.every(result => succeeded(result.exitCode)) ? 0 : 1;
}

/**
 * Prints the recorded results. `BENCH_DEFAULT_OUTCOMES` has the outcomes of the default unit test
 * steps, which do not run through this script, as `<suite>=<outcome>` separated by spaces.
 */
function summary(): number {
	const results: IResult[] = fs.existsSync(resultsFile)
		? fs.readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
		: [];
	const defaults = (process.env.BENCH_DEFAULT_OUTCOMES ?? '').split(' ').filter(Boolean).map(entry => entry.split('=')).filter(([, outcome]) => outcome !== 'skipped');
	const cpuModel = os.cpus()[0]?.model.trim() ?? 'unknown CPU';
	const lines = [
		`### Unit test benchmark: ${cpus} CPUs (${cpuModel}), ${Math.round(os.totalmem() / 1024 ** 3)} GB`,
		'',
		'| Suite | Run | Workers | Duration | Result |',
		'|---|---|---|---|---|',
		...defaults.map(([suite, outcome]) => `| ${suite} | default step | auto (${getWorkerCount('auto')}) | see step | ${outcome} |`),
		...results.map(result => `| ${result.suite} | ${result.concurrent ? 'concurrent' : 'alone'} | ${result.workers === 'auto' ? 'auto' : `CPUs × ${result.workers}`} (${result.workerCount}) | ${formatDuration(result.end - result.start)} | ${succeeded(result.exitCode) ? 'success' : `failure (exit code ${result.exitCode})`} |`),
		'',
	];
	console.log(lines.join('\n'));
	if (process.env.GITHUB_STEP_SUMMARY) {
		fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
	}
	const failed = results.some(result => !succeeded(result.exitCode)) || defaults.some(([, outcome]) => outcome !== 'success');
	return failed ? 1 : 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === 'run' && args.length === 2) {
	process.exitCode = await run(args[0], args[1]);
} else if (command === 'summary') {
	process.exitCode = summary();
} else {
	console.error('Usage: node bench.ts run <electron|node|browser|electron+node> <auto|factor> | node bench.ts summary');
	process.exitCode = 1;
}
