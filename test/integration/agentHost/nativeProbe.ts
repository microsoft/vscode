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

interface IRegistration {
	total: number;
	suites: { title: string; tests: number }[];
}

const root = path.resolve(__dirname, '../../..');
const logs = path.join(root, '.build/logs/integration-tests');
fs.mkdirSync(logs, { recursive: true });

function run(gate: string, command: string, args: readonly string[], environment = process.env): number {
	console.log(JSON.stringify({ gate, result: 'started' }));
	const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	const status = result.status ?? 1;
	console.log(JSON.stringify({ gate, result: status === 0 ? 'passed' : 'failed', status, signal: result.signal }));
	return status;
}

function fixtureHashes(directory: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			Object.assign(result, fixtureHashes(file));
		} else if (entry.isFile()) {
			result[path.relative(root, file)] = nodeCrypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
		}
	}
	return result;
}

function main(): void {
	assert.equal(process.platform, 'linux');
	assert.equal(process.arch, 'x64');
	assert.equal(os.machine(), 'x86_64');
	console.log(JSON.stringify({ gate: 'native-worker-platform', kernel: os.release(), architecture: os.machine() }));
	for (const key of ['BUILDS_API_URL', 'BUILD_BUILDID', 'BUILD_ARTIFACTSTAGINGDIRECTORY', 'DISPLAY', 'NPM_ARCH', 'VSCODE_ARCH', 'VSCODE_REMOTE_SERVER_PATH', 'INTEGRATION_TEST_ELECTRON_PATH']) {
		assert.ok(process.env[key], `Standard LinuxIntegration input is missing: ${key}`);
	}
	assert.ok(new URL(process.env.BUILDS_API_URL!).pathname.endsWith(`/_apis/build/builds/${process.env.BUILD_BUILDID}/`), 'VSIX consumer must address its own build');
	for (const key of ['AGENT_HOST_REPLAY_RECORD', 'AGENT_HOST_UPDATE_AHP_SNAPSHOTS', 'AGENT_HOST_UPDATE_SNAPSHOTS']) {
		assert.notEqual(process.env[key], '1', `Strict replay requires ${key} to be disabled`);
	}
	assert.equal(run('packaged-compiler-inputs', process.execPath, [path.join(__dirname, 'preflight.ts')]), 0);
	assert.equal(run('public-native-runtime', process.execPath, [path.join(__dirname, 'publicRuntime.ts'), '--verify']), 0);

	const directory = fs.mkdtempSync('/tmp/agent-host-native-preflight-');
	const registrationEntry = path.join(root, 'test/unit/electron/agentHostRegistration.ts');
	let registrationCopied = false;
	const entrypoints = [
		{ file: 'conformance/agentHostConformance', title: 'Agent Host E2E \u2014 Conformance' },
		{ file: 'providers/claudeAgentHostE2E', title: 'Agent Host E2E \u2014 Claude' },
		{ file: 'providers/codexAgentHostE2E', title: 'Agent Host E2E \u2014 Codex' },
		{ file: 'providers/copilotAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot' },
		{ file: 'providers/copilotOtelAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot managed telemetry' },
		{ file: 'providers/copilotManagedSettingsAgentHostE2E', title: 'Agent Host E2E \u2014 Copilot managed-settings diagnostics' },
	];
	try {
		const environment: NodeJS.ProcessEnv = { ...process.env, HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: path.join(directory, '.config'), TMPDIR: '/tmp', TMP: '/tmp', TEMP: '/tmp' };
		for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT', 'GITHUB_COPILOT_API_TOKEN', 'VSCODE_COPILOT_CHAT_TOKEN', 'SYSTEM_ACCESSTOKEN', 'AZURE_DEVOPS_EXT_PAT', 'COPILOT_HOME', 'COPILOT_SKILLS_DIRS', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'COPILOT_API_URL', 'COPILOT_DEBUG_GITHUB_API_URL', 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE', 'NODE_OPTIONS']) {
			delete environment[key];
		}
		const product: { applicationName: string } = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
		const executable = path.join(root, '.build/electron', product.applicationName);
		assert.ok(!fs.existsSync(registrationEntry), 'Registration helper must not overwrite an existing file');
		fs.copyFileSync(path.join(__dirname, 'registration.ts'), registrationEntry);
		registrationCopied = true;
		for (const entrypoint of entrypoints) {
			const output = path.join(directory, path.basename(entrypoint.file) + '.json');
			const status = run(`register:${entrypoint.file}`, executable, [
				registrationEntry,
				'--build', '--run', `src/vs/platform/agentHost/test/node/e2e/${entrypoint.file}.integrationTest.ts`, '--grep', '^(?!)$',
				'--crash-reporter-directory', path.join(root, '.build/crashes'),
			], { ...environment, AGENT_HOST_REGISTRATION_OUTPUT: output });
			assert.equal(status, 0, `Entrypoint failed to load: ${entrypoint.file}`);
			assert.ok(fs.existsSync(output), `No actual registration result for ${entrypoint.file}`);
			const registration: IRegistration = JSON.parse(fs.readFileSync(output, 'utf8'));
			assert.ok(registration.suites.some(suite => suite.title === entrypoint.title && Number.isInteger(suite.tests) && suite.tests > 0), `Entrypoint registered no expected tests: ${entrypoint.file}`);
			fs.copyFileSync(output, path.join(logs, path.basename(entrypoint.file) + '-registration.json'));
		}
		assert.equal(run('native-procfs-fuser-calibration', 'bash', [path.join(__dirname, 'tmpfs.sh'), process.execPath, path.join(__dirname, 'holderProbe.ts'), '--self-test'], environment), 0);
		const captures = path.join(root, 'src/vs/platform/agentHost/test/node/e2e/captures');
		const before = fixtureHashes(captures);
		fs.writeFileSync(path.join(logs, 'native-fixtures-before.json'), JSON.stringify(before));
		try {
			for (let iteration = 1; iteration <= 2; iteration++) {
				const status = run(`full-strict-split-iteration:${iteration}`, process.execPath, [
					path.join(__dirname, 'runner.ts'), '--storage', 'split', '--jobs', '5', '--build', '--tfs', `Native Holder Probe ${iteration}`,
				], { ...environment, AGENT_HOST_E2E_HOLDER_PROBE: '1' });
				fs.writeFileSync(path.join(logs, `native-iteration-${iteration}.json`), JSON.stringify({ iteration, status, timestamp: new Date().toISOString() }));
				if (status !== 0) {
					process.exitCode = status;
					return;
				}
			}
		} finally {
			const after = fixtureHashes(captures);
			fs.writeFileSync(path.join(logs, 'native-fixtures-after.json'), JSON.stringify(after));
			assert.deepEqual(after, before, 'Strict replay must not change committed fixtures');
		}
	} finally {
		if (registrationCopied) {
			fs.unlinkSync(registrationEntry);
		}
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

main();
