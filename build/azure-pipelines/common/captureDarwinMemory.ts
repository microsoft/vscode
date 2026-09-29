/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, spawnSync } from 'node:child_process';

/**
 * Prints a memory snapshot, or runs the command after `--` unchanged while
 * printing additional snapshots every minute. Only executable names are logged,
 * never process arguments or environment variables.
 */
function captureMemory(): void {
	console.log(`\n=== macOS memory snapshot ${new Date().toISOString()} ===`);
	runDiagnostic('Physical memory and current swap allocation', 'sysctl', ['hw.memsize', 'vm.swapusage']);
	runDiagnostic('Memory pressure (query only)', 'memory_pressure', ['-Q']);
	runDiagnostic('VM page accounting and cumulative swap/compression counters', 'vm_stat', []);
	runDiagnostic('Largest process memory footprints, including wired/compressed system totals', 'top', ['-l', '1', '-o', 'mem', '-n', '40']);
	runDiagnostic('Processes with the most compressed memory', 'top', ['-l', '1', '-o', 'cmprs', '-n', '20']);

	const processOutput = runDiagnostic('Process RSS accounting', 'ps', ['-axo', 'pid=,ppid=,rss=,vsz=,pmem=,comm='], false);
	if (processOutput !== undefined) {
		const processes = [];
		for (const line of processOutput.split('\n')) {
			if (!line.trim()) {
				continue;
			}
			const match = /^\s*(?<pid>\d+)\s+(?<parentPid>\d+)\s+(?<rss>\d+)\s+(?<vsz>\d+)\s+(?<percentMemory>[\d.]+)\s+(?<command>.+)$/.exec(line);
			if (!match?.groups) {
				console.warn('##vso[task.logissue type=warning]Unable to parse a process memory row.');
				continue;
			}
			processes.push({
				pid: Number(match.groups.pid),
				parentPid: Number(match.groups.parentPid),
				rssKiB: Number(match.groups.rss),
				vszKiB: Number(match.groups.vsz),
				percentMemory: Number(match.groups.percentMemory),
				command: match.groups.command
			});
		}
		processes.sort((a, b) => b.rssKiB - a.rssKiB);
		console.log('Top 40 processes by resident memory: PID PPID RSS_MiB VSZ_GiB %MEM executable');
		for (const entry of processes.slice(0, 40)) {
			console.log(`${entry.pid} ${entry.parentPid} ${(entry.rssKiB / 1024).toFixed(1)} ${(entry.vszKiB / 1024 ** 2).toFixed(2)} ${entry.percentMemory} ${entry.command}`);
		}

		const groups = new Map<string, { count: number; rssKiB: number }>();
		let totalRssKiB = 0;
		for (const entry of processes) {
			totalRssKiB += entry.rssKiB;
			const group = groups.get(entry.command) ?? { count: 0, rssKiB: 0 };
			group.count++;
			group.rssKiB += entry.rssKiB;
			groups.set(entry.command, group);
		}
		console.log(`RSS sum across ${processes.length} processes: ${(totalRssKiB / 1024 ** 2).toFixed(2)} GiB. This can double-count shared pages and excludes compressed/nonresident memory; it is not total physical usage.`);
		console.log('Top 20 executable groups by summed RSS: process_count RSS_MiB executable');
		for (const [command, group] of [...groups].sort((a, b) => b[1].rssKiB - a[1].rssKiB).slice(0, 20)) {
			console.log(`${group.count} ${(group.rssKiB / 1024).toFixed(1)} ${command}`);
		}
	}
	console.log(`=== End macOS memory snapshot ${new Date().toISOString()} ===\n`);
}

function runDiagnostic(label: string, command: string, args: string[], printOutput = true): string | undefined {
	console.log(`--- ${label} ---`);
	const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
	if (printOutput && result.stdout) {
		console.log(result.stdout);
	}
	if (result.stderr) {
		console.error(result.stderr);
	}
	if (result.error || result.status !== 0) {
		console.warn(`##vso[task.logissue type=warning]Memory diagnostic ${command} failed: ${result.error?.message ?? `exit=${result.status}, signal=${result.signal}`}`);
		return undefined;
	}
	return result.stdout;
}

if (process.argv[2] === '--') {
	const command = process.argv[3];
	if (!command) {
		throw new Error('Expected a command after --');
	}
	const child = spawn(command, process.argv.slice(4), { stdio: 'inherit' });
	const timer = setInterval(captureMemory, 60_000);
	try {
		process.exitCode = await new Promise<number>((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', (code, signal) => {
				if (signal) {
					console.error(`Sanity test process terminated by signal ${signal}`);
				}
				resolve(code ?? 1);
			});
		});
	} finally {
		clearInterval(timer);
	}
} else {
	captureMemory();
}
