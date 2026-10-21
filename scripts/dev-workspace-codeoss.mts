/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

interface ILaunchResult {
	readonly pid: number;
	readonly cdpPort: number;
	readonly extHostPort: number;
	readonly mainPort: number;
	readonly runDir: string;
	readonly logFile: string;
	readonly userDataDir: string;
}

async function main(): Promise<void> {
	const root = await realpath(process.cwd());
	const runtime = join(root, '.tmp', 'dev-workspace');
	const storage = join(root, '.tmp', 'dev-workspace-codeoss');
	const probe = join(storage, 'probe');
	const readyFile = join(storage, 'ready.json');
	const extensionPath = await realpath(join(root, 'extensions', 'markdown-language-features'));
	const { reportServiceReady } = await import(pathToFileURL(join(runtime, 'dist', 'index.js')).href);
	await mkdir(probe, { recursive: true });
	await rm(readyFile, { force: true });
	await writeFile(join(probe, 'package.json'), JSON.stringify({
		name: 'dev-workspace-probe', publisher: 'local', version: '0.0.1',
		engines: { vscode: '^1.100.0' }, main: './extension.cjs', activationEvents: ['*'],
	}));
	await writeFile(join(probe, 'extension.cjs'), await readFile(join(runtime, 'scripts', 'vscodeProbe.cjs')));
	const { stdout } = await promisify(execFile)('git', ['branch', '--show-current'], { cwd: root });
	const branch = stdout.trim() || (await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })).stdout.trim();
	const titlePrefix = '${dirty}${activeEditorShort}${separator}Code OSS${separator}' + basename(root) + '${separator}';
	const workspace = join(storage, 'workspace.code-workspace');
	await writeFile(workspace, JSON.stringify({ folders: [{ path: root }], settings: { 'window.title': titlePrefix + branch } }));
	const child = spawn(process.execPath, [
		'.agents/skills/launch/scripts/launch.ts', '--repo', root, '--wait', '--skip-prelaunch',
		'--session-title', `Code OSS - ${basename(root)} - ${branch}`, '--disable-workspace-trust',
		'--', `--extensionDevelopmentPath=${extensionPath}`, `--extensionDevelopmentPath=${probe}`, workspace,
	], {
		cwd: root, stdio: ['ignore', 'pipe', 'inherit'],
		env: {
			...process.env, DEV_WORKSPACE_EXTENSION_ID: 'vscode.markdown-language-features', DEV_WORKSPACE_READY_FILE: readyFile,
			DEV_WORKSPACE_ROOT: root, DEV_WORKSPACE_TITLE_PREFIX: titlePrefix,
		},
	});
	const exited = new Promise<void>((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Code OSS launcher exited with ${code ?? signal}.`));
			}
		});
	});
	const stopped = exited.then(() => { throw new Error('Code OSS exited before extension readiness.'); });
	void stopped.catch(() => {});
	const lines = createInterface({ input: child.stdout });
	const launched = new Promise<ILaunchResult>((resolve, reject) => {
		lines.once('line', line => {
			try {
				const result: unknown = JSON.parse(line);
				if (!result || typeof result !== 'object'
					|| !('pid' in result) || typeof result.pid !== 'number'
					|| !('cdpPort' in result) || typeof result.cdpPort !== 'number'
					|| !('extHostPort' in result) || typeof result.extHostPort !== 'number'
					|| !('mainPort' in result) || typeof result.mainPort !== 'number'
					|| !('runDir' in result) || typeof result.runDir !== 'string'
					|| !('logFile' in result) || typeof result.logFile !== 'string'
					|| !('userDataDir' in result) || typeof result.userDataDir !== 'string') {
					throw new Error('Invalid launch skill result.');
				}
				resolve({ pid: result.pid, cdpPort: result.cdpPort, extHostPort: result.extHostPort, mainPort: result.mainPort, runDir: result.runDir, logFile: result.logFile, userDataDir: result.userDataDir });
			} catch (error) {
				reject(error);
			}
		});
	});
	let result: ILaunchResult | undefined;
	const activation = new AbortController();
	try {
		result = await Promise.race([launched, stopped]);
		await Promise.race([waitForActivation(readyFile, extensionPath, activation.signal), stopped]);
		reportServiceReady({ ...result, pid: String(result.pid), extensionPath, extensionId: 'vscode.markdown-language-features' });
		await exited;
	} catch (error) {
		if (result) {
			await promisify(execFile)(process.execPath, ['.agents/skills/launch/scripts/cleanup/cleanup.ts', result.runDir], { cwd: root });
		}
		throw error;
	} finally {
		activation.abort();
		lines.close();
	}
}

async function waitForActivation(readyFile: string, extensionPath: string, signal: AbortSignal): Promise<void> {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		let text: string | undefined;
		try {
			text = await readFile(readyFile, 'utf8');
		} catch (error) {
			if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
				throw error;
			}
		}
		if (text !== undefined) {
			const ready: unknown = JSON.parse(text);
			if (!ready || typeof ready !== 'object') {
				throw new Error('Invalid extension readiness result.');
			}
			if ('error' in ready) {
				throw new Error(`Markdown extension activation failed: ${ready.error}`);
			}
			if (!('extensionPath' in ready) || typeof ready.extensionPath !== 'string'
				|| await realpath(ready.extensionPath) !== extensionPath) {
				throw new Error('Code OSS loaded a different Markdown extension checkout.');
			}
			return;
		}
		await delay(100, undefined, { signal });
	}
	throw new Error('Timed out waiting for Markdown extension activation.');
}

try {
	await main();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
