/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * TEMPORARY, for runner benchmarks (https://github.com/microsoft/vscode-engineering/issues/4273).
 *
 * Runs several test commands at the same time on one runner:
 *
 *   node .github/workflows/run-parallel.ts [--label <text>] [--xvfb] [--logs <dir>]
 *     [--task <name>=<command>]... [--shards <n> --shard-command <command>]
 *
 * `--shards <n>` adds the tasks shard1..shard<n>, which run `<command> --shard <i>/<n>`.
 *
 * Every task runs its command in a shell and gets:
 * - its own empty temp directory in TMPDIR, TEMP and TMP
 * - with --xvfb on Linux, its own Xvfb server in DISPLAY
 * - its output in <logs>/<name>.log, and on stdout with each line prefixed by [<name>]
 *
 * Reports the duration and result of every task and the CPU and memory use of the machine
 * (as a notice annotation, in the step summary and in <logs>/summary.json), and fails when
 * any task fails.
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseArgs } from 'node:util';

interface ITask {
	readonly name: string;
	readonly command: string;
}

interface ITaskResult {
	readonly name: string;
	readonly exitCode: number | null;
	readonly signal: string | null;
	readonly seconds: number;
}

interface IResourceSample {
	readonly cpuPercent: number;
	readonly usedMemoryGB: number;
}

const { values } = parseArgs({
	options: {
		label: { type: 'string' },
		xvfb: { type: 'boolean', default: false },
		logs: { type: 'string', default: path.join('.build', 'logs', 'parallel') },
		task: { type: 'string', multiple: true, default: [] },
		shards: { type: 'string' },
		'shard-command': { type: 'string' },
	},
});

function parseTasks(): ITask[] {
	const tasks = values.task.map(spec => {
		const separator = spec.indexOf('=');
		if (separator <= 0) {
			throw new Error(`Invalid --task '${spec}', expected <name>=<command>.`);
		}
		return { name: spec.slice(0, separator), command: spec.slice(separator + 1) };
	});

	if (values.shards !== undefined) {
		const shards = Number(values.shards);
		if (!Number.isInteger(shards) || shards < 1 || !values['shard-command']) {
			throw new Error('--shards needs a positive integer and --shard-command.');
		}
		for (let index = 1; index <= shards; index++) {
			tasks.push({ name: `shard${index}`, command: `${values['shard-command']} --shard ${index}/${shards}` });
		}
	}

	if (!tasks.length) {
		throw new Error('No tasks, use --task or --shards.');
	}
	for (const { name } of tasks) {
		if (!/^[\w.-]+$/.test(name)) {
			throw new Error(`Invalid task name '${name}'.`);
		}
	}
	if (new Set(tasks.map(task => task.name)).size !== tasks.length) {
		throw new Error('Task names must be unique.');
	}
	return tasks;
}

function formatDuration(seconds: number): string {
	return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Starts an Xvfb server on the given display and waits until it accepts connections.
 */
async function startXvfb(display: number, logsPath: string): Promise<cp.ChildProcess> {
	const socket = `/tmp/.X11-unix/X${display}`;
	const log = fs.openSync(path.join(logsPath, `xvfb-${display}.log`), 'w');
	const xvfb = cp.spawn('Xvfb', [`:${display}`, '-ac', '-screen', '0', '1024x768x24'], { stdio: ['ignore', log, log] });
	fs.closeSync(log);
	for (let attempt = 0; attempt < 100 && !fs.existsSync(socket); attempt++) {
		if (xvfb.exitCode !== null) {
			break;
		}
		await sleep(100);
	}
	if (!fs.existsSync(socket)) {
		xvfb.kill();
		throw new Error(`Xvfb did not start on display :${display}, see ${logsPath}/xvfb-${display}.log.`);
	}
	return xvfb;
}

/**
 * Samples the CPU and memory use of the machine every few seconds.
 */
function sampleResources(logsPath: string, start: number): { stop(): IResourceSample[] } {
	const cpuTimes = () => os.cpus().reduce((sum, { times }) => ({
		idle: sum.idle + times.idle,
		total: sum.total + times.user + times.nice + times.sys + times.irq + times.idle,
	}), { idle: 0, total: 0 });

	const samples: IResourceSample[] = [];
	const csv = fs.openSync(path.join(logsPath, 'resources.csv'), 'w');
	fs.writeSync(csv, 'seconds,cpuPercent,usedMemoryGB,loadAverage1m\n');
	let previous = cpuTimes();
	const timer = setInterval(() => {
		const current = cpuTimes();
		const total = current.total - previous.total;
		const cpuPercent = total > 0 ? 100 * (1 - (current.idle - previous.idle) / total) : 0;
		previous = current;
		const usedMemoryGB = (os.totalmem() - os.freemem()) / 1024 ** 3;
		samples.push({ cpuPercent, usedMemoryGB });
		fs.writeSync(csv, `${Math.round((Date.now() - start) / 1000)},${cpuPercent.toFixed(1)},${usedMemoryGB.toFixed(2)},${os.loadavg()[0].toFixed(2)}\n`);
	}, 5000);

	return {
		stop: () => {
			clearInterval(timer);
			fs.closeSync(csv);
			return samples;
		}
	};
}

const running = new Map<string, cp.ChildProcess>();

function killTree(child: cp.ChildProcess): void {
	if (child.pid === undefined || child.exitCode !== null) {
		return;
	}
	try {
		if (process.platform === 'win32') {
			cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
		} else {
			process.kill(-child.pid, 'SIGKILL');
		}
	} catch {
		// already exited
	}
}

function runTask(task: ITask, env: NodeJS.ProcessEnv, logsPath: string): Promise<ITaskResult> {
	return new Promise(resolve => {
		const start = Date.now();
		const log = fs.openSync(path.join(logsPath, `${task.name}.log`), 'w');
		const prefix = `[${task.name}] `;
		const child = cp.spawn(task.command, {
			shell: true,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			// Own process group, so that the whole tree can be killed
			detached: process.platform !== 'win32',
		});
		running.set(task.name, child);

		for (const stream of [child.stdout, child.stderr]) {
			let pending = '';
			const writeLine = (line: string) => {
				// Keep workflow commands such as ::error:: working
				process.stdout.write(/^::(error|warning|notice)/.test(line) ? `${line}\n` : `${prefix}${line}\n`);
			};
			stream.setEncoding('utf8');
			stream.on('data', (chunk: string) => {
				fs.writeSync(log, chunk);
				const lines = (pending + chunk).split('\n');
				pending = lines.pop() ?? '';
				lines.forEach(writeLine);
			});
			stream.on('end', () => {
				if (pending) {
					writeLine(pending);
					pending = '';
				}
			});
		}

		let spawnError: Error | undefined;
		child.on('error', error => spawnError = error);
		child.on('close', (exitCode, signal) => {
			running.delete(task.name);
			if (spawnError) {
				fs.writeSync(log, `\n${spawnError}\n`);
				process.stdout.write(`${prefix}${spawnError}\n`);
			}
			fs.closeSync(log);
			resolve({ name: task.name, exitCode: spawnError ? null : exitCode, signal, seconds: (Date.now() - start) / 1000 });
		});
	});
}

async function main(): Promise<number> {
	const tasks = parseTasks();
	const label = values.label ?? tasks.map(task => task.name).join(', ');
	const logsPath = path.resolve(values.logs);
	fs.mkdirSync(logsPath, { recursive: true });

	const tempRoot = path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'p');
	fs.rmSync(tempRoot, { recursive: true, force: true });

	const useXvfb = values.xvfb && process.platform === 'linux';
	const cpus = os.availableParallelism();
	const totalMemoryGB = os.totalmem() / 1024 ** 3;
	console.log(`${label}: running ${tasks.length} tasks at the same time on ${cpus} CPUs with ${totalMemoryGB.toFixed(1)} GB memory`);

	const xvfbs: cp.ChildProcess[] = [];
	const envs = await Promise.all(tasks.map(async (task, index) => {
		const tempPath = path.join(tempRoot, task.name);
		fs.mkdirSync(tempPath, { recursive: true });
		const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tempPath, TEMP: tempPath, TMP: tempPath };
		if (useXvfb) {
			const display = 20 + index;
			xvfbs.push(await startXvfb(display, logsPath));
			env.DISPLAY = `:${display}`;
		}
		console.log(`${label}: [${task.name}] ${task.command} (TMPDIR=${tempPath}${env.DISPLAY && useXvfb ? `, DISPLAY=${env.DISPLAY}` : ''})`);
		return env;
	}));

	const onSignal = (signal: string) => {
		console.log(`${label}: received ${signal}, killing ${[...running.keys()].join(', ') || 'nothing'}`);
		running.forEach(killTree);
		xvfbs.forEach(xvfb => xvfb.kill());
		process.exit(1);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);

	const start = Date.now();
	const sampler = sampleResources(logsPath, start);
	const results = await Promise.all(tasks.map((task, index) => runTask(task, envs[index], logsPath)));
	const wallSeconds = (Date.now() - start) / 1000;
	const samples = sampler.stop();
	xvfbs.forEach(xvfb => xvfb.kill());

	const passed = (result: ITaskResult) => result.exitCode === 0;
	const cpuAverage = samples.length ? samples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / samples.length : 0;
	const cpuMax = Math.max(0, ...samples.map(sample => sample.cpuPercent));
	const memoryMax = Math.max(0, ...samples.map(sample => sample.usedMemoryGB));
	const resources = `${cpus} CPUs, CPU avg ${cpuAverage.toFixed(0)}% max ${cpuMax.toFixed(0)}%, memory max ${memoryMax.toFixed(1)}/${totalMemoryGB.toFixed(1)} GB`;
	const outcome = (result: ITaskResult) => passed(result) ? 'passed' : `FAILED (${result.signal ?? result.exitCode})`;

	console.log(`\n${label}: finished after ${formatDuration(wallSeconds)}, ${resources}`);
	for (const result of results) {
		console.log(`  ${result.name.padEnd(12)} ${formatDuration(result.seconds)}  ${outcome(result)}`);
		if (!passed(result)) {
			console.log(`::error title=${label}::${result.name} ${outcome(result)} after ${formatDuration(result.seconds)}, see the [${result.name}] lines and ${path.relative(process.cwd(), logsPath)}/${result.name}.log`);
		}
	}
	console.log(`::notice title=${label} timings::wall ${formatDuration(wallSeconds)} | ${results.map(result => `${result.name} ${formatDuration(result.seconds)} ${passed(result) ? 'ok' : 'FAILED'}`).join(', ')} | ${resources}`);

	fs.writeFileSync(path.join(logsPath, 'summary.json'), JSON.stringify({ label, cpus, totalMemoryGB, wallSeconds, cpuAverage, cpuMax, memoryMax, results }, undefined, '\t'));
	if (process.env.GITHUB_STEP_SUMMARY) {
		fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
			`### ${label}`,
			'',
			'| Task | Duration | Result |',
			'|---|---|---|',
			...results.map(result => `| ${result.name} | ${formatDuration(result.seconds)} | ${outcome(result)} |`),
			`| **wall clock** | **${formatDuration(wallSeconds)}** | ${resources} |`,
			'',
		].join('\n'));
	}

	return results.every(passed) ? 0 : 1;
}

main().then(code => process.exit(code), error => {
	console.error(error);
	running.forEach(killTree);
	process.exit(1);
});
