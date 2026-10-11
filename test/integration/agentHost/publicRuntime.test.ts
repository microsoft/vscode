/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const nodeCrypto: typeof import('node:crypto') = require('node:crypto');
const { spawn, spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { test }: typeof import('node:test') = require('node:test');
const sumchecker: (algorithm: string, checksumFile: string, directory: string, files: readonly string[]) => Promise<void> = require('sumchecker');

const root = path.resolve(__dirname, '../../..');
const pinnedSource = '7df8d0572f42c8b1c80360279abab905aaec451b';
const archiveName = 'electron-v43.7.7-linux-x64.zip';
const expectedArchiveSha256 = '4d0a48398c444258dbcf2f5f83b49ca5bc53583130f354e0c299dad5b22b5271';
const expectedManifestSha256 = 'db0d5b3a22eec49beeb718942448022ad9448c100d7bb09c1ade01cd9ccffb3b';
const expectedOfficialSumsSha256 = 'c4153a39f73943f765c57224a408ed8222d8b6845f30e30c1a0be69c15a7c9a3';
const expectedNodeArchiveSha256 = '6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff';

function requiredInput(key: string): string {
	const value = process.env[key];
	assert.ok(value && fs.existsSync(value), `Local artifact contract requires ${key}`);
	return value;
}

function hash(file: string): string {
	return nodeCrypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function pinnedFile(file: string): Buffer {
	const result = spawnSync('git', ['-C', root, 'show', `${pinnedSource}:${file}`]);
	if (result.error) {
		throw result.error;
	}
	assert.equal(result.status, 0, result.stderr.toString());
	return result.stdout;
}

function createContractDirectory(): string {
	fs.mkdirSync(path.join(root, '.build'), { recursive: true });
	const directory = fs.mkdtempSync(path.join(root, '.build', 'public-runtime-contract-'));
	fs.mkdirSync(path.join(directory, 'build/checksums'), { recursive: true });
	fs.mkdirSync(path.join(directory, 'remote'));
	fs.copyFileSync(requiredInput('AGENT_HOST_DISTRO_PRODUCT'), path.join(directory, 'product.json'));
	fs.writeFileSync(path.join(directory, '.npmrc'), pinnedFile('.npmrc'));
	fs.writeFileSync(path.join(directory, 'remote/.npmrc'), pinnedFile('remote/.npmrc'));
	fs.writeFileSync(path.join(directory, 'build/checksums/nodejs.txt'), pinnedFile('build/checksums/nodejs.txt'));
	fs.copyFileSync(requiredInput('AGENT_HOST_DISTRO_ELECTRON_CHECKSUMS'), path.join(directory, 'build/checksums/electron.txt'));
	return directory;
}

function prepare(directory: string, extra: NodeJS.ProcessEnv = {}, enabled = true) {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		AGENT_HOST_E2E_PUBLIC_RUNTIME_PROBE: enabled ? '1' : undefined,
		BUILDS_API_URL: 'https://dev.azure.com/monacotools/Monaco/_apis/build/builds/42/',
		VSCODE_ARCH: 'x64',
		...extra,
	};
	const result = spawnSync(process.execPath, [path.join(__dirname, 'publicRuntime.ts'), '--prepare'], { cwd: directory, env, encoding: 'utf8' });
	if (result.error) {
		throw result.error;
	}
	return result;
}

test('public ZIP and contained executable have independently checked distinct identities', async () => {
	const archive = requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_ARCHIVE');
	const unpack = spawn('unzip', ['-p', archive, 'electron'], { stdio: ['ignore', 'pipe', 'pipe'] });
	const digest = nodeCrypto.createHash('sha256');
	unpack.stdout.on('data', data => digest.update(data));
	let errors = '';
	unpack.stderr.setEncoding('utf8');
	unpack.stderr.on('data', data => errors += data);
	const status = await new Promise<number | null>((resolve, reject) => {
		unpack.once('error', reject);
		unpack.once('close', code => resolve(code));
	});
	assert.equal(status, 0, errors);
	assert.equal(digest.digest('hex'), '9ecc59968492b5139d37b2de89496832655d2caeae1c7229cecb706006aceb9a');
	assert.equal(hash(archive), expectedArchiveSha256);
	assert.notEqual(expectedArchiveSha256, '9ecc59968492b5139d37b2de89496832655d2caeae1c7229cecb706006aceb9a');
});

test('immutable manifest and real archive agree with pinned OSS source and independent official metadata', () => {
	const immutable = path.join(__dirname, 'publicElectronChecksums.txt');
	assert.deepEqual(fs.readFileSync(immutable), pinnedFile('build/checksums/electron.txt'));
	assert.equal(hash(immutable), expectedManifestSha256);
	const officialSums = requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_SUMS');
	assert.equal(hash(officialSums), expectedOfficialSumsSha256);
	assert.equal(fs.readFileSync(officialSums, 'utf8').trim(), fs.readFileSync(immutable, 'utf8').trim());
	const release: { tag_name: string; assets: { id: number; name: string; size: number; digest: string; browser_download_url: string }[] } = JSON.parse(fs.readFileSync(requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_METADATA'), 'utf8'));
	assert.equal(release.tag_name, 'v43.7.7');
	const metadata = release.assets.find(asset => asset.name === archiveName);
	assert.deepEqual(metadata, {
		id: 600562611,
		name: archiveName,
		size: 127045472,
		digest: `sha256:${expectedArchiveSha256}`,
		browser_download_url: `https://github.com/electron/electron/releases/download/v43.7.7/${archiveName}`,
	});
	const archive = requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_ARCHIVE');
	assert.equal(fs.statSync(archive).size, metadata!.size);
	assert.equal(hash(archive), expectedArchiveSha256);
});

test('sumchecker rejects public archive with private overlay and accepts only pinned public manifest after selection', async () => {
	const directory = createContractDirectory();
	try {
		const archive = requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_ARCHIVE');
		const checksumFile = path.join(directory, 'build/checksums/electron.txt');
		const nodeBefore = fs.readFileSync(path.join(directory, 'build/checksums/nodejs.txt'));
		const productBefore = JSON.parse(fs.readFileSync(path.join(directory, 'product.json'), 'utf8'));
		assert.ok(fs.readFileSync(checksumFile, 'utf8').includes(`251fd81a353c459cc998b393fb3333575390cc81661cd0d39f5a306af87fe1e4 *${archiveName}`));
		await assert.rejects(sumchecker('sha256', checksumFile, path.dirname(archive), [archiveName]), /did not match expected checksum/);
		const result = prepare(directory);
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'product.json'), 'utf8')), { ...productBefore, electronArtifactFeed: '', nodejsArtifactFeed: '' });
		assert.deepEqual(fs.readFileSync(path.join(directory, 'build/checksums/nodejs.txt')), nodeBefore);
		assert.deepEqual(fs.readFileSync(checksumFile), pinnedFile('build/checksums/electron.txt'));
		await sumchecker('sha256', checksumFile, path.dirname(archive), [archiveName]);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('checksum enforcement still rejects corrupt, wrong-version, and wrong-architecture archives', async () => {
	const directory = createContractDirectory();
	try {
		assert.equal(prepare(directory).status, 0);
		const archive = requiredInput('AGENT_HOST_OFFICIAL_ELECTRON_ARCHIVE');
		const checksumFile = path.join(directory, 'build/checksums/electron.txt');
		const wrongNames = ['electron-v43.7.8-linux-x64.zip', 'electron-v43.7.7-linux-arm64.zip'];
		for (const name of wrongNames) {
			fs.copyFileSync(archive, path.join(directory, name));
			await assert.rejects(sumchecker('sha256', checksumFile, directory, [name]));
			fs.unlinkSync(path.join(directory, name));
		}
		const corrupted = path.join(directory, archiveName);
		fs.copyFileSync(archive, corrupted);
		const fd = fs.openSync(corrupted, 'r+');
		try {
			fs.writeSync(fd, Buffer.from('CORRUPT'), 0, 7, 0);
		} finally {
			fs.closeSync(fd);
		}
		await assert.rejects(sumchecker('sha256', checksumFile, directory, [archiveName]), /did not match expected checksum/);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('unselected production lane preserves all private product and checksum inputs byte-for-byte', () => {
	const directory = createContractDirectory();
	try {
		const files = ['product.json', '.npmrc', 'remote/.npmrc', 'build/checksums/electron.txt', 'build/checksums/nodejs.txt'];
		const before = files.map(file => fs.readFileSync(path.join(directory, file)));
		const result = prepare(directory, {}, false);
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(files.map(file => fs.readFileSync(path.join(directory, file))), before);
		assert.deepEqual(JSON.parse(result.stdout), { gate: 'public-runtime-selection', result: 'not-selected', inputsModified: false });
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('Linux Node public selector retains independently matching existing checksum and rejects mixed Node provenance', () => {
	const directory = createContractDirectory();
	try {
		const sums = fs.readFileSync(requiredInput('AGENT_HOST_OFFICIAL_NODE_SUMS'), 'utf8');
		assert.equal(sums.split('\n').find(line => line.endsWith('  node-v24.21.0-linux-x64.tar.gz'))?.split(/\s+/)[0], expectedNodeArchiveSha256);
		const checksumFile = path.join(directory, 'build/checksums/nodejs.txt');
		assert.ok(fs.readFileSync(checksumFile, 'utf8').includes(`${expectedNodeArchiveSha256}  node-v24.21.0-linux-x64.tar.gz`));
		fs.writeFileSync(checksumFile, `${'0'.repeat(64)}  node-v24.21.0-linux-x64.tar.gz\n`);
		const before = fs.readFileSync(path.join(directory, 'product.json'));
		const result = prepare(directory);
		assert.equal(result.status, 1);
		assert.ok(result.stderr.includes('Existing public Linux Node checksum must match pinned provenance'));
		assert.deepEqual(fs.readFileSync(path.join(directory, 'product.json')), before);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('actual public server Node archive passes the existing audited Node checksum lane', async () => {
	const { sha256 } = await import('../../../build/lib/download.ts');
	const archive = requiredInput('AGENT_HOST_OFFICIAL_NODE_ARCHIVE');
	assert.equal(path.basename(archive), 'node-v24.21.0-linux-x64.tar.gz');
	assert.equal(sha256(fs.readFileSync(archive)), expectedNodeArchiveSha256);
	const directory = createContractDirectory();
	try {
		const manifest = path.join(directory, 'build/checksums/nodejs.txt');
		const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').map(line => line.split(/\s+/));
		assert.equal(sha256(fs.readFileSync(archive)), lines.find(([, name]) => name === path.basename(archive))?.[0]);
		assert.notEqual(sha256(fs.readFileSync(archive)), lines.find(([, name]) => name === 'node-v24.21.0-linux-arm64.tar.gz')?.[0]);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('canonical server preflight resolves real OSS and distro metadata and rejects missing launchers', () => {
	const directory = createContractDirectory();
	try {
		for (const productFile of [path.join(root, 'product.json'), requiredInput('AGENT_HOST_DISTRO_PRODUCT')]) {
			fs.copyFileSync(productFile, path.join(directory, 'product.json'));
			const product: { serverApplicationName: string } = JSON.parse(fs.readFileSync(productFile, 'utf8'));
			const launcher = path.join(directory, 'bin', product.serverApplicationName);
			fs.mkdirSync(path.dirname(launcher), { recursive: true });
			fs.copyFileSync(path.join(root, 'resources/server/bin/code-server-linux.sh'), launcher);
			fs.chmodSync(launcher, 0o755);
			const old = spawnSync('/bin/bash', ['-c', 'test -x "$1/bin/code-server"', 'preflight', directory]);
			assert.equal(old.status, 1);
			const result = spawnSync(process.execPath, [path.join(__dirname, 'preflight.ts'), '--server-only', directory], { encoding: 'utf8' });
			assert.equal(result.status, 0, result.stderr);
			assert.ok(result.stdout.includes(`"name":"${product.serverApplicationName}"`));
			fs.unlinkSync(launcher);
			const missing = spawnSync(process.execPath, [path.join(__dirname, 'preflight.ts'), '--server-only', directory], { encoding: 'utf8' });
			assert.equal(missing.status, 1);
			assert.deepEqual(JSON.parse(missing.stderr.split('\n')[0]), { gate: 'packaged-server-executable', name: product.serverApplicationName, exists: false, executable: true, result: 'failed' });
		}
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('wrong configured versions, architectures, missing build API, and alternate mirrors fail before changing provenance', () => {
	const directory = createContractDirectory();
	try {
		const files = ['product.json', 'build/checksums/electron.txt'];
		const before = files.map(file => fs.readFileSync(path.join(directory, file)));
		for (const extra of [{ BUILDS_API_URL: undefined }, { VSCODE_ARCH: 'arm64' }, { ELECTRON_MIRROR: 'https://invalid.example/' }, { VSCODE_NODE_GLIBC: '-glibc-2.28' }]) {
			assert.equal(prepare(directory, extra).status, 1);
			assert.deepEqual(files.map(file => fs.readFileSync(path.join(directory, file))), before);
		}
		fs.writeFileSync(path.join(directory, '.npmrc'), 'target="43.7.8"\n');
		assert.equal(prepare(directory).status, 1);
		fs.writeFileSync(path.join(directory, '.npmrc'), pinnedFile('.npmrc'));
		fs.writeFileSync(path.join(directory, 'remote/.npmrc'), 'target="24.20.0"\n');
		assert.equal(prepare(directory).status, 1);
		assert.deepEqual(files.map(file => fs.readFileSync(path.join(directory, file))), before);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
