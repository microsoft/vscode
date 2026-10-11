/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const urls: typeof import('node:url') = require('node:url');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { test }: typeof import('node:test') = require('node:test');

const root = path.resolve(__dirname, '../../..');
const baseline = '114d61e889475758fd1c3b3fcbdd04e9717940c4';
const environment = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

function git(directory: string, args: readonly string[]) {
	const result = spawnSync('git', ['-C', directory, ...args], { env: environment, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
	if (result.error) {
		throw result.error;
	}
	return result;
}

function clone(directory: string, bare = false): void {
	const branch = git(root, ['branch', '--show-current']);
	assert.equal(branch.status, 0, branch.stderr);
	const args = ['clone', '--no-local', '--depth=1', '--single-branch', '--branch', branch.stdout.trim(), ...(bare ? ['--bare'] : []), urls.pathToFileURL(root).href, directory];
	const result = git(root, args);
	assert.equal(result.status, 0, result.stderr);
	if (!bare) {
		fs.copyFileSync(path.join(__dirname, 'ossProbe.ts'), path.join(directory, 'test/integration/agentHost/ossProbe.ts'));
		assert.equal(git(directory, ['rev-parse', '--is-shallow-repository']).stdout.trim(), 'true');
		assert.equal(git(directory, ['cat-file', '-e', `${baseline}^{commit}`]).status, 128, 'Baseline must really be missing from the depth-1 checkout');
		assert.ok(fs.existsSync(path.join(directory, 'package.json')));
	}
}

function source(directory: string, fresh: boolean) {
	return spawnSync(process.execPath, [path.join(directory, 'test/integration/agentHost/ossProbe.ts'), fresh ? '--fresh-source-only' : '--source-only'], { cwd: directory, env: environment, encoding: 'utf8', timeout: 90_000, maxBuffer: 2 * 1024 * 1024 });
}

function fixture(): string {
	fs.mkdirSync(path.join(root, '.build'), { recursive: true });
	return fs.mkdtempSync(path.join(root, '.build', 'oss-shallow-contract-'));
}

test('exact depth-1 CI context reports missing baseline object despite present files, then fetches only the pinned baseline', () => {
	const directory = fixture();
	try {
		const checkout = path.join(directory, 'checkout');
		clone(checkout);
		const before = git(checkout, ['rev-parse', 'HEAD']).stdout.trim();
		const missing = source(checkout, false);
		assert.equal(missing.status, 1);
		const gate = JSON.parse(missing.stderr.split('\n')[0]);
		assert.deepEqual(gate, { gate: 'baseline-git-object', baseline, result: 'unavailable', exitCode: 128, signal: null, checkoutPackageExists: true });
		assert.ok(missing.stderr.includes('source-file comparison has not started'));
		assert.ok(!missing.stderr.includes('Missing pinned source input: package.json'));
		const corrected = source(checkout, true);
		assert.equal(corrected.status, 0, corrected.stderr);
		const fetch = corrected.stdout.trim().split('\n').map(line => JSON.parse(line)).find(entry => entry.gate === 'fetch-pinned-baseline');
		assert.deepEqual(fetch, { gate: 'fetch-pinned-baseline', baseline, result: 'passed', exitCode: 0, signal: null });
		assert.equal(git(checkout, ['rev-parse', '--verify', `${baseline}^{commit}`]).stdout.trim(), baseline);
		assert.equal(git(checkout, ['rev-parse', '--is-shallow-repository']).stdout.trim(), 'true');
		assert.equal(git(checkout, ['rev-parse', 'HEAD']).stdout.trim(), before);
		assert.equal(git(checkout, ['rev-list', '--count', '--all']).stdout.trim(), '1', 'Fetch must not expand branch history');
		const manifest = corrected.stdout.trim().split('\n').map(line => JSON.parse(line)).find(entry => entry.gate === 'historical-oss-source');
		assert.equal(Object.keys(manifest.manifest).length, 19);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('fetch failure stays fatal and a wrong available commit cannot substitute for the pinned baseline', () => {
	const directory = fixture();
	try {
		const checkout = path.join(directory, 'checkout');
		const wrongOrigin = path.join(directory, 'wrong-origin.git');
		clone(checkout);
		clone(wrongOrigin, true);
		assert.equal(git(checkout, ['remote', 'set-url', 'origin', urls.pathToFileURL(wrongOrigin).href]).status, 0);
		assert.equal(git(checkout, ['fetch', '--no-tags', '--depth=1', 'origin', 'HEAD']).status, 0);
		const wrong = source(checkout, false);
		assert.equal(wrong.status, 1);
		assert.ok(wrong.stderr.includes('Pinned baseline Git object'));
		const failed = source(checkout, true);
		assert.equal(failed.status, 1);
		const gate = failed.stdout.trim().split('\n').map(line => JSON.parse(line)).find(entry => entry.gate === 'fetch-pinned-baseline');
		assert.deepEqual(gate, { gate: 'fetch-pinned-baseline', baseline, result: 'failed', exitCode: 128, signal: null });
		assert.ok(failed.stderr.includes('no branch substitution or source comparison is allowed'));
		assert.equal(git(checkout, ['cat-file', '-e', `${baseline}^{commit}`]).status, 128);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('after pinned fetch, changed current content and truly missing checkout files remain distinct fatal errors', () => {
	const directory = fixture();
	try {
		const checkout = path.join(directory, 'checkout');
		clone(checkout);
		assert.equal(source(checkout, true).status, 0);
		const file = path.join(checkout, 'package.json');
		const original = fs.readFileSync(file);
		fs.writeFileSync(file, '{"sensitiveContractMarker":"must-not-be-printed"}\n');
		const mismatch = source(checkout, false);
		assert.equal(mismatch.status, 1);
		assert.ok(mismatch.stderr.includes('Historical source input changed: package.json'));
		assert.ok(!mismatch.stderr.includes('must-not-be-printed'));
		fs.writeFileSync(file, original);
		fs.unlinkSync(file);
		const missing = source(checkout, false);
		assert.equal(missing.status, 1);
		assert.ok(missing.stderr.includes('Current checkout file is missing: package.json'));
		assert.ok(!missing.stderr.includes('baseline-git-object'));
		fs.writeFileSync(file, original);
		fs.appendFileSync(path.join(checkout, 'src/vs/nls.ts'), '\n// source-mismatch-control-must-not-be-printed\n');
		const changedImplementation = source(checkout, false);
		assert.equal(changedImplementation.status, 1);
		assert.ok(changedImplementation.stderr.includes('Historical implementation, assertions, captures, and provider dependencies must be unchanged'));
		assert.ok(!changedImplementation.stderr.includes('source-mismatch-control-must-not-be-printed'));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('fresh shallow checkout rejects unexpected pre-install artifact/cache outputs without fetching or deleting them', () => {
	const directory = fixture();
	try {
		const checkout = path.join(directory, 'checkout');
		clone(checkout);
		for (const relative of ['node_modules', '.build/electron', '.build/typings', '.build/libcxx-objects', '.build/libcxx_headers', '.build/libcxxabi_headers', 'out']) {
			const unexpected = path.join(checkout, relative);
			fs.mkdirSync(unexpected, { recursive: true });
			const result = source(checkout, true);
			assert.equal(result.status, 1);
			assert.ok(result.stderr.includes(`Fresh worker input must not preexist: ${relative}`));
			assert.ok(!result.stdout.includes('fetch-pinned-baseline'));
			assert.ok(fs.existsSync(unexpected), 'The gate must not delete unexpected state');
			assert.equal(git(checkout, ['cat-file', '-e', `${baseline}^{commit}`]).status, 128);
			fs.rmdirSync(unexpected);
		}
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('archive context does not borrow an ancestor checkout baseline or bypass the source contract', () => {
	const directory = fixture();
	try {
		const archive = path.join(directory, 'archive');
		fs.mkdirSync(archive);
		const exported = spawnSync('git', ['-C', root, 'archive', '--format=tar', 'HEAD', 'package.json', 'package-lock.json', 'product.json', '.npmrc', '.nvmrc', 'remote/.npmrc', 'test/package.json', 'test/unit/electron', 'build/package-lock.json', 'build/checksums', 'build/npm/electronTypes.ts', 'build/npm/preinstall.ts', 'build/npm/gyp/custom-headers', 'build/linux/libcxx-fetcher.ts', 'test/integration/agentHost/ossProbe.ts'], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
		assert.equal(exported.status, 0);
		const extracted = spawnSync('tar', ['-xf', '-', '-C', archive], { input: exported.stdout, timeout: 60_000 });
		assert.equal(extracted.status, 0);
		const helper = path.join(archive, 'test/integration/agentHost');
		fs.copyFileSync(path.join(__dirname, 'ossProbe.ts'), path.join(helper, 'ossProbe.ts'));
		assert.ok(fs.existsSync(path.join(archive, 'package.json')));
		assert.ok(!fs.existsSync(path.join(archive, '.git')));
		const result = source(archive, true);
		assert.equal(result.status, 1);
		const gate = JSON.parse(result.stderr.split('\n')[0]);
		assert.equal(gate.gate, 'git-checkout-root');
		assert.equal(gate.reason, 'not-an-owned-checkout');
		assert.ok(!result.stdout.includes('fetch-pinned-baseline'));
		assert.ok(result.stderr.includes('archive/nested-directory context is not accepted'));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
