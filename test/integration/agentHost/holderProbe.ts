/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { spawn, spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { once }: typeof import('node:events') = require('node:events');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

interface IProcessIdentity {
	pid: number;
	ppid: number;
	executable: string | undefined;
	startTicks: string;
	cwd?: string;
	fds: { fd: string; link: string }[];
}

const mountDirectory = process.env.TMPDIR!;
const outputDirectory = path.resolve(__dirname, '../../../.build/logs/integration-tests');
fs.mkdirSync(outputDirectory, { recursive: true });
const output = path.join(outputDirectory, `tmpfs-holder-probe-${process.pid}.jsonl`);
let previous = new Map<number, string>();
let unavailableEntries: Record<string, number> = {};

function record(event: object): void {
	fs.appendFileSync(output, JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n');
}

function readProc<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ESRCH' || code === 'EACCES' || code === 'EPERM') {
			unavailableEntries[code] = (unavailableEntries[code] ?? 0) + 1;
			return undefined;
		}
		throw error;
	}
}

function scopedLink(file: string): string | undefined {
	const link = readProc(() => fs.readlinkSync(file));
	return link === mountDirectory || link?.startsWith(mountDirectory + '/') ? link : undefined;
}

function capture(phase: string): IProcessIdentity[] {
	unavailableEntries = {};
	const identities: IProcessIdentity[] = [];
	const current = new Map<number, string>();
	for (const entry of fs.readdirSync('/proc')) {
		if (!/^\d+$/.test(entry)) {
			continue;
		}
		const directory = `/proc/${entry}`;
		const stat = readProc(() => fs.readFileSync(`${directory}/stat`, 'utf8'));
		if (!stat) {
			continue;
		}
		const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
		const fds: IProcessIdentity['fds'] = [];
		for (const fd of readProc(() => fs.readdirSync(`${directory}/fd`)) ?? []) {
			const link = scopedLink(`${directory}/fd/${fd}`);
			if (link) {
				fds.push({ fd, link });
			}
		}
		const identity: IProcessIdentity = {
			pid: Number(entry),
			ppid: Number(fields[1]),
			executable: readProc(() => fs.readlinkSync(`${directory}/exe`)),
			startTicks: fields[19],
			cwd: scopedLink(`${directory}/cwd`),
			fds,
		};
		const serialized = JSON.stringify(identity);
		current.set(identity.pid, serialized);
		identities.push(identity);
		if (previous.get(identity.pid) !== serialized) {
			record({ phase, process: identity });
		}
	}
	for (const pid of previous.keys()) {
		if (!current.has(pid)) {
			record({ phase, exitedPid: pid });
		}
	}
	previous = current;
	record({ phase, processCount: current.size, unavailableEntries, scopedHolders: identities.filter(identity => identity.cwd || identity.fds.length).map(identity => identity.pid) });
	return identities;
}

async function verifyCapture(): Promise<void> {
	const child = spawn(process.execPath, [__filename, '--control-child'], {
		cwd: mountDirectory,
		stdio: ['pipe', 'pipe', 'inherit'],
	});
	const exited = once(child, 'exit');
	try {
		const [ready] = await Promise.race([
			once(child.stdout!, 'data'),
			exited.then(() => { throw new Error('Control child exited before readiness'); }),
		]);
		assert.equal(ready.toString(), 'READY\n');
		const identity = capture('control-held').find(identity => identity.pid === child.pid);
		assert.ok(identity, 'Real /proc capture must identify the control child');
		assert.equal(identity.ppid, process.pid);
		assert.equal(identity.cwd, mountDirectory);
		assert.ok(identity.startTicks && identity.executable);
		assert.ok(identity.fds.some(fd => fd.link === path.join(mountDirectory, 'holder-probe-control')));
		const sameUserFuser = spawnSync('fuser', ['-vm', mountDirectory], { encoding: 'utf8' });
		if (sameUserFuser.error) {
			throw sameUserFuser.error;
		}
		record({ phase: 'control-fuser-same-user', childPid: child.pid, status: sameUserFuser.status, stdout: sameUserFuser.stdout, stderr: sameUserFuser.stderr });
		assert.equal(sameUserFuser.status, 0, sameUserFuser.stderr);
		assert.ok(sameUserFuser.stdout.trim().split(/\s+/).includes(String(child.pid)), 'Same-user fuser must identify the owned control child');
		const rootCwd = spawnSync('sudo', ['-n', 'readlink', `/proc/${child.pid}/cwd`], { encoding: 'utf8' });
		if (rootCwd.error) {
			throw rootCwd.error;
		}
		record({ phase: 'control-root-proc-read', childPid: child.pid, status: rootCwd.status, scopedCwd: rootCwd.stdout.trim() === mountDirectory ? mountDirectory : undefined, stderr: rootCwd.stderr });
		assert.equal(rootCwd.status, 0, 'Native sudo-root observer must be able to read its control child cwd');
		assert.equal(rootCwd.stdout.trim(), mountDirectory);
		const fuser = spawnSync('sudo', ['-n', 'timeout', '--signal=KILL', '10s', 'fuser', '-vm', mountDirectory], { encoding: 'utf8' });
		if (fuser.error) {
			throw fuser.error;
		}
		record({ phase: 'control-fuser', childPid: child.pid, status: fuser.status, stdout: fuser.stdout, stderr: fuser.stderr });
		assert.equal(fuser.status, 0, fuser.stderr);
		assert.ok(fuser.stdout.trim().split(/\s+/).includes(String(child.pid)), `Real fuser must identify the same holder as /proc: ${fuser.stdout}; ${fuser.stderr}`);
	} finally {
		child.stdin!.end();
		const [code, signal] = await exited;
		assert.deepEqual({ code, signal }, { code: 0, signal: null });
		fs.unlinkSync(path.join(mountDirectory, 'holder-probe-control'));
	}
	assert.ok(!capture('control-released').some(identity => identity.pid === child.pid));
	console.log(`Real Linux holder capture control passed: ${output}`);
}

async function main(): Promise<void> {
	if (process.argv[2] === '--control-child') {
		const fd = fs.openSync(path.join(mountDirectory, 'holder-probe-control'), 'w');
		process.stdin.resume();
		process.stdin.once('end', () => {
			fs.closeSync(fd);
			process.exit(0);
		});
		process.stdout.write('READY\n');
		return;
	}
	assert.equal(process.platform, 'linux');
	assert.equal(fs.statfsSync(mountDirectory).type, 0x01021994, 'Probe requires an actual private tmpfs');
	if (process.argv[2] === '--self-test') {
		await verifyCapture();
		return;
	}
	assert.ok(process.argv[2], 'Probe requires a workload');
	record({ phase: 'start', probePid: process.pid, mountDirectory, intervalMs: 250 });
	capture('before-workload');
	const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit' });
	record({ phase: 'workload-started', workloadPid: child.pid });
	const timer = setInterval(() => capture('during-workload'), 250);
	try {
		const [code, signal] = await once(child, 'close');
		record({ phase: 'workload-closed', workloadPid: child.pid, code, signal });
		process.exitCode = code === 0 ? 0 : 1;
	} finally {
		clearInterval(timer);
		capture('after-workload');
		console.log(`Linux tmpfs process/resource lifetimes: ${output}`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
