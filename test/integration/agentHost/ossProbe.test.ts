/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const nodeCrypto: typeof import('node:crypto') = require('node:crypto');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { test }: typeof import('node:test') = require('node:test');
const yaml: { load(text: string): unknown } = require('js-yaml');

interface IWorkflow {
	on: { push?: { branches: string[] }; workflow_dispatch?: object; workflow_call?: { inputs: Record<string, { type: string; default?: boolean }> } };
	permissions?: object;
	jobs: Record<string, { uses?: string; with?: Record<string, string | boolean>; 'runs-on'?: string; 'timeout-minutes'?: string; steps?: { name: string; run?: string; if?: string; with?: Record<string, string> }[] }>;
}

const root = path.resolve(__dirname, '../../..');

test('one exact-branch push native job reuses the existing OSS workflow without default-branch registration', () => {
	const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/tmpfs-holder-oss-probe.yml'), 'utf8')) as IWorkflow;
	assert.deepEqual(Object.keys(workflow.on), ['push']);
	assert.deepEqual(workflow.on.push, { branches: ['roblou/agents/tmpfs-holder-oss-native-20261011'] });
	assert.deepEqual(Object.keys(workflow.jobs), ['holder']);
	assert.deepEqual(workflow.jobs.holder, {
		uses: './.github/workflows/pr-linux-test.yml',
		with: { job_name: 'Native OSS registration contract verification', electron_tests: true, browser_tests: false, remote_tests: false, unit_tests: false, integration_tests: true, smoke_tests: false, holder_probe: true, holder_registration_only: true },
	});
	assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read' });
});

test('reusable recipe keeps normal behavior and isolates probe cache and 50/30-minute execution limits', () => {
	const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/pr-linux-test.yml'), 'utf8')) as IWorkflow;
	assert.deepEqual(workflow.on.workflow_call?.inputs.holder_probe, { type: 'boolean', default: false });
	assert.deepEqual(workflow.on.workflow_call?.inputs.holder_registration_only, { type: 'boolean', default: false });
	const job = workflow.jobs['linux-test'];
	assert.equal(job['runs-on'], 'ubuntu-24.04');
	assert.equal(job['timeout-minutes'], '${{ inputs.holder_probe && 50 || 360 }}');
	const normal = job.steps!.find(step => step.name === '🧪 Run integration tests (Electron)');
	assert.ok(normal?.if?.includes('!inputs.holder_probe'));
	assert.equal(normal?.run, './scripts/test-integration.sh --tfs "Integration Tests"');
	const probe = job.steps!.find(step => step.name === 'Verify native OSS inputs and run holder probe');
	assert.equal(probe?.if, '${{ inputs.holder_probe }}');
	assert.equal(probe?.run, 'node test/integration/agentHost/ossProbe.ts${{ inputs.holder_registration_only && \' --registration-only\' || \'\' }}');
	const raw = fs.readFileSync(path.join(root, '.github/workflows/pr-linux-test.yml'), 'utf8');
	assert.ok(raw.includes('timeout-minutes: 30\n        run: node test/integration/agentHost/ossProbe.ts'));
	for (const name of ['Restore node_modules cache', 'Restore built-in extensions cache', 'Setup Electron', 'Prepare built-in extensions cache key', 'Download built-in extensions', 'Transpile client and extensions', 'Compile extensions for integration tests & smoke tests']) {
		assert.ok(job.steps!.find(step => step.name === name)?.if?.includes('!inputs.holder_probe'), `Probe must not restore cache through ${name}`);
	}
	assert.equal(job.steps!.find(step => step.name === 'Prepare public Electron without cache restore')?.run, 'npm run electron -- x64');
	assert.equal(job.steps!.find(step => step.name === 'Transpile client for holder probe')?.run, 'npm run gulp transpile-client-esbuild');
	assert.equal(job.steps!.find(step => step.name === 'Install fresh OSS build dependencies for holder probe')?.run, 'npm ci');
	assert.equal(job.steps!.find(step => step.name === 'Install fresh OSS dependencies for holder probe')?.run, 'set -e\nsource ./build/azure-pipelines/linux/setup-env.sh\nnpm ci\n');
	assert.ok(raw.includes('NODE_MODULES_CACHE_KEY=fresh-uncached-oss-linux-x64'));
	assert.ok(!/download-distro|mixin-quality|downloadCopilotVsix|product-build-linux-ci/.test(raw));
});

test('holder_probe false preserves every original normal step, command, environment, action, and effective default timeout', () => {
	const baselineResult = spawnSync('git', ['-C', root, 'show', '114d61e889475758fd1c3b3fcbdd04e9717940c4:.github/workflows/pr-linux-test.yml'], { encoding: 'utf8' });
	assert.equal(baselineResult.status, 0, baselineResult.stderr);
	const original = yaml.load(baselineResult.stdout) as IWorkflow;
	const candidate = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/pr-linux-test.yml'), 'utf8')) as IWorkflow;
	delete candidate.on.workflow_call!.inputs.holder_probe;
	delete candidate.on.workflow_call!.inputs.holder_registration_only;
	const job = candidate.jobs['linux-test'];
	job['timeout-minutes'] = '360';
	original.jobs['linux-test']['timeout-minutes'] = '360';
	const normalize = (condition: string | undefined): string | undefined => {
		if (!condition) {
			return undefined;
		}
		let result = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/ && !inputs\.holder_probe/g, '').trim();
		if (result === '!inputs.holder_probe') {
			return undefined;
		}
		if (result.startsWith('(') && result.endsWith(')')) {
			result = result.slice(1, -1);
		}
		return result;
	};
	job.steps = job.steps!.filter(step => step.if !== '${{ inputs.holder_probe }}');
	for (const workflow of [candidate, original]) {
		for (const step of workflow.jobs['linux-test'].steps!) {
			const condition = normalize(step.if);
			if (condition) {
				step.if = condition;
			} else {
				delete step.if;
			}
		}
	}
	assert.deepEqual(candidate, original);
});

test('historical source input gate succeeds without reading or mutating shared node_modules', () => {
	const result = spawnSync(process.execPath, [path.join(__dirname, 'ossProbe.ts'), '--source-only'], { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	const source = JSON.parse(result.stdout);
	assert.equal(source.baseline, '114d61e889475758fd1c3b3fcbdd04e9717940c4');
	assert.equal(source.manifest['build/checksums/electron.txt'], 'db0d5b3a22eec49beeb718942448022ad9448c100d7bb09c1ade01cd9ccffb3b');
	assert.ok(source.manifest['build/npm/electronTypes.ts']);
	assert.ok(source.manifest['build/linux/libcxx-fetcher.ts']);
});

test('fresh-worker gate rejects inherited dependencies before any build or workload', () => {
	const result = spawnSync(process.execPath, [path.join(__dirname, 'ossProbe.ts'), '--fresh-source-only'], { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 1);
	assert.ok(result.stderr.includes('Fresh worker input must not preexist: node_modules'));
});

test('reviewed public archive and checksum manifests remain internally consistent with historical OSS', () => {
	const directory = process.env.AGENT_HOST_PUBLIC_ARTIFACT_DIRECTORY;
	assert.ok(directory, 'Supply the independently fetched public artifact evidence directory');
	const zip = path.join(directory, 'electron-v43.7.7-linux-x64.zip');
	assert.equal(fs.statSync(zip).size, 127045472);
	assert.equal(nodeCrypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'), '4d0a48398c444258dbcf2f5f83b49ca5bc53583130f354e0c299dad5b22b5271');
	const official = fs.readFileSync(path.join(directory, 'SHASUMS256.txt'), 'utf8').trim();
	assert.equal(official, fs.readFileSync(path.join(root, 'build/checksums/electron.txt'), 'utf8').trim());
	assert.ok(official.includes('d78a11ef458b68672c35957f0252396a1fa19e73a8ca3b9178e2e75cd090453d *electron.d.ts'));
	for (const artifact of ['libcxx_headers.zip', 'libcxxabi_headers.zip', 'libcxx-objects-v43.7.7-linux-x64.zip']) {
		assert.ok(official.includes(artifact));
	}
	const nodeSums = fs.readFileSync(path.join(directory, 'node-24.21.0-SHASUMS256.txt'), 'utf8');
	assert.ok(nodeSums.includes('6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff  node-v24.21.0-linux-x64.tar.gz'));
	assert.ok(fs.readFileSync(path.join(root, 'build/npm/electronTypes.ts'), 'utf8').includes('https://github.com/electron/electron/releases/download/'));
});

test('full workload is strictly gated by individual registrations and ownership calibration, not zero exit alone', () => {
	const source = fs.readFileSync(path.join(__dirname, 'ossProbe.ts'), 'utf8');
	assert.ok(source.indexOf('verifyNative();') < source.indexOf('register:${entrypoint.file}'));
	assert.ok(source.indexOf('No real registered tests') < source.indexOf('real-native-procfs-calibration'));
	assert.ok(source.indexOf('real-native-procfs-calibration') < source.indexOf('strict-split-iteration'));
	assert.ok(source.includes('suite.tests > 0'));
	assert.ok(source.includes('\'--storage\', \'split\', \'--jobs\', \'5\''));
	assert.ok(source.includes('iteration <= 2'));
	assert.ok(source.includes('Strict replay must not change fixtures'));
	const observer = fs.readFileSync(path.join(__dirname, 'ossHolderObserver.ts'), 'utf8');
	assert.ok(!/cmdline|environ|\.kill\(/.test(observer));
	assert.ok(observer.includes('Observer must identify the exact owned control PID'));
});

test('original service-time cancellation guard validates only the owned run and rejects deadline resets', () => {
	const result = spawnSync(process.execPath, [path.join(__dirname, 'ossWatch.ts'), '--self-test'], { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes('original +55/+60-minute bounds'));
});
