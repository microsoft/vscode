/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const vm: typeof import('node:vm') = require('node:vm');
const urls: typeof import('node:url') = require('node:url');
const events: typeof import('node:events') = require('node:events');
const util: typeof import('node:util') = require('node:util');
const { stripTypeScriptTypes }: typeof import('node:module') = require('node:module');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { test }: typeof import('node:test') = require('node:test');

interface IReceipt {
	module: string;
	total: number;
	suites: { title: string; tests: number }[];
}

interface IContract {
	channel: string;
	rendererHandshake: string;
	validateRegistration(value: unknown, module: string, title: string): IReceipt;
	readRegistrationReceipt(output: string, module: string, title: string): IReceipt;
	verifyMissingReceipt(output: string, module: string, title: string): void;
	isRegistrationModule(module: unknown): module is string;
	writeOwnedFile(file: string, content: string): void;
	createProbeSources(main: string, html: string, renderer: string, prefix: string): { main: string; html: string; renderer: string };
}

const contract: IContract = require('./ossRegistrationContract.ts');
const root = path.resolve(__dirname, '../../..');
const moduleId = 'src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts';
const title = 'Agent Host E2E \u2014 Conformance';

function recordedReceipt(): IReceipt {
	const evidence = process.env.AGENT_HOST_OSS_REGISTRATION_EVIDENCE;
	assert.ok(evidence, 'Supply the retained native registration artifact directory');
	const receipt: { total: number; suites: IReceipt['suites'] } = JSON.parse(fs.readFileSync(path.join(evidence, 'agentHostConformance.json'), 'utf8'));
	return { module: moduleId, ...receipt };
}

function rendererContract(invoke: (channel: string, payload: IReceipt) => Promise<{ module: string; total: number } | undefined>, receipt = recordedReceipt()): Promise<void> {
	const run = vm.compileFunction(`return (async () => { ${contract.rendererHandshake} })();`, ['ipcRenderer', 'opts', 'mocha']);
	return run(
		{ invoke },
		{ run: receipt.module },
		{ suite: { total: () => receipt.total, suites: receipt.suites.map(suite => ({ title: suite.title, total: () => suite.tests })) } },
	) as Promise<void>;
}

function fixture(): string {
	fs.mkdirSync(path.join(root, '.build'), { recursive: true });
	return fs.mkdtempSync(path.join(root, '.build', 'oss-registration-contract-'));
}

function installProbe(directory: string, selectedContract = contract) {
	const bootstrap = path.join(directory, 'test/unit/electron');
	fs.mkdirSync(bootstrap, { recursive: true });
	for (const name of ['index.js', 'renderer.js', 'renderer.html']) {
		fs.copyFileSync(path.join(root, 'test/unit/electron', name), path.join(bootstrap, name));
	}
	const output = path.join(directory, 'actual-registration.json');
	const handlers = new Map<string, (event: object, payload: unknown) => { module: string; total: number }>();
	const diagnostics: { result?: string }[] = [];
	const lifecycle = new events.EventEmitter();
	const source = fs.readFileSync(path.join(__dirname, 'ossRegistration.ts'), 'utf8');
	try {
		vm.runInNewContext(stripTypeScriptTypes(source), {
			require: (name: string) => {
				if (name === 'electron') {
					return { ipcMain: { handle: (channel: string, handler: (event: object, payload: unknown) => { module: string; total: number }) => handlers.set(channel, handler) }, app: new events.EventEmitter() };
				}
				if (name === 'node:fs') { return fs; }
				if (name === 'node:path') { return path; }
				if (name === 'node:url') { return urls; }
				if (name === 'node:assert/strict') { return assert; }
				if (name === './ossRegistrationContract.ts') { return selectedContract; }
				assert.equal(name, './ossRegistration-control.main.js');
				return {};
			},
			__dirname: bootstrap,
			process: {
				env: { AGENT_HOST_OSS_REGISTRATION_OUTPUT: output, AGENT_HOST_OSS_REGISTRATION_MODULE: moduleId, AGENT_HOST_OSS_REGISTRATION_TITLE: title, AGENT_HOST_OSS_REGISTRATION_PREFIX: 'ossRegistration-control' },
				once: (event: string, listener: () => void) => lifecycle.once(event, listener),
			},
			console: { log: (entry: string) => diagnostics.push(JSON.parse(entry)), error: (entry: string) => diagnostics.push(JSON.parse(entry)) },
		});
	} catch (error) {
		lifecycle.emit('exit');
		throw error;
	}
	const handler = handlers.get(contract.channel);
	assert.ok(handler, 'Actual helper must install its explicit registration IPC handler');
	return { output, handler, diagnostics, dispose: () => lifecycle.emit('exit') };
}

test('red: the exact old start observer can remain pending while stock zero-case completion wins', async () => {
	const old = spawnSync('git', ['-C', root, 'show', '005957ca985f2123e8cbb6ec891941849a41922b:test/integration/agentHost/ossRegistration.ts'], { encoding: 'utf8' });
	assert.equal(old.status, 0, old.stderr);
	const query = Promise.withResolvers<Omit<IReceipt, 'module'>>();
	const published = Promise.withResolvers<void>();
	const ipc = new events.EventEmitter();
	const completion = Promise.withResolvers<void>();
	const trace: string[] = [];
	vm.runInNewContext(stripTypeScriptTypes(old.stdout), {
		require: (name: string) => {
			if (name === 'electron') { return { ipcMain: ipc, app: new events.EventEmitter() }; }
			if (name === 'node:fs') {
				return { writeFileSync: () => { trace.push('receipt-published'); published.resolve(); } };
			}
			if (name === 'node:path') { return path; }
			if (name === 'node:url') { return urls; }
			if (name === 'node:assert/strict') { return assert; }
			assert.equal(name, './index.js');
			ipc.on('all done', async () => {
				await Promise.all([]);
				await Promise.resolve();
				trace.push('stock-completion-boundary');
				completion.resolve();
			});
			return {};
		},
		__dirname: path.join(root, 'test/unit/electron'),
		process: { env: { AGENT_HOST_OSS_REGISTRATION_OUTPUT: 'unit-control-only' } },
		console: { log() { }, error() { } },
	});
	ipc.emit('start', { sender: { executeJavaScript: () => query.promise } });
	ipc.emit('all done');
	await completion.promise;
	assert.deepEqual(trace, ['stock-completion-boundary']);
	const { module: _module, ...recorded } = recordedReceipt();
	query.resolve(recorded);
	await published.promise;
	assert.deepEqual(trace, ['stock-completion-boundary', 'receipt-published']);
});

test('green: the actual probe renderer awaits receipt publication and acknowledgment before Mocha completion', async () => {
	const directory = fixture();
	try {
		const probe = installProbe(directory);
		const barrier = Promise.withResolvers<void>();
		const invoked = Promise.withResolvers<void>();
		const trace: string[] = [];
		const completed = rendererContract(async (channel, payload) => {
			assert.equal(channel, contract.channel);
			trace.push('registration-invoked');
			invoked.resolve();
			await barrier.promise;
			const acknowledgment = probe.handler({}, payload);
			trace.push('receipt-published');
			return acknowledgment;
		}).then(() => { trace.push('stock-completion-allowed'); });
		await invoked.promise;
		assert.deepEqual(trace, ['registration-invoked']);
		assert.ok(!fs.existsSync(probe.output));
		barrier.resolve();
		await completed;
		assert.deepEqual(JSON.parse(fs.readFileSync(probe.output, 'utf8')), recordedReceipt());
		assert.deepEqual(trace, ['registration-invoked', 'receipt-published', 'stock-completion-allowed']);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('rejection, missing acknowledgment and early renderer exit never admit completion or an invented receipt', async () => {
	for (const errorClass of ['QueryRejected', 'RendererExited']) {
		const directory = fixture();
		try {
			let completionAllowed = false;
			const error = new Error(errorClass);
			const observed = rendererContract(() => Promise.reject(error)).then(() => { completionAllowed = true; });
			await assert.rejects(observed, new RegExp(errorClass));
			assert.equal(completionAllowed, false);
			assert.ok(!fs.existsSync(path.join(directory, 'actual-registration.json')));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	}
	await assert.rejects(rendererContract(() => Promise.resolve(undefined)), /Registration handshake was not acknowledged/);
	const receipt = recordedReceipt();
	await assert.rejects(rendererContract(() => Promise.resolve({ module: 'wrong-module', total: receipt.total })), /Registration handshake was not acknowledged/);
	await assert.rejects(rendererContract(() => Promise.resolve({ module: receipt.module, total: 0 })), /Registration handshake was not acknowledged/);
});

test('actual IPC handler rejects missing, zero-count, wrong-module, malformed and duplicate receipt contracts fatally', () => {
	const directory = fixture();
	try {
		const probe = installProbe(directory);
		const receipt = recordedReceipt();
		for (const invalid of [undefined, {}, { ...receipt, result: 'failed' }, { ...receipt, total: 0 }, { ...receipt, module: 'wrong-module' }, { ...receipt, suites: [] }, { ...receipt, suites: [{ title, tests: 0 }] }, { ...receipt, total: receipt.total + 1 }]) {
			assert.throws(() => probe.handler({}, invalid));
			assert.ok(!fs.existsSync(probe.output));
		}
		assert.deepEqual(JSON.parse(JSON.stringify(probe.handler({}, receipt))), { module: receipt.module, total: receipt.total });
		assert.throws(() => probe.handler({}, receipt), /EEXIST/);
		assert.deepEqual(JSON.parse(fs.readFileSync(probe.output, 'utf8')), receipt);
		assert.ok(probe.diagnostics.some(entry => entry.result === 'failed'));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('an actual early-exit zero-status child with no receipt is rejected by the parent receipt reader', () => {
	const directory = fixture();
	try {
		const child = path.join(directory, 'early-exit.ts');
		const output = path.join(directory, 'actual-registration.json');
		fs.writeFileSync(child, 'process.exitCode = 0;\n', { flag: 'wx' });
		const result = spawnSync(process.execPath, [child], { cwd: directory });
		assert.equal(result.status, 0);
		assert.throws(() => contract.readRegistrationReceipt(output, moduleId, title), /"errorClass":"ENOENT"/);
		contract.verifyMissingReceipt(output, moduleId, title);
		assert.ok(!fs.existsSync(output));
		fs.writeFileSync(output, JSON.stringify(recordedReceipt()), { flag: 'wx' });
		assert.throws(() => contract.verifyMissingReceipt(output, moduleId, title));
		fs.writeFileSync(output, 'invalid-json');
		assert.throws(() => contract.verifyMissingReceipt(output, moduleId, title));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('native registration-only proposal ends after all six receipts and the stock missing-receipt control, before procfs or workload', () => {
	const source = fs.readFileSync(path.join(__dirname, 'ossProbe.ts'), 'utf8');
	const gate = source.indexOf('if (process.argv[2] === \'--registration-only\')');
	const calibration = source.indexOf('real-native-procfs-calibration');
	assert.ok(source.indexOf('readRegistrationReceipt(resultFile') < gate);
	const selected = source.slice(gate, calibration);
	assert.ok(selected.includes('test/unit/electron/index.js'));
	assert.ok(selected.includes('\'--run\', module, \'--grep\', \'^(?!)$\''));
	assert.ok(selected.includes('verifyMissingReceipt(output, module'));
	assert.ok(selected.includes('return;'));
	assert.ok(!selected.includes('runner.ts') && !selected.includes('tmpfs.sh'));
	const main = source.slice(source.indexOf('function main()'));
	assert.ok(!main.includes('app.exit'));
});

test('exclusive receipt and stock-copy writes clean only owned successful or partial creations', () => {
	const directory = fixture();
	try {
		const probe = installProbe(directory);
		probe.handler({}, recordedReceipt());
		probe.dispose();
		const bootstrap = path.join(directory, 'test/unit/electron');
		assert.deepEqual(fs.readdirSync(bootstrap).sort(), ['index.js', 'renderer.html', 'renderer.js']);
		assert.ok(fs.existsSync(probe.output), 'Successful receipt survives bootstrap cleanup');
		const preexisting = path.join(bootstrap, 'ossRegistration-control.html');
		fs.writeFileSync(preexisting, 'preexisting-control');
		assert.throws(() => installProbe(directory), /EEXIST/);
		assert.equal(fs.readFileSync(preexisting, 'utf8'), 'preexisting-control');
		assert.ok(!fs.existsSync(path.join(bootstrap, 'ossRegistration-control.main.js')), 'Earlier owned copy is cleaned on later exclusive-create failure');
		fs.unlinkSync(preexisting);

		const partial = path.join(directory, 'partial-receipt.json');
		const failingFileSystem: typeof fs = {
			...fs,
			writeFileSync: (file, _data, _options) => {
				fs.writeFileSync(file, 'partial-control');
				throw Object.assign(new Error('PRIVATE-WRITE-DETAIL'), { code: 'EIO' });
			},
		};
		const exports = { exports: {} as IContract };
		vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, 'ossRegistrationContract.ts'), 'utf8')), {
			require: (name: string) => name === 'node:fs' ? failingFileSystem : assert,
			module: exports,
		});
		assert.throws(() => exports.exports.writeOwnedFile(partial, 'actual-receipt'), /PRIVATE-WRITE-DETAIL/);
		assert.ok(!fs.existsSync(partial), 'Partial owned receipt is removed on write failure');
		assert.equal(fs.readFileSync(probe.output, 'utf8'), JSON.stringify(recordedReceipt()));
		fs.unlinkSync(probe.output);
		const failedWriteProbe = installProbe(directory, {
			...contract,
			writeOwnedFile: (file, content) => file === probe.output ? exports.exports.writeOwnedFile(file, content) : contract.writeOwnedFile(file, content),
		});
		assert.throws(() => failedWriteProbe.handler({}, recordedReceipt()), error => {
			const visible = [String(error), util.inspect(error), JSON.stringify(error), JSON.stringify(failedWriteProbe.diagnostics)].join('\n');
			return visible.includes('EIO') && !visible.includes('PRIVATE-WRITE-DETAIL');
		});
		assert.ok(!fs.existsSync(failedWriteProbe.output));
		failedWriteProbe.dispose();
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('invalid private payload fields and suite titles never escape through handler diagnostics or rejection', async () => {
	const directory = fixture();
	try {
		const probe = installProbe(directory);
		const receipt = recordedReceipt();
		const privateValue = 'PRIVATE-PAYLOAD-MUST-NOT-BE-ECHOED';
		for (const payload of [
			{ ...receipt, [privateValue]: privateValue },
			{ ...receipt, module: privateValue },
			{ module: moduleId, total: 1, suites: [{ title: privateValue, tests: 1 }] },
			{ ...receipt, suites: [{ title, tests: 1, [privateValue]: privateValue }] },
		]) {
			let rejection: unknown;
			try {
				probe.handler({}, payload);
				assert.fail('Invalid payload must reject');
			} catch (error) {
				rejection = error;
			}
			const visible = [String(rejection), util.inspect(rejection), JSON.stringify(rejection), JSON.stringify(probe.diagnostics)].join('\n');
			assert.ok(!visible.includes(privateValue), 'Diagnostic and Electron rejection representations must not echo invalid payload data');
			assert.ok(visible.includes('actual-registration'));
			assert.ok(!fs.existsSync(probe.output));
			await assert.rejects(rendererContract(() => Promise.reject(rejection)));
		}
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('probe-only bootstrap uses the exact stock CommonJS/module boundary and leaves normal files byte-identical', () => {
	const files = ['index.js', 'renderer.html', 'renderer.js'];
	const originals = files.map(file => fs.readFileSync(path.join(root, 'test/unit/electron', file), 'utf8'));
	const [main, html, renderer] = originals;
	const sources = contract.createProbeSources(main, html, renderer, 'ossRegistration-test');
	assert.ok(sources.main.includes('path.join(__dirname, \'ossRegistration-test.html\')'));
	assert.ok(sources.html.includes('<script src="./ossRegistration-test.renderer.js"></script>'));
	assert.ok(sources.renderer.indexOf('await loadTests(opts);') < sources.renderer.indexOf('await ipcRenderer.invoke(\'oss-registration:ready\''));
	assert.ok(sources.renderer.indexOf('await ipcRenderer.invoke(\'oss-registration:ready\'') < sources.renderer.indexOf('const runner = mocha.run'));
	assert.deepEqual(files.map(file => fs.readFileSync(path.join(root, 'test/unit/electron', file), 'utf8')), originals);
	assert.throws(() => contract.createProbeSources(main, html, renderer.replace('await loadTests(opts);', 'changedBoundary();'), 'ossRegistration-test'));
	assert.throws(() => contract.createProbeSources(main, html, renderer, '../unsafe'));
	assert.ok(!fs.readFileSync(path.join(__dirname, 'ossRegistration.ts'), 'utf8').includes('executeJavaScript'));
});

test('all six historical module identities use the same awaited mechanism; missing receipt still blocks the workload', () => {
	const source = fs.readFileSync(path.join(__dirname, 'ossProbe.ts'), 'utf8');
	const modules = [
		'conformance/agentHostConformance',
		'providers/claudeAgentHostE2E',
		'providers/codexAgentHostE2E',
		'providers/copilotAgentHostE2E',
		'providers/copilotOtelAgentHostE2E',
		'providers/copilotManagedSettingsAgentHostE2E',
	];
	for (const module of modules) {
		assert.equal(source.split(`file: '${module}'`).length, 2);
		const file = `src/vs/platform/agentHost/test/node/e2e/${module}.integrationTest.ts`;
		assert.ok(contract.isRegistrationModule(file));
		const baseline = spawnSync('git', ['-C', root, 'show', `114d61e889475758fd1c3b3fcbdd04e9717940c4:${file}`]);
		assert.equal(baseline.status, 0);
		assert.deepEqual(fs.readFileSync(path.join(root, file)), baseline.stdout, 'Every selected module must retain historical source identity');
	}
	for (const selector of [[moduleId], `${moduleId} --extra`, 'src/vs/other.integrationTest.ts', undefined]) {
		assert.equal(contract.isRegistrationModule(selector), false);
	}
	assert.ok(source.includes('AGENT_HOST_OSS_REGISTRATION_MODULE: module'));
	assert.ok(source.includes('AGENT_HOST_OSS_REGISTRATION_TITLE: entrypoint.title'));
	assert.ok(source.indexOf('readRegistrationReceipt(resultFile') < source.indexOf('real-native-procfs-calibration'));
	assert.ok(source.indexOf('real-native-procfs-calibration') < source.indexOf('strict-split-iteration'));
	assert.ok(!/app\.exit\s*=|setTimeout|sleep|retry/i.test(fs.readFileSync(path.join(__dirname, 'ossRegistration.ts'), 'utf8')));
});
