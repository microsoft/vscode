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
const diskLifecycleTitles = [
	'session metadata history and provider context survive a host restart',
	'archiving a never-restored session survives a host restart',
	'a created automation survives an agent host restart',
	'automation lifecycle: cancelled request deduplication survives a restart',
	'automation lifecycle: an unavailable model produces a durable failed run',
	'regression coverage: cold resume retains ordered user and assistant context',
	'regression coverage: identical prompts remain separate completed turns after resume',
	'detached worktree safety: archive commits local edits and restores them on unarchive',
	'detached worktree safety: archived handles remain restorable after a host restart',
	'detached worktree safety: deletion recovers when the checkout was already removed externally',
];
type RecordValue = Record<string, unknown>;
const diagnosticStages = ['unexpected-entry', 'registration', 'native', 'native-headers', 'native-libcxx', 'native-assets', 'source-hash', 'fixtures', 'observer', 'observer-process', 'observer-cwd', 'observer-fd', 'fuser', 'report-parse', 'report-counts', 'report-matrix', 'storage-event', 'read-file-safety', 'ipc', 'output-write', 'capture'] as const;
const diagnosticChecks = ['schema', 'parse', 'counts', 'identity', 'scope', 'coverage', 'io', 'context'] as const;
interface DiagnosticContext {
	stage: typeof diagnosticStages[number];
	check: typeof diagnosticChecks[number];
	module?: number;
	iteration?: number;
	storage?: 'tmpfs' | 'disk';
}
let diagnostic: DiagnosticContext = { stage: 'capture', check: 'io' };

class PrivacyError extends Error {
	readonly errorClass: string;
	readonly context: DiagnosticContext;

	constructor(errorClass = 'UnsupportedProducer') {
		super('Unsupported temporary diagnostic producer');
		this.errorClass = errorClass;
		this.context = { ...diagnostic };
	}
}

function safeDiagnosticContext(value: unknown): DiagnosticContext {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const context = value as RecordValue;
		if (Object.keys(context).every(key => ['stage', 'check', 'module', 'iteration', 'storage'].includes(key))
			&& diagnosticStages.some(stage => stage === context.stage) && diagnosticChecks.some(check => check === context.check)
			&& (context.module === undefined || (typeof context.module === 'number' && Number.isInteger(context.module) && context.module >= 0 && context.module < 6))
			&& (context.iteration === undefined || context.iteration === 1 || context.iteration === 2)
			&& (context.storage === undefined || context.storage === 'tmpfs' || context.storage === 'disk')) {
			return { stage: context.stage as DiagnosticContext['stage'], check: context.check as DiagnosticContext['check'], ...(context.module === undefined ? {} : { module: context.module }), ...(context.iteration === undefined ? {} : { iteration: context.iteration }), ...(context.storage === undefined ? {} : { storage: context.storage }) };
		}
	}
	return { stage: 'capture', check: 'context' };
}

function requireSafe(value: unknown, errorClass?: string): asserts value {
	if (!value) {
		throw new PrivacyError(errorClass);
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
	diagnostic = { stage: 'ipc', check: 'schema' };
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
	diagnostic = { stage: 'registration', check: 'schema', module: index };
	const input = object(value, ['module', 'total', 'suites']);
	requireSafe(input.module === `src/vs/platform/agentHost/test/node/e2e/${modules[index]}.integrationTest.ts` && Array.isArray(input.suites));
	const suites = input.suites.map(value => {
		const suite = object(value, ['title', 'tests']);
		requireSafe(typeof suite.title === 'string' && titles.includes(suite.title));
		return { suite: titles.indexOf(suite.title), tests: count(suite.tests) };
	});
	const allowedSuites = [[0, 1], [0, 2], [0, 3, 4], [0, 5, 6], [0, 7, 8], [0, 9, 10, 11]][index];
	diagnostic = { stage: 'registration', check: 'identity', module: index };
	requireSafe(suites.every(suite => allowedSuites.includes(suite.suite)) && new Set(suites.map(suite => suite.suite)).size === suites.length && suites.some(suite => suite.suite === allowedSuites[1] && suite.tests > 0));
	diagnostic = { stage: 'registration', check: 'counts', module: index };
	requireSafe(count(input.total) > 0 && suites.reduce((sum, suite) => sum + suite.tests, 0) === input.total);
	return { kind: 'registration', module: index, total: input.total, suites };
}

function inventory(value: unknown, roots: string[]): { files: number; sha256: string } {
	requireSafe(value && typeof value === 'object' && !Array.isArray(value));
	const input = value as RecordValue;
	for (const [file, value] of Object.entries(input)) {
		diagnostic = { ...diagnostic, check: 'scope' };
		requireSafe(roots.some(root => file.startsWith(root + path.sep)) && path.normalize(file) === file);
		diagnostic = { ...diagnostic, check: 'identity' };
		hash(value);
	}
	return { files: Object.keys(input).length, sha256: digest(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))) };
}

function native(value: unknown, root: string, cache: string): RecordValue {
	diagnostic = { stage: 'native', check: 'schema' };
	const input = object(value, ['kernel', 'architecture', 'versions', 'packageIntegrity', 'nodeModulesCacheKey', 'electronZipExpectedSha256', 'executableSha256', 'typesSha256', 'headers', 'libcxx', 'nativeAssets']);
	requireSafe(typeof input.kernel === 'string' && input.architecture === 'x86_64' && input.nodeModulesCacheKey === 'fresh-uncached-oss-linux-x64');
	const expectedVersions: Record<string, string> = { '@github/copilot-sdk': '1.0.18-preview.5', '@github/copilot-sdk-linux-x64': '1.0.18-preview.5', '@anthropic-ai/claude-agent-sdk': '0.3.281', '@anthropic-ai/claude-agent-sdk-linux-x64': '0.3.281', '@openai/codex': '0.157.0', '@openai/codex-linux-x64': '0.157.0-linux-x64', '@vscode/sqlite3': '5.1.12-vscode', 'node-pty': '1.2.0-beta.15' };
	const versions = object(input.versions, Object.keys(expectedVersions));
	requireSafe(Object.entries(versions).every(([name, value]) => value === expectedVersions[name]));
	const integrities = object(input.packageIntegrity, Object.keys(versions));
	requireSafe(Object.values(integrities).every(value => typeof value === 'string' && /^sha512-[A-Za-z0-9+/=]+$/.test(value)));
	const executableSha256 = hash(input.executableSha256);
	const typesSha256 = hash(input.typesSha256);
	const zipExpectedSha256 = hash(input.electronZipExpectedSha256);
	diagnostic = { stage: 'native-headers', check: 'schema' };
	const headers = inventory(input.headers, [path.join(cache, 'node-gyp', '43.7.7', 'include/node')]);
	diagnostic = { stage: 'native-libcxx', check: 'schema' };
	const libcxx = inventory(input.libcxx, ['.build/libcxx-objects', '.build/libcxx_headers/include', '.build/libcxxabi_headers/include'].map(directory => path.join(root, directory)));
	diagnostic = { stage: 'native-assets', check: 'schema' };
	const nativeAssets = inventory(input.nativeAssets, [path.join(root, 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64')]);
	return {
		kind: 'native-inputs', architecture: 'x86_64',
		executableSha256, typesSha256, zipExpectedSha256, headers, libcxx, nativeAssets,
	};
}

function holder(value: unknown): RecordValue {
	diagnostic = { stage: 'observer', check: 'schema' };
	const input = object(value, ['timestamp', 'phase'], ['process', 'exitedPid', 'unavailable', 'processCount', 'scopedHolders', 'root', 'childPid', 'status', 'stdout', 'stderr', 'workloadPid', 'code', 'signal']);
	requireSafe(typeof input.timestamp === 'string' && new Date(input.timestamp).toISOString() === input.timestamp);
	const time = input.timestamp;
	if (input.phase === 'control-fuser') {
		diagnostic = { stage: 'fuser', check: 'schema' };
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
		diagnostic = { stage: 'observer-process', check: 'schema' };
		object(input, ['timestamp', 'phase', 'process']);
		const identity = object(input.process, ['pid', 'ppid', 'startTicks', 'fds'], ['executable', 'cwd']);
		requireSafe(typeof identity.startTicks === 'string' && /^\d{1,20}$/.test(identity.startTicks) && Array.isArray(identity.fds));
		const scoped = (value: unknown) => {
			diagnostic = { ...diagnostic, check: 'scope' };
			requireSafe(typeof value === 'string' && /^\/tmp\/agent-host-e2e-tmpfs\.[A-Za-z0-9]+(?:\/|$)/.test(value) && path.normalize(value) === value);
			return digest(value);
		};
		const fds = identity.fds.map(value => {
			diagnostic = { stage: 'observer-fd', check: 'schema' };
			const fd = object(value, ['fd', 'link']);
			requireSafe(typeof fd.fd === 'string' && /^\d+$/.test(fd.fd));
			return { fd: count(Number(fd.fd)), linkSha256: scoped(fd.link) };
		});
		diagnostic = { stage: 'observer-process', check: 'identity' };
		requireSafe(identity.executable === undefined || (typeof identity.executable === 'string' && identity.executable.startsWith('/')));
		const executable = identity.executable === undefined ? undefined : path.basename(identity.executable as string);
		const executableKind = executable && ['node', 'electron', 'code-oss', 'copilot-runtime', 'git', 'claude', 'codex', 'python3', 'bash', 'sh'].includes(executable) ? executable : 'unclassified';
		const processPid = pid(identity.pid);
		const parentPid = count(identity.ppid);
		diagnostic = { stage: 'observer-cwd', check: 'scope' };
		const cwdSha256 = identity.cwd === undefined ? null : scoped(identity.cwd);
		return { kind: 'process', phase: input.phase, time, pid: processPid, ppid: parentPid, startTicks: identity.startTicks, executableKind, executableSha256: identity.executable === undefined ? null : digest(identity.executable as string), cwdSha256, fds };
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
	diagnostic = { stage: 'report-parse', check: 'identity' };
	requireSafe(module >= 0 && module < 6 && [1, 2].includes(iteration) && ['tmpfs', 'disk'].includes(storage));
	const context: DiagnosticContext = { stage: 'report-parse', check: 'parse', module, iteration, storage: storage === 'tmpfs' ? 'tmpfs' : 'disk' };
	diagnostic = context;
	requireSafe(!/<!DOCTYPE|<!ENTITY/i.test(text));
	const parsedValue: unknown = await xml.parseStringPromise(text);
	diagnostic = { ...context, check: 'schema' };
	const parsed = object(parsedValue, ['testsuites']);
	const report = object(parsed.testsuites, ['$'], ['testsuite']);
	const attributes = object(report.$, ['name', 'time', 'tests', 'failures'], ['skipped']);
	const numeric = (value: unknown) => { requireSafe(typeof value === 'string' && /^\d+$/.test(value)); return count(Number(value)); };
	const tests: { id: string; status: string }[] = [];
	let declared = 0;
	let completed = 0;
	let lifecycleCompleted = 0;
	requireSafe(report.testsuite === undefined || Array.isArray(report.testsuite));
	for (const value of report.testsuite as unknown[] ?? []) {
		const suite = object(value, ['$'], ['testcase', 'properties', 'system-out', 'system-err']);
		const suiteAttributes = object(suite.$, ['name', 'timestamp', 'tests', 'time', 'failures'], ['skipped']);
		declared += numeric(suiteAttributes.tests);
		let suiteFailed = 0;
		let suitePending = 0;
		requireSafe(suite.testcase === undefined || Array.isArray(suite.testcase));
		for (const value of suite.testcase as unknown[] ?? []) {
			const test = object(value, ['$'], ['failure', 'skipped', 'system-out', 'system-err']);
			const attributes = object(test.$, ['name', 'time', 'classname']);
			requireSafe(typeof attributes.name === 'string' && typeof attributes.classname === 'string');
			requireSafe(!(Object.hasOwn(test, 'failure') && Object.hasOwn(test, 'skipped')));
			const status = Object.hasOwn(test, 'failure') ? 'failed' : Object.hasOwn(test, 'skipped') ? 'pending' : 'passed';
			if (status === 'failed') {
				suiteFailed++;
			}
			if (status === 'pending') {
				suitePending++;
			} else {
				if (!attributes.name.startsWith(titles[0] + ' ')) {
					completed++;
				}
				if (diskLifecycleTitles.includes(attributes.classname)) {
					lifecycleCompleted++;
				}
			}
			tests.push({ id: digest(attributes.classname + '\0' + attributes.name), status });
		}
		diagnostic = { ...context, stage: 'report-counts', check: 'counts' };
		requireSafe(numeric(suiteAttributes.failures) === suiteFailed && (suiteAttributes.skipped === undefined ? 0 : numeric(suiteAttributes.skipped)) === suitePending, 'ReportCounts');
		diagnostic = { ...context, check: 'schema' };
	}
	const failed = numeric(attributes.failures);
	const pending = attributes.skipped === undefined ? 0 : numeric(attributes.skipped);
	const passed = tests.filter(test => test.status === 'passed').length;
	const emittedPending = tests.filter(test => test.status === 'pending').length;
	diagnostic = { ...context, stage: 'report-counts', check: 'counts' };
	requireSafe(numeric(attributes.tests) === declared && tests.filter(test => test.status === 'failed').length === failed && pending >= emittedPending && passed + pending <= declared && completed + pending <= declared + failed && new Set(tests.map(test => test.id)).size === tests.length, 'ReportCounts');
	return { kind: 'tests', module, iteration, storage, declared, completed, lifecycleCompleted, passed, failed, pending, tests };
}

function readFile(file: string): string {
	const context = diagnostic;
	diagnostic = { ...context, stage: 'read-file-safety', check: 'io' };
	const stat = fs.lstatSync(file);
	diagnostic = { ...context, stage: 'read-file-safety', check: 'scope' };
	requireSafe(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && fs.realpathSync(file) === path.resolve(file));
	diagnostic = { ...context, stage: 'read-file-safety', check: 'io' };
	const text = fs.readFileSync(file, 'utf8');
	diagnostic = context;
	return text;
}

async function collect(root: string, cache: string, failed: boolean): Promise<RecordValue[]> {
	const records: RecordValue[] = [];
	const directory = path.join(root, '.build/logs/integration-tests');
	diagnostic = { stage: 'read-file-safety', check: 'io' };
	const names = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
	const known = [...modules.map(module => path.basename(module) + '.json'), 'oss-source-inputs.json', 'oss-native-inputs.json', 'oss-fixtures-before.json', 'oss-fixtures-after.json', 'oss-iteration-1.json', 'oss-iteration-2.json', 'oss-registration-only.json'];
	for (const name of names) {
		if (/^agent-host-resources-\d+\.jsonl$/.test(name) || /^agent-host-e2e-\d+-[A-Za-z0-9-]+$/.test(name)) {
			continue; // Raw diagnostics remain in the non-uploaded quarantine.
		}
		const file = path.join(directory, name);
		if (/^oss-holders-\d+\.jsonl$/.test(name)) {
			diagnostic = { stage: 'observer', check: 'identity' };
			const observerPid = pid(Number(name.slice('oss-holders-'.length, -'.jsonl'.length)));
			for (const line of readFile(file).split('\n').filter(Boolean)) {
				diagnostic = { stage: 'observer', check: 'parse' };
				records.push({ observerPid, ...holder(JSON.parse(line)) });
			}
			continue;
		}
		diagnostic = { stage: 'unexpected-entry', check: 'schema' };
		requireSafe(known.includes(name));
		const module = known.indexOf(name);
		const context: DiagnosticContext = module < modules.length ? { stage: 'registration', check: 'parse', module }
			: { stage: name === 'oss-native-inputs.json' ? 'native' : name === 'oss-source-inputs.json' ? 'source-hash' : name.startsWith('oss-fixtures-') ? 'fixtures' : name.startsWith('oss-iteration-') ? 'report-matrix' : 'registration', check: 'parse' };
		diagnostic = context;
		const input: unknown = JSON.parse(readFile(file));
		diagnostic = { ...context, check: 'schema' };
		if (module < modules.length) {
			records.push(registration(input, module));
		} else if (name === 'oss-native-inputs.json') {
			records.push(native(input, root, cache));
		} else if (name === 'oss-source-inputs.json') {
			const source = object(input, sourcePaths);
			for (const file of sourcePaths) {
				diagnostic = { stage: 'source-hash', check: 'identity' };
				requireSafe(hash(source[file]) === digest(readFile(path.join(root, file))));
			}
			records.push({ kind: 'source-inputs', files: sourcePaths.length, sha256: digest(JSON.stringify(source)) });
		} else if (name.startsWith('oss-fixtures-')) {
			diagnostic = { stage: 'fixtures', check: 'schema' };
			records.push({ kind: name === 'oss-fixtures-before.json' ? 'fixtures-before' : 'fixtures-after', ...inventory(input, [path.join(root, 'src/vs/platform/agentHost/test/node/e2e/captures')]) });
		} else if (name.startsWith('oss-iteration-')) {
			diagnostic = { stage: 'report-matrix', check: 'counts' };
			const iteration = object(input, ['iteration', 'status']);
			requireSafe(iteration.iteration === Number(name.slice('oss-iteration-'.length, -'.json'.length)));
			records.push({ kind: 'iteration', iteration: iteration.iteration, status: count(iteration.status) });
		} else {
			const summary = object(input, ['gate', 'result', 'registeredModules', 'missingReceiptControl', 'agentHostCasesExecuted', 'workloadIterations']);
			requireSafe(summary.gate === 'registration-only' && summary.result === 'passed' && summary.registeredModules === 6 && summary.missingReceiptControl === 'ENOENT' && summary.agentHostCasesExecuted === 0 && summary.workloadIterations === 0);
			records.push({ kind: 'registration-only', modules: 6, negativeControl: 'ENOENT' });
		}
	}
	diagnostic = { stage: 'report-matrix', check: 'coverage' };
	requireSafe(failed || (modules.every((_module, index) => records.some(record => record.kind === 'registration' && record.module === index)) && records.some(record => record.kind === 'native-inputs') && records.some(record => record.kind === 'source-inputs')));
	const reports = path.join(root, '.build/logs/oss-test-reports/test-results');
	diagnostic = { stage: 'read-file-safety', check: 'io' };
	const reportNames = fs.existsSync(reports) ? fs.readdirSync(reports) : [];
	const labels = ['conformance', 'claude', 'codex', 'copilot', 'copilot-otel', 'copilot-managed-settings'];
	for (const name of reportNames) {
		const match = /^linux-x64-oss-holder-probe-([12])-(conformance|claude|codex|copilot|copilot-otel|copilot-managed-settings)-(tmpfs|disk)-results\.xml$/.exec(name);
		diagnostic = { stage: 'unexpected-entry', check: 'schema' };
		requireSafe(match);
		diagnostic = { stage: 'report-parse', check: 'parse', module: labels.indexOf(match[2]), iteration: Number(match[1]), storage: match[3] === 'tmpfs' ? 'tmpfs' : 'disk' };
		records.push(await testReport(readFile(path.join(reports, name)), labels.indexOf(match[2]), Number(match[1]), match[3]));
	}
	diagnostic = { stage: 'report-matrix', check: 'coverage' };
	if (!failed && records.some(record => record.kind === 'registration-only')) {
		requireSafe(!records.some(record => record.kind === 'iteration' || record.kind === 'tests'), 'ReportMatrix');
	} else if (!failed) {
		const reports = records.filter(record => record.kind === 'tests');
		for (const iteration of [1, 2]) {
			diagnostic = { stage: 'report-matrix', check: 'coverage', iteration };
			requireSafe(records.some(record => record.kind === 'iteration' && record.iteration === iteration && record.status === 0), 'ReportMatrix');
			for (let module = 0; module < modules.length; module++) {
				for (const storage of ['tmpfs', 'disk']) {
					diagnostic = { stage: 'report-matrix', check: 'coverage', module, iteration, storage: storage === 'tmpfs' ? 'tmpfs' : 'disk' };
					const matches = reports.filter(record => record.module === module && record.iteration === iteration && record.storage === storage);
					requireSafe(matches.length === 1, 'ReportMatrix');
					requireSafe(matches[0].failed === 0, 'FailedReport');
					if (storage === 'tmpfs') {
						requireSafe(count(matches[0].completed) > 0, 'ZeroExecution');
					} else if (module < 4) {
						requireSafe(count(matches[0].lifecycleCompleted) > 0, 'MissingLifecycle');
					}
				}
			}
		}
	}
	const storageEvents = path.join(root, '.build/logs/oss-storage-events.jsonl');
	if (fs.existsSync(storageEvents)) {
		diagnostic = { stage: 'storage-event', check: 'parse' };
		let sequence = 0;
		let awaitingFuser = false;
		for (const line of readFile(storageEvents).split('\n').filter(Boolean)) {
			diagnostic = { stage: 'storage-event', check: 'parse' };
			const event = object(JSON.parse(line), ['kind', 'status'], ['shellPid', 'rawFile']);
			diagnostic = { stage: 'storage-event', check: 'schema' };
			requireSafe(count(event.status) <= 255);
			sequence++;
			if (event.kind === 'unmount') {
				object(event, ['kind', 'status']);
				requireSafe(!awaitingFuser, 'MissingUnmountFuser');
				awaitingFuser = event.status !== 0;
				records.push({ kind: 'unmount', status: event.status, sequence });
			} else {
				if (event.kind === 'unmount-fuser') {
					diagnostic = { stage: 'fuser', check: 'schema' };
				}
				object(event, ['kind', 'status', 'shellPid', 'rawFile']);
				requireSafe(event.kind === 'unmount-fuser' && typeof event.rawFile === 'string' && /^oss-storage-events\.jsonl\.fuser\.[A-Za-z0-9]{6}$/.test(event.rawFile));
				requireSafe(records.at(-1)?.kind === 'unmount' && records.at(-1)?.status !== 0);
				const identifiers = readFile(path.join(path.dirname(storageEvents), event.rawFile)).trim().split(/\s+/).filter(Boolean);
				diagnostic = { stage: 'fuser', check: 'schema' };
				requireSafe(identifiers.every(value => value === 'kernel' || /^\d+$/.test(value)));
				const holderPids = [...new Set(identifiers.filter(value => value !== 'kernel').map(value => pid(Number(value))))].sort((a, b) => a - b);
				records.push({ kind: 'unmount-fuser', sequence, shellPid: pid(event.shellPid), status: event.status, holderPids });
				awaitingFuser = false;
			}
			diagnostic = { stage: 'storage-event', check: 'coverage' };
		}
		requireSafe(!awaitingFuser, 'MissingUnmountFuser');
	}
	return records;
}

async function runProbe(root: string, args: string[], publish: (record: RecordValue) => void): Promise<{ status: number; verified: boolean }> {
	diagnostic = { stage: 'capture', check: 'io' };
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
		diagnostic = { stage: 'ipc', check: 'schema' };
		requireSafe(!rejected);
		const records = await collect(root, process.env.AGENT_HOST_OSS_FRESH_CACHE || '', status !== 0);
		diagnostic = { stage: 'output-write', check: 'io' };
		requireSafe(!fs.existsSync(output));
		fs.mkdirSync(output, { mode: 0o700 });
		fs.writeFileSync(path.join(output, 'evidence.jsonl'), [...events, ...records, { kind: 'completion', originalStatus: status, result: status === 0 ? 'passed' : 'failed' }].map(record => JSON.stringify(record)).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
		publish({ kind: 'completion', originalStatus: status, result: status === 0 ? 'passed' : 'failed', privacy: 'verified' });
		return { status, verified: true };
	} catch (error) {
		const errorClass = error instanceof PrivacyError && ['UnsupportedProducer', 'ReportCounts', 'ReportMatrix', 'FailedReport', 'ZeroExecution', 'MissingLifecycle', 'MissingUnmountFuser'].includes(error.errorClass) ? error.errorClass : 'UnsupportedProducer';
		publish({ kind: 'privacy-gate', gate: 'output-privacy', errorClass, originalStatus: status, result: 'failed', context: safeDiagnosticContext(error instanceof PrivacyError ? error.context : diagnostic) });
		return { status: status || 2, verified: false };
	}
}

module.exports = { phase, registration, holder, testReport, collect, runProbe, safeDiagnosticContext };

if (require.main === module) {
	runProbe(path.resolve(__dirname, '../../..'), process.argv.slice(2), record => console.log(JSON.stringify(record))).then(result => {
		process.exitCode = result.status;
		if (result.verified && process.env.GITHUB_OUTPUT) {
			diagnostic = { stage: 'output-write', check: 'io' };
			fs.appendFileSync(process.env.GITHUB_OUTPUT, 'privacy_verified=true\n');
		}
	}).catch(() => {
		console.error(JSON.stringify({ gate: 'output-privacy', errorClass: 'CaptureFailure', result: 'failed', context: safeDiagnosticContext(diagnostic) }));
		process.exitCode = process.exitCode || 2;
	});
}
