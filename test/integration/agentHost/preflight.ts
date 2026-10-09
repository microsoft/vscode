/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const nodeCrypto: typeof import('node:crypto') = require('node:crypto');

function verifyFile(gate: string, file: string, executable = false): void {
	const exists = fs.existsSync(file);
	let result = 'passed';
	try {
		const stat = fs.statSync(file);
		assert.ok(stat.isFile() && stat.size > 0, 'Expected a nonempty regular file');
		fs.accessSync(file, executable ? fs.constants.X_OK : fs.constants.R_OK);
	} catch (error) {
		result = 'failed';
		console.error(JSON.stringify({ gate, name: path.basename(file), exists, executable, result }));
		throw error;
	}
	console.log(JSON.stringify({ gate, name: path.basename(file), exists, executable, result }));
}

function serverExecutable(directory: string): string {
	const productFile = path.join(directory, 'product.json');
	verifyFile('server-product-metadata', productFile);
	const product: { serverApplicationName?: string } = JSON.parse(fs.readFileSync(productFile, 'utf8'));
	const name = product.serverApplicationName;
	assert.ok(typeof name === 'string' && name.length > 0 && path.basename(name) === name, 'Server metadata must name its packaged executable');
	return path.join(directory, 'bin', name);
}

function main(): void {
	if (process.argv[2] === '--server-only') {
		assert.ok(process.argv[3], 'Supply the packaged server directory');
		verifyFile('packaged-server-executable', serverExecutable(process.argv[3]), true);
		return;
	}
	const client = process.env.INTEGRATION_TEST_ELECTRON_PATH;
	const server = process.env.VSCODE_REMOTE_SERVER_PATH;
	assert.ok(client && server, 'Supply the packaged client and server paths');
	const product: { applicationName: string } = JSON.parse(fs.readFileSync('product.json', 'utf8'));
	verifyFile('packaged-client-executable', client, true);
	verifyFile('test-electron-executable', path.join('.build', 'electron', product.applicationName), true);
	verifyFile('packaged-server-executable', serverExecutable(server), true);
	verifyFile('copilot-vsix-package', '.build/extensions/copilot/package.json');
	verifyFile('compiled-nls-messages', 'out-build/nls.messages.json');
	verifyFile('compiled-server-entrypoint', 'out-build/vs/platform/agentHost/node/agentHostServerMain.js');
	for (const entrypoint of [
		'conformance/agentHostConformance',
		'providers/claudeAgentHostE2E',
		'providers/codexAgentHostE2E',
		'providers/copilotAgentHostE2E',
		'providers/copilotOtelAgentHostE2E',
		'providers/copilotManagedSettingsAgentHostE2E',
	]) {
		verifyFile('compiled-suite-entrypoint', `out-build/vs/platform/agentHost/test/node/e2e/${entrypoint}.integrationTest.js`);
	}
	verifyFile('replay-empty-capture', 'src/vs/platform/agentHost/test/node/e2e/captures/empty.yaml');
	const lock: { packages: Record<string, { version: string }> } = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
	assert.equal(process.platform, 'linux');
	assert.equal(process.arch, 'x64');
	for (const name of ['@github/copilot-sdk', '@github/copilot-sdk-linux-x64', '@anthropic-ai/claude-agent-sdk', '@openai/codex']) {
		const installed: { version: string } = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8'));
		assert.equal(installed.version, lock.packages[`node_modules/${name}`].version);
		console.log(JSON.stringify({ package: name, version: installed.version }));
	}
	const runtime = 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime';
	verifyFile('copilot-runtime', runtime, true);
	verifyFile('copilot-native-library', 'node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/runtime.node');
	console.log(JSON.stringify({ runtimeSha256: nodeCrypto.createHash('sha256').update(fs.readFileSync(runtime)).digest('hex') }));
	console.log(JSON.stringify({ nativeLibrarySha256: nodeCrypto.createHash('sha256').update(fs.readFileSync('node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/runtime.node')).digest('hex') }));
}

main();
