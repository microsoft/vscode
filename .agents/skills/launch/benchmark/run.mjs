#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(benchmarkDir, '..');
const repo = path.resolve(skillDir, '../../..');
const driver = path.join(skillDir, 'scripts', 'drive.mjs');
const scenario = path.join(benchmarkDir, 'scenarios', 'two-turn-fork.json');

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (!argument.startsWith('--')) {
			throw new Error(`Unexpected argument: ${argument}`);
		}
		const equalsIndex = argument.indexOf('=');
		if (equalsIndex !== -1) {
			options[argument.slice(2, equalsIndex)] = argument.slice(equalsIndex + 1);
			continue;
		}
		const key = argument.slice(2);
		const next = argv[index + 1];
		if (next && !next.startsWith('--')) {
			options[key] = next;
			index++;
		} else {
			options[key] = true;
		}
	}
	return options;
}

function positiveInteger(value, fallback, name) {
	if (value === undefined) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`--${name} must be a positive integer`);
	}
	return parsed;
}

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? repo,
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', chunk => stdout += chunk);
		child.stderr.on('data', chunk => stderr += chunk);
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
			}
		});
	});
}

function parseJsonOutput(output) {
	const lines = output.trim().split(/\r?\n/).filter(Boolean);
	if (lines.length === 0) {
		throw new Error('Command produced no JSON output');
	}
	return JSON.parse(lines.at(-1));
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
		: sorted[middle];
}

async function worktreeSnapshot() {
	return (await run('git', ['worktree', 'list', '--porcelain'])).stdout;
}

async function ensureFixture(workspace) {
	await fs.mkdir(workspace, { recursive: true });
	try {
		await fs.access(path.join(workspace, '.git'));
		throw new Error(`Benchmark workspace must not be a git repository: ${workspace}`);
	} catch (error) {
		if (error?.code !== 'ENOENT') {
			throw error;
		}
	}
}

function launcherInvocation(surface, workspace, skipPreLaunch) {
	const launcherArgs = surface === 'agents'
		? ['--agents']
		: ['--', workspace];
	if (skipPreLaunch) {
		launcherArgs.unshift('--skip-prelaunch');
	}
	if (process.platform === 'win32') {
		return {
			command: 'powershell',
			args: ['-ExecutionPolicy', 'Bypass', '-File', path.join(skillDir, 'scripts', 'launch.ps1'), ...launcherArgs],
		};
	}
	return {
		command: path.join(skillDir, 'scripts', 'launch.sh'),
		args: launcherArgs,
	};
}

async function cleanupLaunch(info) {
	if (Number.isInteger(info?.pid) && info.pid > 1) {
		try {
			process.kill(info.pid, 'SIGTERM');
		} catch (error) {
			if (error?.code !== 'ESRCH') {
				throw error;
			}
		}
		const deadline = performance.now() + 5_000;
		let running = true;
		while (running && performance.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 100));
			try {
				process.kill(info.pid, 0);
			} catch (error) {
				if (error?.code === 'ESRCH') {
					running = false;
				} else {
					throw error;
				}
			}
		}
		if (running) {
			process.kill(info.pid, 'SIGKILL');
		}
	}
	await new Promise(resolve => setTimeout(resolve, 500));

	if (typeof info?.runDir === 'string') {
		const resolved = path.resolve(info.runDir);
		if (!path.basename(resolved).startsWith('code-oss-dev-')) {
			throw new Error(`Refusing to remove unexpected launch directory: ${resolved}`);
		}
		await fs.rm(resolved, { recursive: true, force: true });
	}
}

async function runTrial(surface, workspaceRoot, timeoutMs, setupTimeoutMs, runIndex, skipPreLaunch) {
	const workspace = path.join(workspaceRoot, `${surface}-${runIndex}-${Date.now()}`);
	await ensureFixture(workspace);
	const worktreesBefore = await worktreeSnapshot();
	const invocation = launcherInvocation(surface, workspace, skipPreLaunch);
	const launchStart = performance.now();
	let info;
	try {
		const launched = await run(invocation.command, invocation.args);
		const launchMs = Math.round(performance.now() - launchStart);
		info = parseJsonOutput(launched.stdout);

		const scenarioStart = performance.now();
		const driven = await run(process.execPath, [
			driver,
			'scenario',
			'--cdp', String(info.cdpPort),
			'--workspace', workspace,
			'--file', scenario,
			'--timeout-ms', String(timeoutMs),
			'--setup-timeout-ms', String(setupTimeoutMs),
		]);
		const scenarioMs = Math.round(performance.now() - scenarioStart);
		const result = parseJsonOutput(driven.stdout);
		const worktreesAfter = await worktreeSnapshot();
		if (worktreesAfter !== worktreesBefore) {
			throw new Error('Benchmark changed the repository worktree list');
		}

		return {
			run: runIndex,
			surface,
			workspace,
			ok: true,
			launchMs,
			scenarioMs,
			totalMs: launchMs + scenarioMs,
			preLaunchSkipped: info.preLaunchSkipped,
			launcherTimings: info.timings,
			driver: result,
		};
	} catch (error) {
		return {
			run: runIndex,
			surface,
			workspace,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			totalMs: Math.round(performance.now() - launchStart),
		};
	} finally {
		if (info) {
			await cleanupLaunch(info);
		}
		await fs.rm(workspace, { recursive: true, force: true });
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(`Usage: benchmark/run.mjs [--surface all|agents|editor] [--repeat N]
                         [--workspace PATH] [--timeout-ms MS] [--setup-timeout-ms MS]
                         [--output FILE]
                         [--skip-prelaunch]

Runs the checked two-turn/fork scenario against an isolated non-git workspace.
The runner fails a trial if the repository worktree list changes. Only use
--skip-prelaunch after one successful prepared launch of the same build.`);
		return;
	}

	const surface = options.surface ?? 'all';
	if (!['all', 'agents', 'editor'].includes(surface)) {
		throw new Error('--surface must be all, agents, or editor');
	}
	const repeat = positiveInteger(options.repeat, 3, 'repeat');
	const timeoutMs = positiveInteger(options['timeout-ms'], 30_000, 'timeout-ms');
	const setupTimeoutMs = positiveInteger(options['setup-timeout-ms'], 90_000, 'setup-timeout-ms');
	const skipPreLaunch = options['skip-prelaunch'] === true;
	const workspace = path.resolve(options.workspace ?? path.join(os.tmpdir(), 'vscode-launch-benchmark-workspace'));
	await ensureFixture(workspace);

	const surfaces = surface === 'all' ? ['agents', 'editor'] : [surface];
	const trials = [];
	for (const currentSurface of surfaces) {
		for (let runIndex = 1; runIndex <= repeat; runIndex++) {
			const trial = await runTrial(currentSurface, workspace, timeoutMs, setupTimeoutMs, runIndex, skipPreLaunch);
			trials.push(trial);
			console.error(`[launch benchmark] ${currentSurface} ${runIndex}/${repeat}: ${trial.ok ? `${trial.totalMs}ms` : trial.error}`);
		}
	}

	const successful = trials.filter(trial => trial.ok);
	const result = {
		date: new Date().toISOString(),
		repository: repo,
		workspace,
		repeat,
		skipPreLaunchRequested: skipPreLaunch,
		trials,
		summary: Object.fromEntries(surfaces.map(currentSurface => {
			const surfaceTrials = successful.filter(trial => trial.surface === currentSurface);
			return [currentSurface, {
				passed: surfaceTrials.length,
				failed: trials.filter(trial => trial.surface === currentSurface && !trial.ok).length,
				medianLaunchMs: surfaceTrials.length ? median(surfaceTrials.map(trial => trial.launchMs)) : null,
				medianScenarioMs: surfaceTrials.length ? median(surfaceTrials.map(trial => trial.scenarioMs)) : null,
				medianTotalMs: surfaceTrials.length ? median(surfaceTrials.map(trial => trial.totalMs)) : null,
			}];
		})),
	};

	const serialized = `${JSON.stringify(result, null, '\t')}\n`;
	if (options.output) {
		await fs.writeFile(path.resolve(options.output), serialized);
	}
	process.stdout.write(serialized);
	if (successful.length !== trials.length) {
		process.exitCode = 1;
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.stack : String(error));
	process.exitCode = 1;
});
