/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const nodeCrypto: typeof import('node:crypto') = require('node:crypto');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');

interface IProduct {
	applicationName: string;
	electronArtifactFeed?: string;
	nodejsArtifactFeed?: string;
}

const publicElectronVersion = '43.7.7';
const publicElectronSha256 = '9ecc59968492b5139d37b2de89496832655d2caeae1c7229cecb706006aceb9a';
// Pinned OSS 7df8d057 manifest; archive digest independently verified against the official release.
const publicManifestSha256 = 'db0d5b3a22eec49beeb718942448022ad9448c100d7bb09c1ade01cd9ccffb3b';
const publicElectronArchiveSha256 = '4d0a48398c444258dbcf2f5f83b49ca5bc53583130f354e0c299dad5b22b5271';
const publicNodeVersion = '24.21.0';
const publicNodeArchiveSha256 = '6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff';

function main(): void {
	const preparing = process.argv[2] === '--prepare';
	if (process.env.AGENT_HOST_E2E_PUBLIC_RUNTIME_PROBE !== '1') {
		assert.ok(preparing, 'Public runtime verification requires the explicit temporary probe lane');
		console.log(JSON.stringify({ gate: 'public-runtime-selection', result: 'not-selected', inputsModified: false }));
		return;
	}
	const product: IProduct = JSON.parse(fs.readFileSync('product.json', 'utf8'));
	const configuredVersion = /^target="(?<version>[^"]+)"$/m.exec(fs.readFileSync('.npmrc', 'utf8'))?.groups?.version;
	assert.equal(configuredVersion, publicElectronVersion, 'Probe must retain the reviewed Electron version');
	assert.ok(process.env.BUILDS_API_URL, 'Standard LinuxIntegration BUILDS_API_URL is required');
	assert.equal(process.env.VSCODE_ARCH, 'x64', 'Public provenance lane is reviewed only for Linux x64');
	assert.equal(process.env.VSCODE_NODE_GLIBC ?? '', '', 'Public server Node must use the standard Linux archive');
	for (const key of Object.keys(process.env)) {
		assert.ok(!/(?:electron_)(?:mirror|nightly_?mirror|custom_?dir|custom_?filename|custom_?version)$/i.test(key) || !process.env[key], `Ambient Electron asset override is not allowed: ${key}`);
	}
	const nodeVersion = /^target="(?<version>[^"]+)"$/m.exec(fs.readFileSync('remote/.npmrc', 'utf8'))?.groups?.version;
	assert.equal(nodeVersion, publicNodeVersion, 'Probe must retain the reviewed public server Node version');
	const nodeManifest = fs.readFileSync('build/checksums/nodejs.txt', 'utf8');
	assert.equal(nodeManifest.split('\n').find(line => line.trim().endsWith(` node-v${publicNodeVersion}-linux-x64.tar.gz`))?.trim().split(/\s+/)[0], publicNodeArchiveSha256, 'Existing public Linux Node checksum must match pinned provenance');
	const immutableManifestPath = path.join(__dirname, 'publicElectronChecksums.txt');
	assert.equal(nodeCrypto.createHash('sha256').update(fs.readFileSync(immutableManifestPath)).digest('hex'), publicManifestSha256, 'Immutable public manifest must match the pinned OSS source');

	if (preparing) {
		product.electronArtifactFeed = '';
		product.nodejsArtifactFeed = '';
		fs.copyFileSync(immutableManifestPath, 'build/checksums/electron.txt');
		fs.writeFileSync('product.json', JSON.stringify(product, null, '\t') + '\n');
		console.log(JSON.stringify({ gate: 'public-runtime-selection', version: configuredVersion, electronSource: 'electron/electron public release', nodeSource: 'nodejs.org', privateFeed: false, manifestSha256: publicManifestSha256, expectedElectronArchiveSha256: publicElectronArchiveSha256, expectedNodeArchiveSha256: publicNodeArchiveSha256 }));
	} else {
		assert.equal(process.argv[2], '--verify');
		assert.equal(product.electronArtifactFeed, '', 'Private Electron feed must not be selected');
		assert.equal(product.nodejsArtifactFeed, '', 'Private Node.js feed must not be selected');
		assert.equal(nodeCrypto.createHash('sha256').update(fs.readFileSync('build/checksums/electron.txt')).digest('hex'), publicManifestSha256, 'Active manifest must retain pinned public provenance after selection');
		assert.equal(process.platform, 'linux');
		assert.equal(process.arch, 'x64');
		assert.ok(!fs.existsSync('/run/rosetta'), 'Native worker must not have a Rosetta runtime');
		const executable = path.resolve('.build', 'electron', product.applicationName);
		fs.accessSync(executable, fs.constants.X_OK);
		const hash = nodeCrypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
		assert.equal(hash, publicElectronSha256, 'Test executable must be the reviewed public Electron asset');
		const probe = spawnSync(executable, ['-e', `
			const assert = require('node:assert/strict');
			assert.equal(process.versions.electron, '${publicElectronVersion}');
			assert.equal(process.versions.modules, '148');
			require('@vscode/sqlite3');
			require('node-pty');
			console.log(JSON.stringify({ gate: 'native-electron-abi', electron: process.versions.electron, node: process.versions.node, modules: process.versions.modules, sqlite: true, pty: true }));
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			encoding: 'utf8',
		});
		if (probe.error) {
			throw probe.error;
		}
		process.stdout.write(probe.stdout);
		process.stderr.write(probe.stderr);
		assert.equal(probe.status, 0, 'Native Electron ABI verification must succeed before registration');
		console.log(JSON.stringify({ gate: 'public-electron-identity', version: publicElectronVersion, executableSha256: hash, kernelExecutable: fs.realpathSync('/proc/self/exe') }));
	}
}

main();
