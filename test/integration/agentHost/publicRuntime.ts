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
const product: IProduct = JSON.parse(fs.readFileSync('product.json', 'utf8'));
const configuredVersion = /^target="(?<version>[^"]+)"$/m.exec(fs.readFileSync('.npmrc', 'utf8'))?.groups?.version;
assert.equal(configuredVersion, publicElectronVersion, 'Probe must retain the reviewed Electron version');
assert.ok(process.env.BUILDS_API_URL, 'Standard LinuxIntegration BUILDS_API_URL is required');

if (process.argv[2] === '--prepare') {
	product.electronArtifactFeed = '';
	product.nodejsArtifactFeed = '';
	fs.writeFileSync('product.json', JSON.stringify(product, null, '\t') + '\n');
	console.log(JSON.stringify({ gate: 'public-runtime-selection', version: configuredVersion, electronSource: 'electron/electron public release', nodeSource: 'nodejs.org', privateFeed: false }));
} else {
	assert.equal(process.argv[2], '--verify');
	assert.equal(product.electronArtifactFeed, '', 'Private Electron feed must not be selected');
	assert.equal(product.nodejsArtifactFeed, '', 'Private Node.js feed must not be selected');
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
