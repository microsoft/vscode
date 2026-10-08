/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { isCloudSandbox, prepareCloudSandbox, raiseCloudSandboxFileLimit } from './cloudSandbox.ts';
import { root } from './installStateHash.ts';

async function acquireSetupLock(lockFile: string): Promise<() => void> {
	const deadline = performance.now() + 20 * 60_000;
	while (true) {
		let descriptor: number;
		try {
			descriptor = fs.openSync(lockFile, 'wx');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
			let owner: number;
			try {
				owner = Number(fs.readFileSync(lockFile, 'utf8'));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					continue;
				}
				throw error;
			}
			if (Number.isSafeInteger(owner) && owner > 1) {
				try {
					process.kill(owner, 0);
				} catch (error) {
					const code = (error as NodeJS.ErrnoException).code;
					if (code === 'ESRCH') {
						throw new Error(`Cloud Sandbox setup: stale lock ${lockFile} belongs to exited process ${owner}. Remove it after confirming no setup is running, then retry.`);
					}
					if (code !== 'EPERM') {
						throw error;
					}
				}
			}
			if (performance.now() >= deadline) {
				throw new Error(`Cloud Sandbox setup: timed out waiting for ${lockFile}. If its owning process has exited, remove the stale lock before retrying.`);
			}
			await setTimeout(100);
			continue;
		}
		try {
			fs.writeFileSync(descriptor, String(process.pid));
		} catch (error) {
			fs.unlinkSync(lockFile);
			throw error;
		} finally {
			fs.closeSync(descriptor);
		}
		return () => fs.unlinkSync(lockFile);
	}
}

function setupFingerprint(nodeVersion: string): string {
	const hash = createHash('sha256')
		.update(JSON.stringify([process.env.GITHUB_ENVIRONMENT_ID, nodeVersion, process.arch]));
	for (const file of [
		'.nvmrc', '.npmrc', 'remote/.npmrc', 'build/npm/gyp/package.json', 'build/npm/gyp/package-lock.json',
		'build/npm/cloudSandbox.ts', 'build/npm/cloudSandboxSetup.ts', 'build/npm/preinstall.ts',
	]) {
		hash.update(file).update(fs.readFileSync(path.join(root, file)));
	}
	const customHeaders = path.join(root, 'build/npm/gyp/custom-headers');
	if (fs.existsSync(customHeaders)) {
		for (const file of fs.readdirSync(customHeaders).sort()) {
			hash.update(file).update(fs.readFileSync(path.join(customHeaders, file)));
		}
	}
	return hash.digest('hex');
}

if (isCloudSandbox()) {
	// Serialize across checkouts too: Node downloads and OS packages are shared by the sandbox.
	const directory = path.join(os.homedir(), '.local/share/vscode-cloud-sandbox');
	fs.mkdirSync(directory, { recursive: true });
	const release = await acquireSetupLock(path.join(directory, 'setup.lock'));
	try {
		const stateFile = path.join(root, '.build/cloud-sandbox-setup');
		let node = process.execPath;
		let fingerprint = setupFingerprint(process.versions.node);
		const completed = fs.existsSync(stateFile)
			&& fs.readFileSync(stateFile, 'utf8') === fingerprint
			&& fs.existsSync(path.join(root, 'build/npm/gyp/node_modules/.bin/node-gyp'));
		if (!completed) {
			node = prepareCloudSandbox()!;
			fingerprint = setupFingerprint(execFileSync(node, ['--version'], { encoding: 'utf8' }).trim().replace(/^v/, ''));
		}
		// These limits belong to processes, not the cached checkout setup.
		const agentPid = process.argv[2] === '--agent-pid' ? Number(process.argv[3]) : process.ppid;
		raiseCloudSandboxFileLimit(agentPid);
		raiseCloudSandboxFileLimit(process.pid);
		if (!completed) {
			execFileSync(node, [path.join(root, 'build/npm/preinstall.ts')], {
				cwd: root,
				stdio: 'inherit',
				env: { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ''}`, npm_command: 'ci', VSCODE_FORCE_INSTALL: '1' },
			});
			fs.mkdirSync(path.dirname(stateFile), { recursive: true });
			fs.writeFileSync(stateFile, fingerprint);
		}
		console.log('Cloud Sandbox prerequisites are ready. npm install and npm ci can now build native dependencies.');
	} finally {
		release();
	}
}
