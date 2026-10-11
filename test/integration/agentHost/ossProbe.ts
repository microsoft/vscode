/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const os: typeof import('node:os') = require('node:os');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const nodeCrypto: typeof import('node:crypto') = require('node:crypto');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');

const baseline = '114d61e889475758fd1c3b3fcbdd04e9717940c4';
const root = path.resolve(__dirname, '../../..');
const logs = path.join(root, '.build/logs/integration-tests');
const electronVersion = '43.7.7';
const electronArchive = '4d0a48398c444258dbcf2f5f83b49ca5bc53583130f354e0c299dad5b22b5271';
const electronExecutable = '9ecc59968492b5139d37b2de89496832655d2caeae1c7229cecb706006aceb9a';
const electronTypes = 'd78a11ef458b68672c35957f0252396a1fa19e73a8ca3b9178e2e75cd090453d';
const manifestFiles = ['package.json', 'package-lock.json', 'product.json', '.npmrc', '.nvmrc', 'remote/.npmrc', 'test/package.json', 'test/unit/electron/index.js', 'test/unit/electron/renderer.js', 'test/unit/electron/renderer.html', 'test/unit/electron/preload.js', 'build/package-lock.json', 'build/checksums/electron.txt', 'build/checksums/nodejs.txt', 'build/npm/electronTypes.ts', 'build/npm/preinstall.ts', 'build/linux/libcxx-fetcher.ts', 'build/npm/gyp/custom-headers/v8config.h', 'build/npm/gyp/custom-headers/v8-source-location.h'];
const entrypoints = [
	{ file: 'conformance/agentHostConformance', title: 'Agent Host E2E \u2014 Conformance' },
	{ file: 'providers/claudeAgentHostE2E', title: 'Agent Host E2E \u2014 Claude' },
	{ file: 'providers/codexAgentHostE2E', title: 'Agent Host E2E \u2014 Codex' },
	{ file: 'providers/copilotAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot' },
	{ file: 'providers/copilotOtelAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot managed telemetry' },
	{ file: 'providers/copilotManagedSettingsAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot managed-settings diagnostics' },
];

let activeGate = 'historical-oss-source';

function reportPhase(gate: string, result: string, status?: number, signal?: NodeJS.Signals | null, errorClass?: string): void {
	if (process.send) {
		process.send({ gate, result, ...(status === undefined ? {} : { status }), ...(signal === undefined ? {} : { signal }), ...(errorClass === undefined ? {} : { errorClass }) });
	}
}

function run(gate: string, command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
	activeGate = gate;
	reportPhase(gate, 'started');
	console.log(JSON.stringify({ gate, result: 'started' }));
	const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	const status = result.status ?? 1;
	reportPhase(gate, status === 0 ? 'passed' : 'failed', status, result.signal);
	console.log(JSON.stringify({ gate, result: status === 0 ? 'passed' : 'failed', status, signal: result.signal }));
	return status;
}

function fileHash(file: string): string {
	assert.ok(fs.statSync(file).isFile(), `Required file is missing: ${file}`);
	return nodeCrypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function hashes(directory: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			Object.assign(result, hashes(file));
		} else if (entry.isFile()) {
			result[file] = fileHash(file);
		}
	}
	return result;
}

function verifyBaseline(allowFetch: boolean): void {
	const checkout = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 60_000 });
	if (checkout.status !== 0 || checkout.stdout.trim() !== fs.realpathSync(root)) {
		console.error(JSON.stringify({ gate: 'git-checkout-root', result: 'failed', reason: 'not-an-owned-checkout', exitCode: checkout.status, signal: checkout.signal }));
		throw new Error('Source validation requires its own Git checkout; archive/nested-directory context is not accepted');
	}
	const object = spawnSync('git', ['-C', root, 'cat-file', '-e', `${baseline}^{commit}`], { timeout: 60_000 });
	if (object.status === 0) {
		return;
	}
	console.error(JSON.stringify({ gate: 'baseline-git-object', baseline, result: 'unavailable', exitCode: object.status, signal: object.signal, checkoutPackageExists: fs.existsSync(path.join(root, 'package.json')) }));
	if (!allowFetch) {
		throw new Error(`Pinned baseline Git object ${baseline} is unavailable; source-file comparison has not started`);
	}
	const fetch = spawnSync('git', ['-C', root, 'fetch', '--no-tags', '--depth=1', 'origin', baseline], { timeout: 60_000 });
	console.log(JSON.stringify({ gate: 'fetch-pinned-baseline', baseline, result: fetch.status === 0 ? 'passed' : 'failed', exitCode: fetch.status, signal: fetch.signal }));
	if (fetch.status !== 0) {
		throw new Error('Fetching the exact pinned baseline object failed; no branch substitution or source comparison is allowed');
	}
	const fetched = spawnSync('git', ['-C', root, 'rev-parse', '--verify', `${baseline}^{commit}`], { encoding: 'utf8', timeout: 60_000 });
	assert.equal(fetched.status, 0, 'Fetched baseline commit is unavailable');
	assert.equal(fetched.stdout.trim(), baseline, 'Fetch must provide the exact immutable baseline commit');
}

function verifySource(allowFetch: boolean): Record<string, string> {
	verifyBaseline(allowFetch);
	assert.ok(!fs.existsSync(path.join(root, '.build/distro')), 'OSS-only probe must not contain distro input or cache');
	const manifest: Record<string, string> = {};
	for (const file of manifestFiles) {
		const expected = spawnSync('git', ['-C', root, 'show', `${baseline}:${file}`]);
		assert.equal(expected.status, 0, `Pinned baseline commit is present but its file is unavailable: ${file}`);
		assert.ok(fs.existsSync(path.join(root, file)), `Current checkout file is missing: ${file}`);
		const actual = fs.readFileSync(path.join(root, file));
		assert.ok(actual.equals(expected.stdout), `Historical source input changed: ${file}`);
		manifest[file] = fileHash(path.join(root, file));
	}
	const unchanged = spawnSync('git', ['-C', root, 'diff', '--quiet', baseline, '--', 'src', 'extensions', 'remote']);
	assert.equal(unchanged.status, 0, 'Historical implementation, assertions, captures, and provider dependencies must be unchanged');
	const product: { applicationName: string; serverApplicationName: string; electronArtifactFeed?: string; nodejsArtifactFeed?: string } = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
	assert.equal(product.applicationName, 'code-oss');
	assert.equal(product.serverApplicationName, 'code-server-oss');
	assert.equal(product.electronArtifactFeed, '');
	assert.equal(product.nodejsArtifactFeed, '');
	const checksum = fs.readFileSync(path.join(root, 'build/checksums/electron.txt'), 'utf8');
	assert.ok(checksum.includes(`${electronArchive} *electron-v${electronVersion}-linux-x64.zip`));
	console.log(JSON.stringify({ gate: 'historical-oss-source', baseline, manifest }));
	return manifest;
}

function verifyNative(): void {
	assert.equal(process.platform, 'linux');
	assert.equal(process.arch, 'x64');
	assert.equal(os.machine(), 'x86_64');
	assert.ok(!fs.existsSync('/run/rosetta'));
	assert.ok(!fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(), 'Never use shared or symlinked dependencies');
	assert.ok(!fs.existsSync(path.join(root, '.build/node_modules_cache')), 'No dependency-cache archive may be restored for this round');
	const freshCache = process.env.AGENT_HOST_OSS_FRESH_CACHE;
	assert.ok(freshCache && process.env.RUNNER_TEMP && process.env.GITHUB_RUN_ID && process.env.GITHUB_RUN_ATTEMPT, 'Require the owned per-run cache receipt');
	const expectedCache = path.join(process.env.RUNNER_TEMP, `oss-holder-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
	assert.equal(fs.realpathSync(freshCache), fs.realpathSync(expectedCache));
	assert.equal(process.env.XDG_CACHE_HOME, freshCache);
	assert.equal(process.env.npm_config_cache, path.join(freshCache, 'npm'));
	for (const key of Object.keys(process.env)) {
		assert.ok(!/(?:electron_)(?:mirror|nightly_?mirror|custom_?dir|custom_?filename|custom_?version)$/i.test(key) || !process.env[key], `Unexpected asset override: ${key}`);
	}
	const lock: { packages: Record<string, { version: string; integrity: string }> } = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
	assert.equal(process.env.NODE_MODULES_CACHE_KEY, 'fresh-uncached-oss-linux-x64');
	const versions: Record<string, string> = { '@github/copilot-sdk': '1.0.18-preview.5', '@github/copilot-sdk-linux-x64': '1.0.18-preview.5', '@anthropic-ai/claude-agent-sdk': '0.3.281', '@anthropic-ai/claude-agent-sdk-linux-x64': '0.3.281', '@openai/codex': '0.157.0', '@openai/codex-linux-x64': '0.157.0-linux-x64', '@vscode/sqlite3': '5.1.12-vscode', 'node-pty': '1.2.0-beta.15' };
	const packageIntegrity: Record<string, string> = {};
	for (const [name, version] of Object.entries(versions)) {
		const installed: { version: string } = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
		assert.equal(installed.version, version, `Unexpected installed package: ${name}`);
		assert.equal(lock.packages[`node_modules/${name}`].version, version);
		assert.ok(lock.packages[`node_modules/${name}`].integrity);
		packageIntegrity[name] = lock.packages[`node_modules/${name}`].integrity;
	}
	const executable = path.join(root, '.build/electron/code-oss');
	fs.accessSync(executable, fs.constants.X_OK);
	assert.equal(fileHash(executable), electronExecutable);
	assert.equal(fileHash(path.join(root, '.build/typings/electron.d.ts')), electronTypes);
	const headerRoot = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'node-gyp', electronVersion, 'include/node');
	const headers = hashes(headerRoot);
	assert.ok(/^#define\s+NODE_MODULE_VERSION\s+148\b/m.test(fs.readFileSync(path.join(headerRoot, 'node_version.h'), 'utf8')), 'Downloaded Electron headers must match the reviewed ABI');
	for (const name of ['v8config.h', 'v8-source-location.h']) {
		assert.equal(fileHash(path.join(headerRoot, name)), fileHash(path.join(root, 'build/npm/gyp/custom-headers', name)), `Pinned OSS header patch must be applied: ${name}`);
	}
	const libcxx: Record<string, string> = {};
	for (const directory of ['.build/libcxx-objects', '.build/libcxx_headers/include', '.build/libcxxabi_headers/include']) {
		Object.assign(libcxx, hashes(path.join(root, directory)));
	}
	fileHash(path.join(root, '.build/libcxx-objects/libc++.a'));
	const nativeAssets = hashes(path.join(root, 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64'));
	assert.equal(nativeAssets[path.join(root, 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime')], 'b5b63ed114adf8526264dcbfd6ab73301e1a5624c7092ff829cacbf71e0db130');
	assert.equal(nativeAssets[path.join(root, 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/runtime.node')], '217f291e2a46844de541329a87307d98d3cbd9062af042016671ea783497048e');
	fs.writeFileSync(path.join(logs, 'oss-native-inputs.json'), JSON.stringify({ kernel: os.release(), architecture: os.machine(), versions, packageIntegrity, nodeModulesCacheKey: process.env.NODE_MODULES_CACHE_KEY, electronZipExpectedSha256: electronArchive, executableSha256: electronExecutable, typesSha256: electronTypes, headers, libcxx, nativeAssets }));
	for (const entrypoint of entrypoints) {
		fileHash(path.join(root, `out/vs/platform/agentHost/test/node/e2e/${entrypoint.file}.integrationTest.js`));
	}
	fileHash(path.join(root, 'out/vs/nls.js'));
	fileHash(path.join(root, 'out/vs/platform/agentHost/node/agentHostServerMain.js'));
	assert.equal(run('native-electron-sqlite-pty-abi', executable, ['-e', `
		const assert = require('node:assert/strict');
		assert.equal(process.versions.electron, '${electronVersion}');
		assert.equal(process.versions.modules, '148');
		require('@vscode/sqlite3'); require('node-pty');
		const nativeFiles = Object.fromEntries(Object.keys(require.cache).filter(file => file.endsWith('.node')).map(file => [file, require('crypto').createHash('sha256').update(require('fs').readFileSync(file)).digest('hex')]));
		console.log(JSON.stringify({ gate: 'native-abi', versions: process.versions, nativeFiles }));
	`], { ...process.env, ELECTRON_RUN_AS_NODE: '1' }), 0);
}

function main(): void {
	fs.mkdirSync(logs, { recursive: true });
	if (process.argv[2] === '--fresh-source-only') {
		for (const directory of ['node_modules', 'build/node_modules', 'remote/node_modules', '.build/node_modules_cache', '.build/electron', '.build/typings', '.build/libcxx-objects', '.build/libcxx_headers', '.build/libcxxabi_headers', 'out']) {
			assert.ok(!fs.existsSync(path.join(root, directory)), `Fresh worker input must not preexist: ${directory}`);
		}
	}
	const source = verifySource(process.argv[2] === '--fresh-source-only');
	if (process.argv[2] === '--source-only' || process.argv[2] === '--fresh-source-only') {
		return;
	}
	activeGate = 'native-inputs';
	reportPhase(activeGate, 'started');
	verifyNative();
	const registrationValidator: {
		readRegistrationReceipt(output: string, module: string, title: string): { module: string; total: number; suites: { title: string; tests: number }[] };
		verifyMissingReceipt(output: string, module: string, title: string): void;
	} = require('./ossRegistrationContract.ts');
	fs.writeFileSync(path.join(logs, 'oss-source-inputs.json'), JSON.stringify(source));
	const home = fs.mkdtempSync('/tmp/agent-host-oss-probe-');
	const registration = path.join(root, 'test/unit/electron/ossRegistration.ts');
	const registrationContract = path.join(root, 'test/unit/electron/ossRegistrationContract.ts');
	const copies: string[] = [];
	try {
		const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: '/tmp', TMP: '/tmp', TEMP: '/tmp' };
		for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT', 'GITHUB_COPILOT_API_TOKEN', 'VSCODE_COPILOT_CHAT_TOKEN', 'SYSTEM_ACCESSTOKEN', 'AZURE_DEVOPS_EXT_PAT', 'COPILOT_HOME', 'COPILOT_SKILLS_DIRS', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'COPILOT_API_URL', 'COPILOT_DEBUG_GITHUB_API_URL', 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) {
			delete env[key];
		}
		for (const key of ['AGENT_HOST_REPLAY_RECORD', 'AGENT_HOST_UPDATE_AHP_SNAPSHOTS', 'AGENT_HOST_UPDATE_SNAPSHOTS']) {
			assert.notEqual(env[key], '1', 'Do not record or mutate fixtures');
		}
		for (const [source, destination] of [[path.join(__dirname, 'ossRegistration.ts'), registration], [path.join(__dirname, 'ossRegistrationContract.ts'), registrationContract]]) {
			assert.ok(!fs.existsSync(destination), 'Do not overwrite a bootstrap file');
			fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
			copies.push(destination);
		}
		for (const entrypoint of entrypoints) {
			const resultFile = path.join(home, path.basename(entrypoint.file) + '.json');
			const module = `src/vs/platform/agentHost/test/node/e2e/${entrypoint.file}.integrationTest.ts`;
			const prefix = `ossRegistration-${process.pid}-${path.basename(entrypoint.file)}`;
			const generated = ['main.js', 'html', 'renderer.js'].map(extension => path.join(root, 'test/unit/electron', `${prefix}.${extension}`));
			for (const file of generated) {
				assert.ok(!fs.existsSync(file), 'Do not overwrite an existing generated bootstrap');
			}
			assert.equal(run(`register:${entrypoint.file}`, path.join(root, '.build/electron/code-oss'), [registration, '--run', module, '--grep', '^(?!)$', '--crash-reporter-directory', path.join(root, '.build/crashes')], { ...env, AGENT_HOST_OSS_REGISTRATION_OUTPUT: resultFile, AGENT_HOST_OSS_REGISTRATION_MODULE: module, AGENT_HOST_OSS_REGISTRATION_TITLE: entrypoint.title, AGENT_HOST_OSS_REGISTRATION_PREFIX: prefix }), 0);
			const result = registrationValidator.readRegistrationReceipt(resultFile, module, entrypoint.title);
			assert.ok(result.suites.some(suite => suite.title === entrypoint.title && Number.isInteger(suite.tests) && suite.tests > 0), `No real registered tests for ${entrypoint.file}`);
			fs.copyFileSync(resultFile, path.join(logs, path.basename(resultFile)));
			for (const file of generated) {
				assert.ok(!fs.existsSync(file), 'Owned registration bootstrap cleanup did not finish');
			}
		}
		if (process.argv[2] === '--registration-only') {
			const module = `src/vs/platform/agentHost/test/node/e2e/${entrypoints[0].file}.integrationTest.ts`;
			const output = path.join(home, 'stock-no-receipt.json');
			assert.equal(run('registration-no-receipt-control', path.join(root, '.build/electron/code-oss'), [path.join(root, 'test/unit/electron/index.js'), '--run', module, '--grep', '^(?!)$', '--crash-reporter-directory', path.join(root, '.build/crashes')], env), 0);
			registrationValidator.verifyMissingReceipt(output, module, entrypoints[0].title);
			const receipt = { gate: 'registration-only', result: 'passed', registeredModules: entrypoints.length, missingReceiptControl: 'ENOENT', agentHostCasesExecuted: 0, workloadIterations: 0 };
			fs.writeFileSync(path.join(logs, 'oss-registration-only.json'), JSON.stringify(receipt), { flag: 'wx' });
			console.log(JSON.stringify(receipt));
			return;
		}
		assert.equal(run('real-native-procfs-calibration', 'bash', [path.join(__dirname, 'tmpfs.sh'), process.execPath, path.join(__dirname, 'ossHolderObserver.ts'), '--calibrate'], env), 0);
		const directory = path.join(root, 'src/vs/platform/agentHost/test/node/e2e/captures');
		const before = hashes(directory);
		fs.writeFileSync(path.join(logs, 'oss-fixtures-before.json'), JSON.stringify(before));
		try {
			for (let iteration = 1; iteration <= 2; iteration++) {
				const status = run(`strict-split-iteration:${iteration}`, process.execPath, [path.join(__dirname, 'runner.ts'), '--storage', 'split', '--jobs', '5', '--tfs', `OSS Holder Probe ${iteration}`], { ...env, AGENT_HOST_OSS_HOLDER_OBSERVER: '1' });
				fs.writeFileSync(path.join(logs, `oss-iteration-${iteration}.json`), JSON.stringify({ iteration, status }));
				if (status !== 0) {
					process.exitCode = status;
					return;
				}
			}
		} finally {
			activeGate = 'owned-cleanup';
			const after = hashes(directory);
			fs.writeFileSync(path.join(logs, 'oss-fixtures-after.json'), JSON.stringify(after));
			assert.deepEqual(after, before, 'Strict replay must not change fixtures');
		}
	} finally {
		for (const file of copies) {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file);
			}
		}
		fs.rmSync(home, { recursive: true, force: true });
	}
}

try {
	main();
} catch (error) {
	const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
	const errorClass = error instanceof assert.AssertionError ? 'AssertionError' : error instanceof SyntaxError ? 'SyntaxError' : code && ['ENOENT', 'EACCES', 'EEXIST', 'EIO', 'ENOSPC'].includes(code) ? code : 'Error';
	reportPhase(activeGate, 'failed', 1, undefined, errorClass);
	console.error(error);
	process.exitCode = 1;
}
