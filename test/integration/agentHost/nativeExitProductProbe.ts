/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNativeExitRecord, type INativeExitRecord } from './nativeExitObserver.ts';
import { runParallelWorkload } from './nativeExitParallelWorkload.ts';

const root = resolve(process.env['BUILD_SOURCESDIRECTORY'] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const scratch = join(root, '.build', 'native-exit-probe');
const expectedSdk = '1.0.18-preview.1';
const expectedRuntimeSource = '44097658e184184613f404efe56e6c4d3a991656';
const expectedNativeHash = 'bed3e96202afd0aa63f56b477e5d5f559b482daab41b4e8b05cf4c625e364839';
const testFile = 'src/vs/platform/agentHost/test/node/e2e/providers/copilotOtelAgentHostE2E.integrationTest.ts';
const testTitle = 'Agent Host E2E — Copilot managed telemetry managed resource attributes override conflicts and retain unrelated environment attributes';
type Check = 'sourceInput' | 'sdkPin' | 'nativeHash' | 'productInput' | 'compilerInput' | 'testResult' | 'observerCoverage' | 'nativeExit' | 'cleanup' | 'deadline' | 'probeFailure';
function status(check: Check, pass: boolean, iteration = 0): void {
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), check, pass, iteration }) + '\n');
	assert.ok(pass);
}
function fingerprint(kind: 'runtime' | 'ciElectron' | 'packagedElectron', sha256: string): void {
	assert.match(sha256, /^[a-f0-9]{64}$/);
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), kind, sha256 }) + '\n');
}
function hash(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function json(path: string): Record<string, unknown> {
	const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
	return object(value);
}
function object(value: unknown): Record<string, unknown> {
	assert.ok(value !== null && typeof value === 'object');
	return Object.fromEntries(Object.entries(value));
}
async function runIteration(iteration: number, runtime: string, bootstrap: string, packagedApp: string, ciElectronHash: string): Promise<void> {
	const recordsPath = join(scratch, `lifecycle-${iteration}.jsonl`);
	writeFileSync(recordsPath, '');
	let output = '';
	let overflow = false;
	let deadlineExceeded = false;
	const child = spawn('cmd.exe', ['/d', '/s', '/c', 'scripts\\test-integration.bat', '--build', '--run', testFile, '--grep', '^' + testTitle + '$', '--reporter', 'json', '--bail'], {
		cwd: root,
		env: {
			...process.env,
			INTEGRATION_TEST_ELECTRON_PATH: packagedApp,
			VSCODE_SKIP_PRELAUNCH: '1',
			AGENT_HOST_NATIVE_EXIT_BOOTSTRAP: bootstrap,
			AGENT_HOST_NATIVE_EXIT_RECORDS: recordsPath,
			AGENT_HOST_NATIVE_EXIT_RUNTIME: runtime,
			AGENT_HOST_REPLAY_RECORD: undefined,
			AGENT_HOST_UPDATE_SNAPSHOTS: undefined,
			AGENT_HOST_UPDATE_AHP_SNAPSHOTS: undefined,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	});
	for (const stream of [child.stdout, child.stderr]) {
		stream.on('data', (data: Buffer) => {
			output += data.toString();
			if (output.length > 16 * 1024 * 1024) {
				overflow = true;
				child.kill();
			}
		});
	}
	let terminating: Promise<void> | undefined;
	const timeout = setTimeout(() => {
		deadlineExceeded = true;
		if (child.pid !== undefined) {
			const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
			terminating = new Promise<void>((done, reject) => {
				cleanup.once('error', reject);
				cleanup.once('exit', code => code === 0 ? done() : reject(new Error('Probe cleanup failed')));
			});
		}
	}, 180_000);
	const exitCode = await new Promise<number | null>((done, reject) => {
		child.once('error', reject);
		child.once('close', done);
	}).finally(() => clearTimeout(timeout));
	await terminating;
	const records: INativeExitRecord[] = readFileSync(recordsPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
		const value: unknown = JSON.parse(line);
		validateNativeExitRecord(value);
		process.stdout.write(JSON.stringify(value) + '\n');
		return value;
	});
	status('deadline', !deadlineExceeded && !overflow, iteration);
	status('observerCoverage', records.some(record => record.event === 'observerReady')
		&& records.filter(record => record.event === 'observerReady').every(record => record.hostSha256 === ciElectronHash && record.nativeSha256 === expectedNativeHash && record.sdkVersion === expectedSdk)
		&& records.filter(record => record.event === 'spawn').length === 1
		&& records.filter(record => record.event === 'spawn').every(record => record.clientInstance > 0), iteration);
	status('nativeExit', records.every(record => record.event !== 'exit' || record.unexpected === false), iteration);
	status('cleanup', records.filter(record => record.event === 'close').length === records.filter(record => record.event === 'spawn').length, iteration);
	const candidates = [...output.matchAll(/\{\s*"stats"\s*:/g)];
	const start = candidates.at(-1)?.index;
	const end = output.lastIndexOf('}');
	let reported: unknown;
	if (start !== undefined && end >= start) {
		reported = JSON.parse(output.slice(start, end + 1));
	}
	assert.ok(reported !== null && typeof reported === 'object');
	const result: Record<string, unknown> = Object.fromEntries(Object.entries(reported));
	assert.ok(result.stats !== null && typeof result.stats === 'object' && Array.isArray(result.passes));
	const stats: Record<string, unknown> = Object.fromEntries(Object.entries(result.stats));
	status('testResult', exitCode === 0 && stats.tests === 1 && stats.passes === 1 && stats.failures === 0 && result.passes.length === 1
		&& result.passes.every(pass => object(pass).fullTitle === testTitle), iteration);
}
async function main(): Promise<void> {
	if (process.argv.includes('--help')) {
		process.stdout.write('Usage: nativeExitProductProbe.ts --run|--parallel <new-packaged-app-root>\n--run executes 20 strict fresh managed-resource cases. --parallel runs the unchanged original six-suite runner once with six workers and preceding OTel cases. Unexpected native exit is fatal; only structural lifecycle/provenance and suite counts are emitted. The packaged input is verified separately, not assumed to be the test host executable.\n');
		return;
	}
	assert.ok((process.argv[2] === '--run' || process.argv[2] === '--parallel') && process.argv[3]);
	status('sourceInput', process.platform === 'win32' && process.arch === 'x64');
	mkdirSync(scratch, { recursive: true });
	const sourcePackage = json(join(root, 'package.json'));
	const sourceRemote = json(join(root, 'remote', 'package.json'));
	const sourceDependencies = object(sourcePackage.dependencies);
	const remoteDependencies = object(sourceRemote.dependencies);
	status('sdkPin', sourceDependencies['@github/copilot-sdk'] === expectedSdk && remoteDependencies['@github/copilot-sdk'] === expectedSdk);
	const require = createRequire(import.meta.url);
	const runtime = require.resolve('@github/copilot-sdk-win32-x64/prebuilds/win32-x64/copilot-runtime.exe');
	const sdkEntry = require.resolve('@github/copilot-sdk');
	const sdkPackage = json(join(dirname(sdkEntry), '../../package.json'));
	const runtimeMetadata = object(sdkPackage.copilotRuntime);
	status('sdkPin', sdkPackage.version === expectedSdk && runtimeMetadata.sourceSha === expectedRuntimeSource && runtimeMetadata.version === '1.0.94-1');
	const nativeHash = hash(runtime);
	fingerprint('runtime', nativeHash);
	status('nativeHash', nativeHash === expectedNativeHash);
	const appRoot = resolve(process.argv[3]);
	const candidates = [join(appRoot, 'resources', 'app'), ...[process.env['BUILD_SOURCEVERSION']?.slice(0, 10)].filter(Boolean).map(prefix => join(appRoot, prefix!, 'resources', 'app'))];
	const app = candidates.find(path => existsSync(join(path, 'product.json')));
	status('productInput', app !== undefined);
	const product = json(join(app!, 'product.json'));
	const builtPackage = json(join(app!, 'package.json'));
	const copilotVersions = object(product.copilotVersions);
	status('productInput', product.commit === process.env['BUILD_SOURCEVERSION']
		&& builtPackage.version === product.version
		&& (builtPackage.version === sourcePackage.version || builtPackage.version === String(sourcePackage.version) + '-insider')
		&& copilotVersions.sdk === expectedSdk && copilotVersions.runtime === '1.0.94-1');
	assert.ok(typeof product.commit === 'string' && /^[a-f0-9]{40}$/.test(product.commit));
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), sourceCommit: product.commit, productCommit: product.commit }) + '\n');
	const appName = product.nameShort;
	assert.ok(typeof appName === 'string');
	const packagedExecutable = join(appRoot, appName + '.exe');
	const ciExecutable = join(root, '.build', 'electron', appName + '.exe');
	fingerprint('packagedElectron', hash(packagedExecutable));
	const ciElectronHash = hash(ciExecutable);
	fingerprint('ciElectron', ciElectronHash);
	const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');
	const declaredElectron = /^target="(\d+\.\d+\.\d+)"$/m.exec(npmrc)?.[1];
	const declaredMsBuild = /^ms_build_id="(\d+)"$/m.exec(npmrc)?.[1];
	assert.ok(declaredElectron && declaredMsBuild);
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), declaredElectronVersion: declaredElectron, declaredMicrosoftBuildId: Number(declaredMsBuild), originalSource: 'a49c80cfc4db97e264ac5108ec5ca2915d9d4da2', runtimeSource: expectedRuntimeSource }) + '\n');
	status('compilerInput', existsSync(join(root, 'out-build', 'vs', 'platform', 'agentHost', 'node', 'agentHostServerMain.js'))
		&& existsSync(join(root, 'out-build', testFile.replace(/^src\//, '').replace(/\.ts$/, '.js')))
		&& existsSync(join(root, 'out-build', 'nls.messages.json')));
	const bootstrap = join(scratch, 'observedServer.mjs');
	const build: typeof import('esbuild')['build'] = createRequire(join(root, 'build', 'package.json'))('esbuild').build;
	await build({
		entryPoints: [join(root, 'test', 'integration', 'agentHost', 'nativeExitObservedServer.ts')],
		outfile: bootstrap, bundle: true, platform: 'node', format: 'esm',
		packages: 'external', target: 'node24', logLevel: 'silent',
	});
	if (process.argv[2] === '--parallel') {
		await runParallelWorkload({
			root, scratch, runtime, bootstrap, packagedApp: packagedExecutable,
			ciElectronHash, nativeHash: expectedNativeHash, targetTitle: testTitle,
		});
	} else {
		for (let iteration = 1; iteration <= 20; iteration++) {
			await runIteration(iteration, runtime, bootstrap, packagedExecutable, ciElectronHash);
		}
	}
}
void main().catch(() => {
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), check: 'probeFailure', pass: false }) + '\n');
	process.exitCode = 1;
});
