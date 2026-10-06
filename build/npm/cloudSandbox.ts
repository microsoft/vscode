/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { isExpectedElectronInstalled } from '../lib/electronVersion.ts';

interface SandboxSetupOptions {
	env: NodeJS.ProcessEnv;
	platform: NodeJS.Platform;
	arch: string;
	nodeVersion: string;
	root: string;
	home: string;
	run: (command: string, args: readonly string[], captureOutput?: boolean) => string;
}

const packages = [
	'build-essential', 'ca-certificates', 'curl', 'pkg-config', 'python3', 'xz-utils',
	'libxkbfile-dev', 'libkrb5-dev', 'libgtk-3-dev', 'libgbm-dev', 'libnss3', 'libasound2-dev',
	'xvfb', 'rpm',
];

function sandboxOptions(overrides: Partial<SandboxSetupOptions>): SandboxSetupOptions | undefined {
	const env = overrides.env ?? process.env;
	const platform = overrides.platform ?? process.platform;
	if (platform !== 'linux' || !env.GITHUB_ENVIRONMENT_ID?.trim()) {
		return undefined;
	}

	const root = overrides.root ?? path.resolve(import.meta.dirname, '../..');
	return {
		env, platform, root,
		arch: overrides.arch ?? process.arch,
		nodeVersion: overrides.nodeVersion ?? process.versions.node,
		home: overrides.home ?? os.homedir(),
		run: overrides.run ?? ((command, args, captureOutput = false) => {
			const output = execFileSync(command, args, {
				cwd: root, env, encoding: 'utf8',
				stdio: ['ignore', captureOutput ? 'pipe' : 'inherit', 'inherit'],
				timeout: 20 * 60 * 1000,
			});
			return output ?? '';
		}),
	};
}

/**
 * Prepare native-build and graphical prerequisites only in Mission Control cloud sandboxes.
 * install-fast calls this before npm; root preinstall can run after dependency build scripts.
 */
export function prepareCloudSandbox(overrides: Partial<SandboxSetupOptions> = {}): boolean {
	const options = sandboxOptions(overrides);
	if (!options) {
		return false;
	}
	const { run, root, home, nodeVersion, arch } = options;
	const requiredVersion = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
	if (!/^\d+\.\d+\.\d+$/.test(requiredVersion)) {
		throw new Error('Cloud Sandbox setup: .nvmrc must contain a complete Node.js version.');
	}
	if (arch !== 'x64' && arch !== 'arm64') {
		throw new Error(`Cloud Sandbox setup: unsupported architecture ${arch}.`);
	}

	// Query all packages so missing prerequisites do not make dpkg-query itself fail.
	const installed = new Set(run('dpkg-query', ['-W', '-f=${Package} ${Status}\\n'], true)
		.split('\n')
		.filter(line => line.endsWith(' install ok installed'))
		.map(line => line.split(' ')[0]));
	const missing = packages.filter(name => !installed.has(name));
	if (missing.length > 0) {
		console.log(`Cloud Sandbox: installing ${missing.join(', ')}.`);
		const asRoot = run('id', ['-u'], true).trim() === '0';
		const command = asRoot ? 'env' : 'sudo';
		const prefix = asRoot ? [] : ['-n', 'env'];
		const apt = [...prefix, 'DEBIAN_FRONTEND=noninteractive', 'apt-get', '-o', 'Acquire::Retries=3', '-o', 'DPkg::Lock::Timeout=120'];
		run(command, [...apt, 'update']);
		run(command, [...apt, 'install', '-y', '--no-install-recommends', ...missing]);
	}

	const required = requiredVersion.split('.').map(Number);
	const current = nodeVersion.split('.').map(Number);
	if (current[0] === required[0] && (current[1] > required[1] || (current[1] === required[1] && current[2] >= required[2]))) {
		return true;
	}

	const archiveName = `node-v${requiredVersion}-linux-${arch}.tar.xz`;
	const baseURL = `https://nodejs.org/dist/v${requiredVersion}`;
	const directory = path.join(home, '.local', 'share', 'vscode-cloud-sandbox');
	const nodeDirectory = path.join(directory, `node-v${requiredVersion}-linux-${arch}`);
	fs.mkdirSync(directory, { recursive: true });
	const node = path.join(nodeDirectory, 'bin', 'node');
	if (!fs.existsSync(node) || run(node, ['--version'], true).trim() !== `v${requiredVersion}`) {
		const temporaryDirectory = fs.mkdtempSync(path.join(directory, 'download-'));
		try {
			const archive = path.join(temporaryDirectory, archiveName);
			const checksums = path.join(temporaryDirectory, 'SHASUMS256.txt');
			const download = ['--fail', '--location', '--show-error', '--retry', '3', '--connect-timeout', '30', '--max-time', '300'];
			run('curl', [...download, `${baseURL}/${archiveName}`, '--output', archive]);
			run('curl', [...download, `${baseURL}/SHASUMS256.txt`, '--output', checksums]);
			const expected = fs.readFileSync(checksums, 'utf8').split('\n')
				.find(line => line.trim().split(/\s+/)[1] === archiveName)?.split(/\s+/)[0];
			const actual = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
			if (!expected || actual !== expected) {
				throw new Error(`Cloud Sandbox setup: checksum verification failed for ${archiveName}.`);
			}
			run('tar', ['-xJf', archive, '-C', temporaryDirectory]);
			const extracted = path.join(temporaryDirectory, `node-v${requiredVersion}-linux-${arch}`);
			if (run(path.join(extracted, 'bin', 'node'), ['--version'], true).trim() !== `v${requiredVersion}`) {
				throw new Error('Cloud Sandbox setup: the downloaded Node.js version does not match .nvmrc.');
			}
			fs.rmSync(nodeDirectory, { recursive: true, force: true });
			fs.renameSync(extracted, nodeDirectory);
		} finally {
			fs.rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	}

	const bin = `'${path.join(nodeDirectory, 'bin').replaceAll('\'', '\'\\\'\'')}'`;
	throw new Error(`Cloud Sandbox: installed Node.js ${requiredVersion}. The running npm process still uses ${nodeVersion}.\nRun this in your shell, then rerun npm install or npm run install-fast:\nexport PATH=${bin}:"$PATH"\nhash -r`);
}

/**
 * Download the repository's Electron and Playwright builds after dependencies are installed.
 */
export function finishCloudSandbox(overrides: Partial<SandboxSetupOptions> = {}): void {
	const options = sandboxOptions(overrides);
	if (!options) {
		return;
	}
	console.log('Cloud Sandbox: preparing Electron and Playwright (use xvfb-run -a for headless GUI commands).');
	if (!isExpectedElectronInstalled(options.root)) {
		options.run('npm', ['run', 'electron', '--', options.arch]);
	}

	// Browser downloads check their own caches; only repeat apt setup for a new host or Playwright version.
	const stateFile = path.join(options.root, '.build', 'cloud-sandbox-playwright-deps');
	const state = createHash('sha256')
		.update(options.env.GITHUB_ENVIRONMENT_ID!)
		.update(fs.readFileSync(path.join(options.root, 'node_modules', 'playwright', 'package.json')))
		.digest('hex');
	const installed = fs.existsSync(stateFile) && fs.readFileSync(stateFile, 'utf8') === state;
	options.run('npm', ['exec', '--', 'playwright', 'install', ...(installed ? [] : ['--with-deps'])]);
	fs.mkdirSync(path.dirname(stateFile), { recursive: true });
	fs.writeFileSync(stateFile, state);
}
