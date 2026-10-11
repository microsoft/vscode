/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { spawn, spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { once }: typeof import('node:events') = require('node:events');

interface IIdentity {
	pid: number;
	ppid: number;
	executable?: string;
	startTicks: string;
	cwd?: string;
	fds: { fd: string; link: string }[];
}

const mount = process.env.TMPDIR!;
const logs = path.resolve(__dirname, '../../../.build/logs/integration-tests');
fs.mkdirSync(logs, { recursive: true });
const file = path.join(logs, `oss-holders-${process.pid}.jsonl`);
let previous = new Map<number, string>();
let unavailable: Record<string, number> = {};

function record(event: object): void {
	fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n');
}

function read<T>(callback: () => T): T | undefined {
	try {
		return callback();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ESRCH' || code === 'EACCES' || code === 'EPERM') {
			unavailable[code] = (unavailable[code] ?? 0) + 1;
			return undefined;
		}
		throw error;
	}
}

function scopedLink(file: string): string | undefined {
	const link = read(() => fs.readlinkSync(file));
	return link === mount || link?.startsWith(mount + '/') ? link : undefined;
}

function capture(phase: string): IIdentity[] {
	unavailable = {};
	const identities: IIdentity[] = [];
	const current = new Map<number, string>();
	for (const pid of fs.readdirSync('/proc').filter(pid => /^\d+$/.test(pid))) {
		const directory = `/proc/${pid}`;
		const stat = read(() => fs.readFileSync(`${directory}/stat`, 'utf8'));
		if (!stat) {
			continue;
		}
		const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
		const fds: IIdentity['fds'] = [];
		for (const fd of read(() => fs.readdirSync(`${directory}/fd`)) ?? []) {
			const link = scopedLink(`${directory}/fd/${fd}`);
			if (link) {
				fds.push({ fd, link });
			}
		}
		const identity: IIdentity = { pid: Number(pid), ppid: Number(fields[1]), startTicks: fields[19], executable: read(() => fs.readlinkSync(`${directory}/exe`)), cwd: scopedLink(`${directory}/cwd`), fds };
		identities.push(identity);
		const serialized = JSON.stringify(identity);
		current.set(identity.pid, serialized);
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
	record({ phase, unavailable, processCount: current.size, scopedHolders: identities.filter(identity => identity.cwd || identity.fds.length).map(identity => identity.pid) });
	return identities;
}

async function calibration(): Promise<void> {
	const child = spawn(process.execPath, [__filename, '--control-child'], { cwd: mount, stdio: ['pipe', 'pipe', 'inherit'] });
	const exited = once(child, 'exit');
	try {
		const [ready] = await Promise.race([once(child.stdout!, 'data'), exited.then(() => { throw new Error('Control child exited before readiness'); })]);
		assert.equal(ready.toString(), 'READY\n');
		const identity = capture('control-held').find(identity => identity.pid === child.pid);
		assert.ok(identity && identity.ppid === process.pid && identity.cwd === mount && identity.startTicks && identity.fds.some(fd => fd.link === path.join(mount, 'oss-held-control')));
		for (const root of [false, true]) {
			const probe = spawnSync(root ? 'sudo' : 'timeout', root ? ['-n', 'timeout', '--signal=KILL', '10s', 'fuser', '-vm', mount] : ['--signal=KILL', '10s', 'fuser', '-vm', mount], { encoding: 'utf8' });
			if (probe.error) {
				throw probe.error;
			}
			record({ phase: 'control-fuser', root, childPid: child.pid, status: probe.status, stdout: probe.stdout, stderr: probe.stderr });
			assert.equal(probe.status, 0, probe.stderr);
			assert.ok(probe.stdout.trim().split(/\s+/).includes(String(child.pid)), 'Observer must identify the exact owned control PID');
		}
	} finally {
		child.stdin!.end();
		const [code, signal] = await exited;
		assert.deepEqual({ code, signal }, { code: 0, signal: null });
		fs.unlinkSync(path.join(mount, 'oss-held-control'));
	}
	assert.ok(!capture('control-released').some(identity => identity.pid === child.pid));
	console.log(JSON.stringify({ gate: 'native-fuser-calibration', result: 'passed', file }));
}

async function main(): Promise<void> {
	if (process.argv[2] === '--control-child') {
		const fd = fs.openSync(path.join(mount, 'oss-held-control'), 'w');
		process.stdin.resume();
		process.stdin.once('end', () => {
			fs.closeSync(fd);
			process.exit(0);
		});
		process.stdout.write('READY\n');
		return;
	}
	assert.equal(process.platform, 'linux');
	assert.equal(fs.statfsSync(mount).type, 0x01021994, 'Require the actual private tmpfs mount');
	if (process.argv[2] === '--calibrate') {
		await calibration();
		return;
	}
	assert.ok(process.argv[2], 'Supply the unchanged workload command');
	capture('before-workload');
	const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit' });
	record({ phase: 'workload-started', workloadPid: child.pid });
	const timer = setInterval(() => capture('during-workload'), 250);
	try {
		const [code, signal] = await once(child, 'close');
		record({ phase: 'workload-closed', code, signal });
		process.exitCode = code === 0 ? 0 : 1;
	} finally {
		clearInterval(timer);
		capture('after-workload');
		console.log(JSON.stringify({ gate: 'holder-lifetimes', file }));
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
