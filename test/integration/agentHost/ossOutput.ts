/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const crypto: typeof import('node:crypto') = require('node:crypto');
const { fork }: typeof import('node:child_process') = require('node:child_process');
const { once }: typeof import('node:events') = require('node:events');
const xml: { parseStringPromise(value: string): Promise<unknown> } = require('xml2js');

const modules = [
	'conformance/agentHostConformance',
	'providers/claudeAgentHostE2E',
	'providers/codexAgentHostE2E',
	'providers/copilotAgentHostE2E',
	'providers/copilotOtelAgentHostE2E',
	'providers/copilotManagedSettingsAgentHostE2E',
];
const titles = [
	'Tests are using suiteSetup and setup correctly',
	'Agent Host E2E \u2014 Conformance', 'Agent Host E2E \u2014 Claude',
	'Agent Host E2E \u2014 Codex', 'Agent Host E2E \u2014 Codex (Codex-specific)',
	'Agent Host E2E \u2014 Copilot', 'Agent Host E2E \u2014 Copilot (Copilot-specific)',
	'Agent Host E2E \u2014 Copilot managed telemetry', 'Agent Host E2E \u2014 Copilot OTel file exporter',
	'Agent Host E2E \u2014 Copilot managed-settings diagnostics', 'Agent Host E2E \u2014 Copilot managed permissions over AHP',
	'Agent Host E2E \u2014 Copilot customization lockdown',
];
const gates = ['historical-oss-source', 'native-inputs', 'native-electron-sqlite-pty-abi', ...modules.map(module => `register:${module}`), 'real-native-procfs-calibration', 'strict-split-iteration:1', 'strict-split-iteration:2', 'registration-no-receipt-control', 'owned-cleanup'];
const errorClasses = ['Error', 'AssertionError', 'SyntaxError', 'ENOENT', 'EACCES', 'EEXIST', 'EIO', 'ENOSPC'];
const sourcePaths = ['package.json', 'package-lock.json', 'product.json', '.npmrc', '.nvmrc', 'remote/.npmrc', 'test/package.json', 'test/unit/electron/index.js', 'test/unit/electron/renderer.js', 'test/unit/electron/renderer.html', 'test/unit/electron/preload.js', 'build/package-lock.json', 'build/checksums/electron.txt', 'build/checksums/nodejs.txt', 'build/npm/electronTypes.ts', 'build/npm/preinstall.ts', 'build/linux/libcxx-fetcher.ts', 'build/npm/gyp/custom-headers/v8config.h', 'build/npm/gyp/custom-headers/v8-source-location.h'];
type RecordValue = Record<string, unknown>;

class PrivacyError extends Error {
	constructor() {
		super('Unsupported temporary diagnostic producer');
	}
}

function requireSafe(value: unknown): asserts value {
	if (!value) {
		throw new PrivacyError();
	}
}

function object(value: unknown, required: string[], optional: string[] = []): RecordValue {
	requireSafe(value !== null && typeof value === 'object' && !Array.isArray(value));
	const result = value as RecordValue;
	requireSafe(required.every(key => Object.hasOwn(result, key)) && Object.keys(result).every(key => required.includes(key) || optional.includes(key)));
	return result;
}

function count(value: unknown): number {
	requireSafe(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
	return value;
}

function pid(value: unknown): number {
	const result = count(value);
	requireSafe(result > 0);
	return result;
}

function digest(value: string | Buffer): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function hash(value: unknown): string {
	requireSafe(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
	return value;
}

function signal(value: unknown): unknown {
	requireSafe(value === null || (typeof value === 'string' && ['SIGTERM', 'SIGKILL', 'SIGSEGV', 'SIGABRT', 'SIGBUS', 'SIGILL', 'SIGINT'].includes(value)));
	return value;
}

function phase(value: unknown): RecordValue {
	const input = object(value, ['gate', 'result'], ['status', 'signal', 'errorClass']);
	requireSafe(typeof input.gate === 'string' && gates.includes(input.gate) && typeof input.result === 'string' && ['started', 'passed', 'failed'].includes(input.result));
	if (Object.hasOwn(input, 'status')) {
		requireSafe(count(input.status) <= 255);
	}
	if (Object.hasOwn(input, 'signal')) {
		signal(input.signal);
	}
	if (Object.hasOwn(input, 'errorClass')) {
		requireSafe(typeof input.errorClass === 'string' && errorClasses.includes(input.errorClass));
	}
	return { kind: 'phase', ...input };
}

function registration(value: unknown, index: number): RecordValue {
	const input = object(value, ['module', 'total', 'suites']);
	requireSafe(input.module === `src/vs/platform/agentHost/test/node/e2e/${modules[index]}.integrationTest.ts` && Array.isArray(input.suites));
	const suites = input.suites.map(value => {
		const suite = object(value, ['title', 'tests']);
		requireSafe(typeof suite.title === 'string' && titles.includes(suite.title));
		return { suite: titles.indexOf(suite.title), tests: count(suite.tests) };
	});
	const allowedSuites = [[0, 1], [0, 2], [0, 3, 4], [0, 5, 6], [0, 7, 8], [0, 9, 10, 11]][index];
	requireSafe(suites.every(suite => allowedSuites.includes(suite.suite)) && new Set(suites.map(suite => suite.suite)).size === suites.length && suites.some(suite => suite.suite === allowedSuites[1] && suite.tests > 0));
	requireSafe(count(input.total) > 0 && suites.reduce((sum, suite) => sum + suite.tests, 0) === input.total);
	return { kind: 'registration', module: index, total: input.total, suites };
}

function inventory(value: unknown, roots: string[]): { files: number; sha256: string } {
	requireSafe(value && typeof value === 'object' && !Array.isArray(value));
	const input = value as RecordValue;
	for (const [file, value] of Object.entries(input)) {
		requireSafe(roots.some(root => file.startsWith(root + path.sep)) && path.normalize(file) === file);
		hash(value);
	}
	return { files: Object.keys(input).length, sha256: digest(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))) };
}

function native(value: unknown, root: string, cache: string): RecordValue {
	const input = object(value, ['kernel', 'architecture', 'versions', 'packageIntegrity', 'nodeModulesCacheKey', 'electronZipExpectedSha256', 'executableSha256', 'typesSha256', 'headers', 'libcxx', 'nativeAssets']);
	requireSafe(typeof input.kernel === 'string' && input.architecture === 'x86_64' && input.nodeModulesCacheKey === 'fresh-uncached-oss-linux-x64');
	const expectedVersions: Record<string, string> = { '@github/copilot-sdk': '1.0.18-preview.5', '@github/copilot-sdk-linux-x64': '1.0.18-preview.5', '@anthropic-ai/claude-agent-sdk': '0.3.281', '@anthropic-ai/claude-agent-sdk-linux-x64': '0.3.281', '@openai/codex': '0.157.0', '@openai/codex-linux-x64': '0.157.0-linux-x64', '@vscode/sqlite3': '5.1.12-vscode', 'node-pty': '1.2.0-beta.15' };
	const versions = object(input.versions, Object.keys(expectedVersions));
	requireSafe(Object.entries(versions).every(([name, value]) => value === expectedVersions[name]));
	const integrities = object(input.packageIntegrity, Object.keys(versions));
	requireSafe(Object.values(integrities).every(value => typeof value === 'string' && /^sha512-[A-Za-z0-9+/=]+$/.test(value)));
	return {
		kind: 'native-inputs', architecture: 'x86_64',
		executableSha256: hash(input.executableSha256), typesSha256: hash(input.typesSha256), zipExpectedSha256: hash(input.electronZipExpectedSha256),
		headers: inventory(input.headers, [path.join(cache, 'node-gyp', '43.7.7', 'include/node')]),
		libcxx: inventory(input.libcxx, ['.build/libcxx-objects', '.build/libcxx_headers/include', '.build/libcxxabi_headers/include'].map(directory => path.join(root, directory))),
		nativeAssets: inventory(input.nativeAssets, [path.join(root, 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64')]),
	};
}

function holder(value: unknown): RecordValue {
	const input = object(value, ['timestamp', 'phase'], ['process', 'exitedPid', 'unavailable', 'processCount', 'scopedHolders', 'root', 'childPid', 'status', 'stdout', 'stderr', 'workloadPid', 'code', 'signal']);
	requireSafe(typeof input.timestamp === 'string' && new Date(input.timestamp).toISOString() === input.timestamp);
	const time = input.timestamp;
	if (input.phase === 'control-fuser') {
		object(input, ['timestamp', 'phase', 'root', 'childPid', 'status', 'stdout', 'stderr']);
		requireSafe(typeof input.root === 'boolean' && typeof input.stdout === 'string' && typeof input.stderr === 'string');
		const identifiers = input.stdout.trim().split(/\s+/);
		requireSafe(identifiers.every(value => value === 'kernel' || /^\d+$/.test(value)));
		return { kind: 'fuser', time, root: input.root, childPid: pid(input.childPid), status: count(input.status), identified: identifiers.includes(String(input.childPid)) };
	}
	if (input.phase === 'workload-started') {
		object(input, ['timestamp', 'phase', 'workloadPid']);
		return { kind: 'workload-started', time, pid: pid(input.workloadPid) };
	}
	if (input.phase === 'workload-closed') {
		object(input, ['timestamp', 'phase', 'code', 'signal']);
		return { kind: 'workload-closed', time, status: input.code === null ? null : count(input.code), signal: signal(input.signal) };
	}
	requireSafe(typeof input.phase === 'string' && ['control-held', 'control-released', 'before-workload', 'during-workload', 'after-workload'].includes(input.phase));
	if (Object.hasOwn(input, 'process')) {
		object(input, ['timestamp', 'phase', 'process']);
		const identity = object(input.process, ['pid', 'ppid', 'startTicks', 'fds'], ['executable', 'cwd']);
		requireSafe(typeof identity.startTicks === 'string' && /^\d{1,20}$/.test(identity.startTicks) && Array.isArray(identity.fds));
		const scoped = (value: unknown) => {
			requireSafe(typeof value === 'string' && /^\/tmp\/agent-host-e2e-tmpfs\.[A-Za-z0-9]+(?:\/|$)/.test(value) && path.normalize(value) === value);
			return digest(value);
		};
		const fds = identity.fds.map(value => {
			const fd = object(value, ['fd', 'link']);
			requireSafe(typeof fd.fd === 'string' && /^\d+$/.test(fd.fd));
			return { fd: count(Number(fd.fd)), linkSha256: scoped(fd.link) };
		});
		requireSafe(identity.executable === undefined || (typeof identity.executable === 'string' && identity.executable.startsWith('/')));
		const executable = identity.executable === undefined ? undefined : path.basename(identity.executable as string);
		const executableKind = executable && ['node', 'electron', 'code-oss', 'copilot-runtime', 'git', 'claude', 'codex', 'python3', 'bash', 'sh'].includes(executable) ? executable : 'unclassified';
		return { kind: 'process', phase: input.phase, time, pid: pid(identity.pid), ppid: count(identity.ppid), startTicks: identity.startTicks, executableKind, executableSha256: identity.executable === undefined ? null : digest(identity.executable as string), cwdSha256: identity.cwd === undefined ? null : scoped(identity.cwd), fds };
	}
	if (Object.hasOwn(input, 'exitedPid')) {
		object(input, ['timestamp', 'phase', 'exitedPid']);
		return { kind: 'process-exited', phase: input.phase, time, pid: pid(input.exitedPid) };
	}
	object(input, ['timestamp', 'phase', 'unavailable', 'processCount', 'scopedHolders']);
	const unavailable = object(input.unavailable, [], ['ENOENT', 'ESRCH', 'EACCES', 'EPERM']);
	Object.values(unavailable).forEach(count);
	requireSafe(Array.isArray(input.scopedHolders));
	return { kind: 'process-sample', phase: input.phase, time, unavailable, processCount: count(input.processCount), scopedHolders: input.scopedHolders.map(pid) };
}

async function testReport(text: string, module: number, iteration: number, storage: string): Promise<RecordValue> {
	requireSafe(module >= 0 && module < 6 && [1, 2].includes(iteration) && ['tmpfs', 'disk'].includes(storage));
	requireSafe(!/<!DOCTYPE|<!ENTITY/i.test(text));
	const parsed = object(await xml.parseStringPromise(text), ['testsuites']);
	const report = object(parsed.testsuites, ['$'], ['testsuite']);
	const attributes = object(report.$, ['name', 'time', 'tests', 'failures'], ['skipped']);
	const numeric = (value: unknown) => { requireSafe(typeof value === 'string' && /^\d+$/.test(value)); return count(Number(value)); };
	const tests: { id: string; status: string }[] = [];
	requireSafe(report.testsuite === undefined || Array.isArray(report.testsuite));
	for (const value of report.testsuite as unknown[] ?? []) {
		const suite = object(value, ['$'], ['testcase', 'properties', 'system-out', 'system-err']);
		object(suite.$, ['name', 'timestamp', 'tests', 'time', 'failures'], ['skipped']);
		requireSafe(suite.testcase === undefined || Array.isArray(suite.testcase));
		for (const value of suite.testcase as unknown[] ?? []) {
			const test = object(value, ['$'], ['failure', 'skipped', 'system-out', 'system-err']);
			const attributes = object(test.$, ['name', 'time', 'classname']);
			requireSafe(typeof attributes.name === 'string' && typeof attributes.classname === 'string');
			tests.push({ id: digest(attributes.classname + '\0' + attributes.name), status: Object.hasOwn(test, 'failure') ? 'failed' : Object.hasOwn(test, 'skipped') ? 'pending' : 'passed' });
		}
	}
	const failed = numeric(attributes.failures);
	requireSafe(tests.filter(test => test.status === 'failed').length === failed);
	return { kind: 'tests', module, iteration, storage, passed: tests.filter(test => test.status === 'passed').length, failed, pending: attributes.skipped === undefined ? 0 : numeric(attributes.skipped), tests };
}

function readFile(file: string): string {
	const stat = fs.lstatSync(file);
	requireSafe(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && fs.realpathSync(file) === path.resolve(file));
	return fs.readFileSync(file, 'utf8');
}

async function collect(root: string, cache: string, failed: boolean): Promise<RecordValue[]> {
	const records: RecordValue[] = [];
	const directory = path.join(root, '.build/logs/integration-tests');
	const names = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
	const known = [...modules.map(module => path.basename(module) + '.json'), 'oss-source-inputs.json', 'oss-native-inputs.json', 'oss-fixtures-before.json', 'oss-fixtures-after.json', 'oss-iteration-1.json', 'oss-iteration-2.json', 'oss-registration-only.json'];
	for (const name of names) {
		if (/^agent-host-resources-\d+\.jsonl$/.test(name) || /^agent-host-e2e-\d+-[A-Za-z0-9-]+$/.test(name)) {
			continue; // Raw diagnostics remain in the non-uploaded quarantine.
		}
		const file = path.join(directory, name);
		if (/^oss-holders-\d+\.jsonl$/.test(name)) {
			const observerPid = pid(Number(name.slice('oss-holders-'.length, -'.jsonl'.length)));
			for (const line of readFile(file).split('\n').filter(Boolean)) {
				records.push({ observerPid, ...holder(JSON.parse(line)) });
			}
			continue;
		}
		requireSafe(known.includes(name));
		const input: unknown = JSON.parse(readFile(file));
		const module = known.indexOf(name);
		if (module < modules.length) {
			records.push(registration(input, module));
		} else if (name === 'oss-native-inputs.json') {
			records.push(native(input, root, cache));
		} else if (name === 'oss-source-inputs.json') {
			const source = object(input, sourcePaths);
			for (const file of sourcePaths) {
				requireSafe(hash(source[file]) === digest(readFile(path.join(root, file))));
			}
			records.push({ kind: 'source-inputs', files: sourcePaths.length, sha256: digest(JSON.stringify(source)) });
		} else if (name.startsWith('oss-fixtures-')) {
			records.push({ kind: name === 'oss-fixtures-before.json' ? 'fixtures-before' : 'fixtures-after', ...inventory(input, [path.join(root, 'src/vs/platform/agentHost/test/node/e2e/captures')]) });
		} else if (name.startsWith('oss-iteration-')) {
			const iteration = object(input, ['iteration', 'status']);
			requireSafe(iteration.iteration === Number(name.slice('oss-iteration-'.length, -'.json'.length)));
			records.push({ kind: 'iteration', iteration: iteration.iteration, status: count(iteration.status) });
		} else {
			const summary = object(input, ['gate', 'result', 'registeredModules', 'missingReceiptControl', 'agentHostCasesExecuted', 'workloadIterations']);
			requireSafe(summary.gate === 'registration-only' && summary.result === 'passed' && summary.registeredModules === 6 && summary.missingReceiptControl === 'ENOENT' && summary.agentHostCasesExecuted === 0 && summary.workloadIterations === 0);
			records.push({ kind: 'registration-only', modules: 6, negativeControl: 'ENOENT' });
		}
	}
	requireSafe(failed || (modules.every((_module, index) => records.some(record => record.kind === 'registration' && record.module === index)) && records.some(record => record.kind === 'native-inputs') && records.some(record => record.kind === 'source-inputs')));
	const reports = path.join(root, '.build/logs/oss-test-reports/test-results');
	const reportNames = fs.existsSync(reports) ? fs.readdirSync(reports) : [];
	const labels = ['conformance', 'claude', 'codex', 'copilot', 'copilot-otel', 'copilot-managed-settings'];
	for (const name of reportNames) {
		const match = /^linux-x64-oss-holder-probe-([12])-(conformance|claude|codex|copilot|copilot-otel|copilot-managed-settings)-(tmpfs|disk)-results\.xml$/.exec(name);
		requireSafe(match);
		records.push(await testReport(readFile(path.join(reports, name)), labels.indexOf(match[2]), Number(match[1]), match[3]));
	}
	if (!failed && !records.some(record => record.kind === 'registration-only')) {
		requireSafe(records.filter(record => record.kind === 'iteration' && record.status === 0).length === 2);
		requireSafe(records.filter(record => record.kind === 'tests').length === 24);
	}
	const storageEvents = path.join(root, '.build/logs/oss-storage-events.jsonl');
	if (fs.existsSync(storageEvents)) {
		for (const line of readFile(storageEvents).split('\n').filter(Boolean)) {
			const event = object(JSON.parse(line), ['kind', 'status']);
			requireSafe(event.kind === 'unmount' && count(event.status) <= 255);
			records.push({ kind: 'unmount', status: event.status });
		}
	}
	return records;
}

async function runProbe(root: string, args: string[], publish: (record: RecordValue) => void): Promise<{ status: number; verified: boolean }> {
	const build = path.join(root, '.build');
	requireSafe(fs.realpathSync(root) === path.resolve(root));
	if (!fs.existsSync(build)) {
		fs.mkdirSync(build, { mode: 0o700 });
	}
	requireSafe(!fs.lstatSync(build).isSymbolicLink() && fs.realpathSync(build) === build);
	const quarantine = path.join(root, '.build/logs');
	fs.mkdirSync(quarantine, { recursive: true, mode: 0o700 });
	requireSafe(!fs.lstatSync(quarantine).isSymbolicLink());
	const output = path.join(root, '.build/oss-public');
	requireSafe(!fs.existsSync(output));
	const raw = fs.openSync(path.join(quarantine, 'oss-probe-output.log'), 'wx', 0o600);
	let rejected = false;
	const events: RecordValue[] = [];
	let code: number | null = null;
	try {
		const child = fork(path.join(root, 'test/integration/agentHost/ossProbe.ts'), args, {
			cwd: root, stdio: ['ignore', raw, raw, 'ipc'],
			env: { ...process.env, BUILD_ARTIFACTSTAGINGDIRECTORY: path.join(quarantine, 'oss-test-reports'), AGENT_HOST_OSS_STORAGE_EVENTS: path.join(quarantine, 'oss-storage-events.jsonl') },
		});
		child.on('message', value => {
			try {
				requireSafe(!rejected);
				const record = phase(value);
				events.push(record);
				publish(record);
			} catch {
				rejected = true;
			}
		});
		[code] = await once(child, 'close') as [number | null];
	} finally {
		fs.closeSync(raw);
	}
	const status = code ?? 1;
	try {
		requireSafe(!rejected);
		const records = await collect(root, process.env.AGENT_HOST_OSS_FRESH_CACHE || '', status !== 0);
		requireSafe(!fs.existsSync(output));
		fs.mkdirSync(output, { mode: 0o700 });
		fs.writeFileSync(path.join(output, 'evidence.jsonl'), [...events, ...records, { kind: 'completion', originalStatus: status, result: status === 0 ? 'passed' : 'failed' }].map(record => JSON.stringify(record)).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
		publish({ kind: 'completion', originalStatus: status, result: status === 0 ? 'passed' : 'failed', privacy: 'verified' });
		return { status, verified: true };
	} catch {
		publish({ kind: 'privacy-gate', gate: 'output-privacy', errorClass: 'UnsupportedProducer', originalStatus: status, result: 'failed' });
		return { status: status || 2, verified: false };
	}
}

module.exports = { phase, registration, holder, testReport, collect, runProbe };

if (require.main === module) {
	runProbe(path.resolve(__dirname, '../../..'), process.argv.slice(2), record => console.log(JSON.stringify(record))).then(result => {
		if (result.verified && process.env.GITHUB_OUTPUT) {
			fs.appendFileSync(process.env.GITHUB_OUTPUT, 'privacy_verified=true\n');
		}
		process.exitCode = result.status;
	}, () => {
		console.error(JSON.stringify({ gate: 'output-privacy', errorClass: 'CaptureFailure', result: 'failed' }));
		process.exitCode = 2;
	});
}
