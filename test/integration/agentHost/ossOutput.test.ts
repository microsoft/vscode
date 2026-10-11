/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const crypto: typeof import('node:crypto') = require('node:crypto');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const Mocha: typeof import('mocha') = require('mocha');
const { test }: typeof import('node:test') = require('node:test');
const yaml: { load(text: string): unknown } = require('js-yaml');
const output: {
	phase(value: unknown): Record<string, unknown>;
	registration(value: unknown, module: number): Record<string, unknown>;
	holder(value: unknown): Record<string, unknown>;
	testReport(text: string, module: number, iteration: number, storage: string): Promise<Record<string, unknown>>;
	collect(root: string, cache: string, failed: boolean): Promise<Record<string, unknown>[]>;
	runProbe(root: string, args: string[], publish: (record: Record<string, unknown>) => void): Promise<{ status: number; verified: boolean }>;
	safeDiagnosticContext(value: unknown): Record<string, unknown>;
} = require('./ossOutput.ts');
const root = path.resolve(__dirname, '../../..');
const privateValue = 'PRIVATE-OUTPUT-MUST-STAY-LOCAL';

function fixture(): string {
	fs.mkdirSync(path.join(root, '.build'), { recursive: true });
	const directory = fs.mkdtempSync(path.join(root, '.build', 'oss-output-control-'));
	fs.mkdirSync(path.join(directory, 'test/integration/agentHost'), { recursive: true });
	fs.mkdirSync(path.join(directory, '.build/logs/integration-tests'), { recursive: true });
	return directory;
}

function script(directory: string, source: string): void {
	fs.writeFileSync(path.join(directory, 'test/integration/agentHost/ossProbe.ts'), source, { flag: 'wx' });
}

function nativeFixture(directory: string): string {
	const evidence = process.env.AGENT_HOST_OSS_NATIVE_EVIDENCE;
	assert.ok(evidence, 'Supply the retained public-native input and registration evidence directory');
	const logs = path.join(directory, '.build/logs/integration-tests');
	const source: Record<string, string> = JSON.parse(fs.readFileSync(path.join(evidence, 'oss-source-inputs.json'), 'utf8'));
	for (const file of Object.keys(source)) {
		fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
		fs.copyFileSync(path.join(root, file), path.join(directory, file));
	}
	fs.writeFileSync(path.join(logs, 'oss-source-inputs.json'), JSON.stringify(source));
	for (const name of ['agentHostConformance', 'claudeAgentHostE2E', 'codexAgentHostE2E', 'copilotAgentHostE2E', 'copilotOtelAgentHostE2E', 'copilotManagedSettingsAgentHostE2E']) {
		fs.copyFileSync(path.join(evidence, name + '.json'), path.join(logs, name + '.json'));
	}
	const native: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(evidence, 'oss-native-inputs.json'), 'utf8'));
	const originalRoot = Object.keys(native.nativeAssets as Record<string, string>)[0].split('/node_modules/')[0];
	const originalCache = Object.keys(native.headers as Record<string, string>)[0].split('/node-gyp/')[0];
	const cache = path.join(directory, 'cache-control');
	native.headers = Object.fromEntries(Object.entries(native.headers as Record<string, string>).map(([file, hash]) => [file.replace(originalCache, cache), hash]));
	for (const key of ['libcxx', 'nativeAssets']) {
		native[key] = Object.fromEntries(Object.entries(native[key] as Record<string, string>).map(([file, hash]) => [file.replace(originalRoot, directory), hash]));
	}
	fs.writeFileSync(path.join(logs, 'oss-native-inputs.json'), JSON.stringify(native));
	return cache;
}

function matrix(directory: string, empty: boolean): string[] {
	const reports = path.join(directory, '.build/logs/oss-test-reports/test-results');
	fs.mkdirSync(reports, { recursive: true });
	const names: string[] = [];
	for (const iteration of [1, 2]) {
		fs.writeFileSync(path.join(directory, `.build/logs/integration-tests/oss-iteration-${iteration}.json`), JSON.stringify({ iteration, status: 0 }));
		for (const storage of ['tmpfs', 'disk']) {
			for (const [module, label] of ['conformance', 'claude', 'codex', 'copilot', 'copilot-otel', 'copilot-managed-settings'].entries()) {
				const cases = empty || storage === 'disk' && module >= 4 ? 0 : 1;
				const name = path.join(reports, `linux-x64-oss-holder-probe-${iteration}-${label}-${storage}-results.xml`);
				const title = storage === 'disk' ? 'session metadata history and provider context survive a host restart' : 'local completed test';
				fs.writeFileSync(name, `<?xml version="1.0"?><testsuites name="Local" time="0" tests="${cases}" failures="0"><testsuite name="Suite" timestamp="2026-10-11T22:00:00" tests="${cases}" time="0" failures="0">${cases ? `<testcase name="Suite ${title}" classname="${title}" time="0"/>` : ''}</testsuite></testsuites>`);
				names.push(name);
			}
		}
	}
	return names;
}

test('full collector rejects all24 zero-case reports despite two success iteration statuses', async () => {
	const directory = fixture();
	try {
		const cache = nativeFixture(directory);
		matrix(directory, true);
		await assert.rejects(output.collect(directory, cache, false));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('full collector accepts actual module/iteration/storage matrix, allows unsupported disk zero counts and rejects failed, missing or unrelated lifecycle reports on child0', async () => {
	const directory = fixture();
	try {
		const cache = nativeFixture(directory);
		const reports = matrix(directory, false);
		const records = await output.collect(directory, cache, false);
		assert.equal(records.filter(record => record.kind === 'tests').length, 24);
		const original = fs.readFileSync(reports[0], 'utf8');
		fs.writeFileSync(reports[0], original.replace('tests="1"', 'tests="2"'));
		await assert.rejects(output.collect(directory, cache, false), /Unsupported temporary diagnostic producer/);
		fs.writeFileSync(reports[0], original.replace('failures="0"', 'failures="1"'));
		await assert.rejects(output.collect(directory, cache, false));
		fs.writeFileSync(reports[0], original.replace('failures="0"', 'failures="1"').replace('failures="0"', 'failures="1"').replace('time="0"/>', `time="0"><failure message="${privateValue}">${privateValue}</failure></testcase>`));
		await assert.rejects(output.collect(directory, cache, false));
		const partial = await output.collect(directory, cache, true);
		assert.ok(partial.some(record => record.kind === 'tests' && record.failed === 1));
		assert.ok(!JSON.stringify(partial).includes(privateValue));
		fs.writeFileSync(reports[0], original);
		const diskOriginal = fs.readFileSync(reports[6], 'utf8');
		fs.writeFileSync(reports[6], diskOriginal.replaceAll('session metadata history and provider context survive a host restart', 'unrelated case'));
		await assert.rejects(output.collect(directory, cache, false));
		fs.writeFileSync(reports[6], diskOriginal);
		fs.writeFileSync(reports[6], diskOriginal.replaceAll('tests="1"', 'tests="0"').replace(/<testcase[^>]*\/>/, ''));
		await assert.rejects(output.collect(directory, cache, false));
		fs.writeFileSync(reports[6], diskOriginal);
		fs.writeFileSync(reports[0], original.replace('tests="1" failures="0"', 'tests="1" failures="0" skipped="1"').replace(/<testcase[^>]*\/>/, ''));
		await assert.rejects(output.collect(directory, cache, false), 'Pending-only execution cannot satisfy tmpfs completed coverage');
		fs.writeFileSync(reports[0], original.replace('Suite local completed test', 'Tests are using suiteSetup and setup correctly bootstrap').replace('classname="local completed test"', 'classname="bootstrap"'));
		await assert.rejects(output.collect(directory, cache, false), 'Bootstrap check alone cannot satisfy Agent Host execution');
		fs.writeFileSync(reports[0], original);
		fs.unlinkSync(reports[0]);
		await assert.rejects(output.collect(directory, cache, false));
		assert.equal((await output.collect(directory, cache, true)).filter(record => record.kind === 'tests').length, 23);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('actual wrapper full-collector empty success emits safe ZeroExecution gate without verified output; failed partial matrix retains original exit', async () => {
	for (const status of [0, 17]) {
		const directory = fixture();
		try {
			const cache = nativeFixture(directory);
			const reports = matrix(directory, true);
			if (status !== 0) {
				fs.unlinkSync(reports[0]);
			}
			const nativeSource = JSON.parse(fs.readFileSync(path.join(directory, '.build/logs/integration-tests/oss-native-inputs.json'), 'utf8'));
			nativeSource.headers = {};
			fs.writeFileSync(path.join(directory, '.build/logs/integration-tests/oss-native-inputs.json'), JSON.stringify(nativeSource));
			script(directory, `process.exitCode = ${status};\n`);
			const visible: Record<string, unknown>[] = [];
			const result = await output.runProbe(directory, [], record => visible.push(record));
			assert.deepEqual(result, { status: status || 2, verified: status !== 0 });
			if (status === 0) {
				assert.ok(!fs.existsSync(path.join(directory, '.build/oss-public')));
				assert.deepEqual(visible, [{ kind: 'privacy-gate', gate: 'output-privacy', errorClass: 'ZeroExecution', originalStatus: 0, result: 'failed', context: { stage: 'report-matrix', check: 'coverage', module: 0, iteration: 1, storage: 'tmpfs' } }]);
			} else {
				assert.equal((await output.collect(directory, cache, true)).filter(record => record.kind === 'tests').length, 23);
				assert.ok(fs.existsSync(path.join(directory, '.build/oss-public/evidence.jsonl')));
			}
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
});

test('real local raw SDK/host tail and assertion stdout/stderr are quarantined, never streamed or uploaded; original failure7 survives', async () => {
	const directory = fixture();
	try {
		script(directory, `
			console.log('${privateValue}: SDK tail / prompt / assertion actual-expected');
			console.error('${privateValue}: host tail / stderr');
			process.send({gate:'strict-split-iteration:1',result:'failed',status:7,signal:null});
			process.exitCode = 7;
		`);
		const visible: object[] = [];
		const result = await output.runProbe(directory, [], record => visible.push(record));
		assert.deepEqual(result, { status: 7, verified: true });
		assert.ok(fs.readFileSync(path.join(directory, '.build/logs/oss-probe-output.log'), 'utf8').includes(privateValue));
		const artifact = fs.readFileSync(path.join(directory, '.build/oss-public/evidence.jsonl'), 'utf8');
		assert.ok(!artifact.includes(privateValue) && !JSON.stringify(visible).includes(privateValue));
		assert.deepEqual(fs.readdirSync(path.join(directory, '.build/oss-public')), ['evidence.jsonl']);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('real local unexpected private IPC fields block both publication boundaries without changing failed child status', async () => {
	for (const status of [0, 9]) {
		const directory = fixture();
		try {
			script(directory, `
				console.error('${privateValue}');
				process.send({gate:'native-inputs',result:'failed',secret:'${privateValue}'});
				process.exitCode = ${status};
			`);
			const visible: object[] = [];
			const result = await output.runProbe(directory, [], record => visible.push(record));
			assert.deepEqual(result, { status: status || 2, verified: false });
			assert.ok(!fs.existsSync(path.join(directory, '.build/oss-public')));
			assert.ok(!JSON.stringify(visible).includes(privateValue));
			assert.deepEqual(visible, [{ kind: 'privacy-gate', gate: 'output-privacy', errorClass: 'UnsupportedProducer', originalStatus: status, result: 'failed', context: { stage: 'ipc', check: 'schema' } }]);
			assert.ok(fs.readFileSync(path.join(directory, '.build/logs/oss-probe-output.log'), 'utf8').includes(privateValue));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
});

test('actual wrapper CLI stdout/stderr and GitHub output receipt cannot expose raw payload or enable upload on rejected IPC', () => {
	for (const invalid of [false, true]) {
		const directory = fixture();
		try {
			fs.mkdirSync(path.join(directory, 'test'), { recursive: true });
			fs.writeFileSync(path.join(directory, 'test/package.json'), '{"type":"commonjs"}');
			fs.copyFileSync(path.join(__dirname, 'ossOutput.ts'), path.join(directory, 'test/integration/agentHost/ossOutput.ts'));
			script(directory, `
				console.log('${privateValue} ::workflow-command::');
				console.error('${privateValue}');
				process.send({gate:'strict-split-iteration:1',result:'failed',status:13${invalid ? `,private:'${privateValue}'` : ''}});
				process.exitCode = 13;
			`);
			const receipt = path.join(directory, 'github-output-control');
			fs.writeFileSync(receipt, '');
			const result = spawnSync(process.execPath, [path.join(directory, 'test/integration/agentHost/ossOutput.ts')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: receipt } });
			assert.equal(result.status, 13);
			assert.ok(!result.stdout.includes(privateValue) && !result.stderr.includes(privateValue));
			assert.equal(fs.readFileSync(receipt, 'utf8'), invalid ? '' : 'privacy_verified=true\n');
			assert.equal(fs.existsSync(path.join(directory, '.build/oss-public/evidence.jsonl')), !invalid);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
});

test('fixed diagnostic contexts survive real CLI producer rejection without private keys, values, parser errors or filenames', () => {
	const cases: { stage: string; check: string; module?: number; iteration?: number; storage?: string; prepare(directory: string): void }[] = [
		{ stage: 'unexpected-entry', check: 'schema', prepare: directory => fs.writeFileSync(path.join(directory, `.build/logs/integration-tests/${privateValue}.json`), JSON.stringify({ [privateValue]: privateValue })) },
		{
			stage: 'registration', check: 'schema', module: 3, prepare: directory => {
				const file = path.join(directory, '.build/logs/integration-tests/copilotAgentHostE2E.json');
				const value = JSON.parse(fs.readFileSync(file, 'utf8'));
				value[privateValue] = privateValue;
				fs.writeFileSync(file, JSON.stringify(value));
			}
		},
		...['headers', 'libcxx', 'nativeAssets'].map(key => ({
			stage: key === 'headers' ? 'native-headers' : key === 'libcxx' ? 'native-libcxx' : 'native-assets', check: 'scope',
			prepare: (directory: string) => {
				const file = path.join(directory, '.build/logs/integration-tests/oss-native-inputs.json');
				const value = JSON.parse(fs.readFileSync(file, 'utf8'));
				value[key] = { [`/private/${privateValue}`]: 'a'.repeat(64) };
				fs.writeFileSync(file, JSON.stringify(value));
			},
		})),
		{
			stage: 'source-hash', check: 'identity', prepare: directory => {
				const file = path.join(directory, '.build/logs/integration-tests/oss-source-inputs.json');
				const value = JSON.parse(fs.readFileSync(file, 'utf8'));
				value['package.json'] = 'b'.repeat(64);
				fs.writeFileSync(file, JSON.stringify(value));
			}
		},
		{ stage: 'fixtures', check: 'scope', prepare: directory => fs.writeFileSync(path.join(directory, '.build/logs/integration-tests/oss-fixtures-before.json'), JSON.stringify({ [`/private/${privateValue}`]: 'a'.repeat(64) })) },
		...['process', 'cwd', 'fd'].map(kind => ({
			stage: `observer-${kind}`, check: kind === 'cwd' || kind === 'fd' ? 'scope' : 'schema',
			prepare: (directory: string) => {
				const process = { pid: 31, ppid: 30, startTicks: '123', fds: kind === 'fd' ? [{ fd: '7', link: `/private/${privateValue}` }] : [], ...(kind === 'cwd' ? { cwd: `/private/${privateValue}` } : {}), ...(kind === 'process' ? { [privateValue]: privateValue } : {}) };
				fs.writeFileSync(path.join(directory, '.build/logs/integration-tests/oss-holders-31.jsonl'), JSON.stringify({ timestamp: '2026-10-11T22:00:00.000Z', phase: 'before-workload', process }) + '\n');
			},
		})),
		{ stage: 'fuser', check: 'schema', prepare: directory => fs.writeFileSync(path.join(directory, '.build/logs/integration-tests/oss-holders-31.jsonl'), JSON.stringify({ timestamp: '2026-10-11T22:00:00.000Z', phase: 'control-fuser', root: true, childPid: 32, status: 0, stdout: privateValue, stderr: privateValue }) + '\n') },
		{
			stage: 'read-file-safety', check: 'scope', module: 3, prepare: directory => {
				const file = path.join(directory, '.build/logs/integration-tests/copilotAgentHostE2E.json');
				fs.unlinkSync(file);
				fs.symlinkSync(path.join(directory, privateValue), file);
			}
		},
		{
			stage: 'read-file-safety', check: 'io', prepare: directory => {
				fs.mkdirSync(path.join(directory, '.build/logs/oss-test-reports'), { recursive: true });
				fs.writeFileSync(path.join(directory, '.build/logs/oss-test-reports/test-results'), privateValue);
			}
		},
		{ stage: 'storage-event', check: 'schema', prepare: directory => fs.writeFileSync(path.join(directory, '.build/logs/oss-storage-events.jsonl'), JSON.stringify({ kind: privateValue, status: 0 }) + '\n') },
		{
			stage: 'output-write', check: 'io', prepare: directory => {
				const evidence = process.env.AGENT_HOST_OSS_NATIVE_EVIDENCE!;
				fs.copyFileSync(path.join(evidence, 'oss-registration-only.json'), path.join(directory, '.build/logs/integration-tests/oss-registration-only.json'));
			}
		},
		{
			stage: 'report-parse', check: 'parse', module: 0, iteration: 1, storage: 'tmpfs', prepare: directory => {
				const reports = path.join(directory, '.build/logs/oss-test-reports/test-results');
				fs.mkdirSync(reports, { recursive: true });
				fs.writeFileSync(path.join(reports, 'linux-x64-oss-holder-probe-1-conformance-tmpfs-results.xml'), `<${privateValue}`);
			}
		},
		{
			stage: 'report-counts', check: 'counts', module: 0, iteration: 1, storage: 'tmpfs', prepare: directory => {
				const [report] = matrix(directory, false);
				fs.writeFileSync(report, fs.readFileSync(report, 'utf8').replace('tests="1"', 'tests="2"'));
			}
		},
	];
	for (const failure of cases) {
		for (const status of [0, 19]) {
			const directory = fixture();
			try {
				const cache = nativeFixture(directory);
				fs.copyFileSync(path.join(__dirname, 'ossOutput.ts'), path.join(directory, 'test/integration/agentHost/ossOutput.ts'));
				failure.prepare(directory);
				if (failure.stage === 'storage-event') {
					matrix(directory, false);
				}
				script(directory, `${failure.stage === 'output-write' ? `require('node:fs').mkdirSync(${JSON.stringify(path.join(directory, '.build/oss-public'))});` : ''} console.error('${privateValue}'); process.exitCode = ${status};\n`);
				const receipt = path.join(directory, 'github-output-control');
				fs.writeFileSync(receipt, '');
				const result = spawnSync(process.execPath, [path.join(directory, 'test/integration/agentHost/ossOutput.ts')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: receipt, AGENT_HOST_OSS_FRESH_CACHE: cache } });
				assert.equal(result.status, status || 2);
				assert.equal(result.stderr, '');
				assert.ok(!result.stdout.includes(privateValue));
				const safe = JSON.parse(result.stdout);
				const { prepare: _prepare, ...expected } = failure;
				assert.deepEqual(safe.context, expected);
				assert.equal(safe.originalStatus, status);
				assert.equal(fs.readFileSync(receipt, 'utf8'), '');
				assert.ok(!fs.existsSync(path.join(directory, '.build/oss-public/evidence.jsonl')));
			} finally {
				fs.rmSync(directory, { recursive: true, force: true });
			}
		}
	}
});

test('unknown diagnostic enum fields and hostile assertion origin cannot cross final context/IPC publication guard', async () => {
	for (const value of [
		{ stage: privateValue, check: 'schema' }, { stage: 'native', check: privateValue },
		{ stage: 'native', check: 'schema', [privateValue]: privateValue },
		{ stage: 'registration', check: 'schema', module: 6 },
		{ stage: 'report-matrix', check: 'coverage', module: 0, iteration: 3, storage: 'tmpfs' },
		{ stage: 'report-matrix', check: 'coverage', module: 0, iteration: 1, storage: privateValue },
	]) {
		assert.deepEqual(output.safeDiagnosticContext(value), { stage: 'capture', check: 'context' });
	}
	for (const status of [0, 23]) {
		const directory = fixture();
		try {
			fs.writeFileSync(path.join(directory, 'test/package.json'), '{"type":"commonjs"}');
			script(directory, `
				const error = new (require('node:assert').AssertionError)({message:'${privateValue}',actual:'${privateValue}',expected:'${privateValue}'});
				error.context = {stage:'${privateValue}',check:'${privateValue}'};
				process.send(error);
				process.exitCode = ${status};
			`);
			const visible: object[] = [];
			assert.deepEqual(await output.runProbe(directory, [], record => visible.push(record)), { status: status || 2, verified: false });
			assert.ok(!JSON.stringify(visible).includes(privateValue));
			assert.deepEqual(visible, [{ kind: 'privacy-gate', gate: 'output-privacy', errorClass: 'UnsupportedProducer', originalStatus: status, result: 'failed', context: { stage: 'ipc', check: 'schema' } }]);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
});

test('final GitHub receipt filesystem failure emits only fixed context and preserves an already failed original status', () => {
	for (const status of [0, 29]) {
		const directory = fixture();
		try {
			const cache = nativeFixture(directory);
			const evidence = process.env.AGENT_HOST_OSS_NATIVE_EVIDENCE!;
			fs.copyFileSync(path.join(evidence, 'oss-registration-only.json'), path.join(directory, '.build/logs/integration-tests/oss-registration-only.json'));
			fs.copyFileSync(path.join(__dirname, 'ossOutput.ts'), path.join(directory, 'test/integration/agentHost/ossOutput.ts'));
			script(directory, `process.exitCode = ${status};\n`);
			const result = spawnSync(process.execPath, [path.join(directory, 'test/integration/agentHost/ossOutput.ts')], { encoding: 'utf8', env: { ...process.env, AGENT_HOST_OSS_FRESH_CACHE: cache, GITHUB_OUTPUT: path.join(directory, privateValue, 'missing-receipt') } });
			assert.equal(result.status, status || 2);
			assert.ok(!result.stdout.includes(privateValue) && !result.stderr.includes(privateValue));
			assert.deepEqual(JSON.parse(result.stderr), { gate: 'output-privacy', errorClass: 'CaptureFailure', result: 'failed', context: { stage: 'output-write', check: 'io' } });
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
});

test('unexpected artifact path and symlink cannot cause private-file copying or a verified upload', async () => {
	const directory = fixture();
	try {
		const privateFile = path.join(directory, 'private-control.txt');
		fs.writeFileSync(privateFile, privateValue);
		const logs = path.join(directory, '.build/logs/integration-tests');
		fs.symlinkSync(privateFile, path.join(logs, 'copilotAgentHostE2E.json'));
		script(directory, 'process.exitCode = 11;\n');
		const visible: object[] = [];
		const result = await output.runProbe(directory, [], record => visible.push(record));
		assert.deepEqual(result, { status: 11, verified: false });
		assert.ok(!fs.existsSync(path.join(directory, '.build/oss-public')));
		assert.equal(fs.readFileSync(privateFile, 'utf8'), privateValue);
		assert.ok(!JSON.stringify(visible).includes(privateValue));
		fs.unlinkSync(path.join(logs, 'copilotAgentHostE2E.json'));
		fs.writeFileSync(path.join(logs, 'unapproved-private.json'), JSON.stringify({ secret: privateValue }));
		await assert.rejects(output.collect(directory, '', true));
		fs.unlinkSync(path.join(logs, 'unapproved-private.json'));
		const redirected = path.join(directory, 'redirected-control');
		fs.mkdirSync(redirected);
		fs.writeFileSync(path.join(redirected, 'copilotAgentHostE2E.json'), privateValue);
		fs.rmdirSync(logs);
		fs.symlinkSync(redirected, logs);
		await assert.rejects(output.collect(directory, '', true));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('actual cleanup source retains normal failure status and writes only structural unmount status in temporary mode', () => {
	const directory = fixture();
	try {
		const source = fs.readFileSync(path.join(__dirname, 'tmpfs.sh'), 'utf8');
		const cleanup = source.slice(source.indexOf('cleanup() {'), source.indexOf('trap cleanup EXIT'));
		for (const temporary of [false, true]) {
			for (const unmountStatus of [0, 32]) {
				const receipt = path.join(directory, `unmount-${temporary}-${unmountStatus}.jsonl`);
				const controlled = `
					set -euo pipefail
					TEST_TMPDIR="${directory}"
					MOUNTED=true
					sudo() { if [[ "$2" == umount ]]; then return ${unmountStatus}; else echo "${privateValue}" >&2; return 0; fi; }
					rmdir() { return 0; }
					${cleanup}
					trap cleanup EXIT
					exit 3
				`;
				const result = spawnSync('bash', ['-c', controlled], { encoding: 'utf8', env: { ...process.env, AGENT_HOST_OSS_STORAGE_EVENTS: temporary ? receipt : '' } });
				assert.equal(result.status, unmountStatus === 0 ? 3 : 1);
				assert.equal(fs.existsSync(receipt), temporary);
				if (temporary) {
					assert.deepEqual(JSON.parse(fs.readFileSync(receipt, 'utf8').split('\n')[0]), { kind: 'unmount', status: unmountStatus });
				}
				if (unmountStatus !== 0) {
					assert.ok(result.stderr.includes(privateValue), 'Original fuser diagnostic remains available to the quarantined process channel');
				}
			}
		}
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('actual failed cleanup fuser stdout reaches the real collector once with PIDs/status while private stderr stays local; unsupported stdout blocks verified upload', async () => {
	const directory = fixture();
	try {
		const cleanupSource = fs.readFileSync(path.join(__dirname, 'tmpfs.sh'), 'utf8');
		const cleanup = cleanupSource.slice(cleanupSource.indexOf('cleanup() {'), cleanupSource.indexOf('trap cleanup EXIT'));
		for (const unsupported of [false, true]) {
			const attempt = path.join(directory, unsupported ? 'unsupported' : 'safe');
			fs.mkdirSync(path.join(attempt, 'test/integration/agentHost'), { recursive: true });
			fs.writeFileSync(path.join(attempt, 'test/package.json'), '{"type":"commonjs"}');
			const receipt = path.join(attempt, '.build/logs/oss-storage-events.jsonl');
			const controlled = `
				set -euo pipefail
				TEST_TMPDIR="${attempt}"
				MOUNTED=true
				sudo() {
					if [[ "$2" == umount ]]; then return 32; fi
					echo invoked >> "${attempt}/fuser-invocations"
					printf '${unsupported ? privateValue : 'kernel 712 919 712'}\\n'
					echo '${privateValue}' >&2
					return 4
				}
				rmdir() { return 0; }
				${cleanup}
				trap cleanup EXIT
				exit 3
			`;
			script(attempt, `
				const {spawnSync} = require('node:child_process');
				const result = spawnSync('bash', ['-c', ${JSON.stringify(controlled)}], {stdio:'inherit',env:{...process.env,AGENT_HOST_OSS_STORAGE_EVENTS:${JSON.stringify(receipt)}}});
				process.exitCode = result.status;
			`);
			const visible: object[] = [];
			const result = await output.runProbe(attempt, [], record => visible.push(record));
			assert.equal(result.status, 1, 'Original unmount failure remains fatal regardless of fuser outcome');
			assert.equal(fs.readFileSync(path.join(attempt, 'fuser-invocations'), 'utf8'), 'invoked\n');
			assert.equal(result.verified, !unsupported);
			assert.ok(!JSON.stringify(visible).includes(privateValue));
			const quarantined = fs.readFileSync(path.join(attempt, '.build/logs/oss-probe-output.log'), 'utf8');
			assert.ok(quarantined.includes(privateValue));
			if (!unsupported) {
				const publicFile = fs.readFileSync(path.join(attempt, '.build/oss-public/evidence.jsonl'), 'utf8');
				const records = publicFile.trim().split('\n').map(line => JSON.parse(line));
				const fuser = records.find(record => record.kind === 'unmount-fuser');
				assert.deepEqual({ sequence: fuser.sequence, status: fuser.status, holderPids: fuser.holderPids }, { sequence: 2, status: 4, holderPids: [712, 919] });
				assert.ok(Number.isInteger(fuser.shellPid) && fuser.shellPid > 0);
				assert.ok(!publicFile.includes(privateValue) && !publicFile.includes(attempt));
			} else {
				assert.ok(!fs.existsSync(path.join(attempt, '.build/oss-public')));
				assert.ok(fs.readdirSync(path.join(attempt, '.build/logs')).some(file => file.startsWith('oss-storage-events.jsonl.fuser.')));
			}
		}
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('failed-unmount receipt without its actual fuser result cannot enable publication', async () => {
	const directory = fixture();
	try {
		fs.writeFileSync(path.join(directory, '.build/logs/oss-storage-events.jsonl'), '{"kind":"unmount","status":32}\n');
		await assert.rejects(output.collect(directory, '', true));
		script(directory, 'process.exitCode = 1;\n');
		const visible: object[] = [];
		assert.deepEqual(await output.runProbe(directory, [], record => visible.push(record)), { status: 1, verified: false });
		assert.deepEqual(visible, [{ kind: 'privacy-gate', gate: 'output-privacy', errorClass: 'MissingUnmountFuser', originalStatus: 1, result: 'failed', context: { stage: 'storage-event', check: 'coverage' } }]);
		assert.ok(!fs.existsSync(path.join(directory, '.build/oss-public')));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('known native registration/hash receipts are projected safely and reject extra payload fields', async () => {
	const evidence = process.env.AGENT_HOST_OSS_NATIVE_EVIDENCE;
	assert.ok(evidence, 'Supply the retained public-native input and registration evidence directory');
	const directory = fixture();
	try {
		const logs = path.join(directory, '.build/logs/integration-tests');
		const cache = nativeFixture(directory);
		fs.copyFileSync(path.join(evidence, 'oss-registration-only.json'), path.join(logs, 'oss-registration-only.json'));
		const records = await output.collect(directory, cache, false);
		assert.equal(records.filter(record => record.kind === 'registration').length, 6);
		assert.ok(records.some(record => record.kind === 'native-inputs'));
		assert.ok(!JSON.stringify(records).includes(directory));
		const invalid = JSON.parse(fs.readFileSync(path.join(logs, 'copilotAgentHostE2E.json'), 'utf8'));
		invalid.secret = privateValue;
		fs.writeFileSync(path.join(logs, 'copilotAgentHostE2E.json'), JSON.stringify(invalid));
		await assert.rejects(output.collect(directory, cache, false));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('fuser/PID/start ancestry receipts retain scope and permission limits without raw paths or diagnostic strings', () => {
	const time = '2026-10-11T22:00:00.000Z';
	const mount = '/tmp/agent-host-e2e-tmpfs.ABC123';
	const process = output.holder({ timestamp: time, phase: 'control-held', process: { pid: 32, ppid: 31, startTicks: '12345', executable: '/usr/bin/node', cwd: mount, fds: [{ fd: '7', link: mount + '/private-control' }] } });
	assert.equal(process.pid, 32);
	assert.equal(process.ppid, 31);
	assert.equal(process.startTicks, '12345');
	assert.equal(process.cwdSha256, crypto.createHash('sha256').update(mount).digest('hex'));
	assert.ok(!JSON.stringify(process).includes(mount));
	assert.deepEqual(output.holder({ timestamp: time, phase: 'control-fuser', root: true, childPid: 32, status: 0, stdout: 'kernel 32', stderr: privateValue }), { kind: 'fuser', time, root: true, childPid: 32, status: 0, identified: true });
	assert.deepEqual(output.holder({ timestamp: time, phase: 'after-workload', unavailable: { EACCES: 2, ENOENT: 3 }, processCount: 4, scopedHolders: [32] }).unavailable, { EACCES: 2, ENOENT: 3 });
	assert.throws(() => output.holder({ timestamp: time, phase: 'control-held', process: { pid: 32, ppid: 31, startTicks: '12345', cwd: '/home/private-user', fds: [] } }));
	assert.throws(() => output.phase({ gate: 'native-inputs', result: 'failed', errorClass: privateValue }));
});

test('real XML failure/stdout payload remains opaque while actual test IDs/counts are published, unknown schema and entities reject', async () => {
	const xml = `<?xml version="1.0"?><testsuites name="Local" time="0.1" tests="3" failures="1" skipped="1"><testsuite name="Suite" timestamp="2026-10-11T22:00:00" tests="3" time="0.1" failures="1"><testcase name="passed" time="0.01" classname="Suite"/><testcase name="failed" time="0.02" classname="Suite"><failure message="${privateValue}">${privateValue}</failure><system-out>${privateValue}</system-out></testcase></testsuite></testsuites>`;
	const result = await output.testReport(xml, 3, 1, 'tmpfs');
	assert.deepEqual({ passed: result.passed, failed: result.failed, pending: result.pending }, { passed: 1, failed: 1, pending: 1 });
	assert.ok(!JSON.stringify(result).includes(privateValue));
	await assert.rejects(output.testReport(xml.replace('name="Local"', `private="${privateValue}" name="Local"`), 3, 1, 'tmpfs'));
	await assert.rejects(output.testReport('<!DOCTYPE private>' + xml, 3, 1, 'tmpfs'));
});

test('the unchanged installed Mocha JUnit reporter produces accepted actual pass/fail/pending counts without publishing private assertion text', async () => {
	const directory = fixture();
	try {
		const report = path.join(directory, 'actual-local-reporter.xml');
		const mocha = new Mocha({ reporter: 'mocha-junit-reporter', reporterOptions: { mochaFile: report, testsuitesTitle: 'Local output contract' } });
		const suite = Mocha.Suite.create(mocha.suite, 'Local output contract');
		suite.addTest(new Mocha.Test('passing', () => { }));
		suite.addTest(new Mocha.Test('failing', () => { throw new Error(privateValue); }));
		suite.addTest(new Mocha.Test('pending'));
		const failures = await new Promise<number>(resolve => mocha.run(resolve));
		assert.equal(failures, 1);
		const raw = fs.readFileSync(report, 'utf8');
		assert.ok(raw.includes(privateValue));
		const record = await output.testReport(raw, 1, 1, 'disk');
		assert.deepEqual({ passed: record.passed, failed: record.failed, pending: record.pending }, { passed: 1, failed: 1, pending: 1 });
		assert.ok(!JSON.stringify(record).includes(privateValue));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('temporary automatic uploads require verified safe output; full logs/crashes/dependencies remain only on unchanged normal path', () => {
	const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/pr-linux-test.yml'), 'utf8')) as { jobs: { 'linux-test': { steps: { name: string; id?: string; if?: string; run?: string; with?: { path?: string } }[] } } };
	const steps = workflow.jobs['linux-test'].steps;
	assert.equal(steps.find(step => step.name === 'Verify native OSS inputs and run holder probe')?.id, 'oss-output');
	assert.ok(steps.find(step => step.name === 'Verify native OSS inputs and run holder probe')?.run?.includes('ossOutput.ts'));
	for (const name of ['Publish Crash Reports', 'Publish Node Modules']) {
		assert.equal(steps.find(step => step.name === name)?.if, '${{ failure() && !inputs.holder_probe }}');
	}
	assert.equal(steps.find(step => step.name === 'Publish Log Files')?.if, '${{ always() && (!inputs.holder_probe || steps.oss-output.outputs.privacy_verified == \'true\') }}');
	assert.equal(steps.find(step => step.name === 'Publish Log Files')?.with?.path, '${{ inputs.holder_probe && \'.build/oss-public/evidence.jsonl\' || \'.build/logs\' }}');
});
