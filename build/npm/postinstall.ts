/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { workspaceMembers, separateRoots, distroRoots } from './dirs.ts';
import { root, stateFile, stateContentsFile, computeState, computeContents, isUpToDate } from './installStateHash.ts';
import { ensureElectronTypes } from './electronTypes.ts';
import { finishCloudSandbox } from './cloudSandbox.ts';
import { getNativeBuildEnv, nativeBuildKeys } from './pnpm/nativeBuildEnv.ts';
import { getPinnedPnpmVersion, getPnpmCommand } from '../lib/pnpm.ts';

const pnpm = getPnpmCommand();

function log(dir: string, message: string) {
	if (process.stdout.isTTY) {
		console.log(`\x1b[34m[${dir}]\x1b[0m`, message);
	} else {
		console.log(`[${dir}]`, message);
	}
}

function run(command: string, args: string[], opts: child_process.SpawnSyncOptions) {
	log(opts.cwd as string || '.', '$ ' + command + ' ' + args.join(' '));

	const result = child_process.spawnSync(command, args, opts);

	if (result.error) {
		console.error(`ERR Failed to spawn process: ${result.error}`);
		process.exit(1);
	} else if (result.status !== 0) {
		console.error(`ERR Process exited with code: ${result.status}`);
		process.exit(result.status);
	}
}

function spawnAsync(command: string, args: string[], opts: child_process.SpawnOptions): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = child_process.spawn(command, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
		child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
		child.on('error', reject);
		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`Process exited with code: ${code}\n${output}`));
			} else {
				resolve(output);
			}
		});
	});
}

/**
 * Installs a separate pnpm install root. The install is frozen when the install that runs this
 * script is: in CI (pnpm's default), with `--frozen-lockfile` (exported by the root `.pnpmfile.mts`)
 * or with `pnpm_config_frozen_lockfile=true`. Otherwise it updates an outdated lockfile.
 */
async function pnpmInstallAsync(dir: string, env: NodeJS.ProcessEnv): Promise<void> {
	if (process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'] && /^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		const syncOpts: child_process.SpawnSyncOptions = {
			env,
			cwd: root,
			stdio: 'inherit',
			shell: true,
		};
		const userinfo = os.userInfo();
		const pnpmVersion = getPinnedPnpmVersion(root);
		if (!pnpmVersion) {
			throw new Error('The root package.json must pin pnpm in its packageManager field.');
		}
		// The container gets the pinned pnpm in the mounted musl Node.js and keeps its own store
		// inside the mounted repository, so it never writes to the host's pnpm store.
		const storeDir = '/root/vscode/.build/pnpm-store-container';
		log(dir, `Installing dependencies inside container ${process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME']}...`);

		if (process.env['npm_config_arch'] === 'arm64') {
			run('sudo', ['docker', 'run', '--rm', '--privileged', 'vscodehub.azurecr.io/multiarch/qemu-user-static@sha256:fe60359c92e86a43cc87b3d906006245f77bfc0565676b80004cc666e4feb9f0', '--reset', '-p', 'yes'], syncOpts);
		}
		run('sudo', [
			'docker', 'run',
			'-e', 'GITHUB_TOKEN',
			'-v', `${process.env['VSCODE_HOST_MOUNT']}:/root/vscode`,
			'-v', `${process.env['VSCODE_HOST_MOUNT']}/.build/.gitconfig-distro:/root/.gitconfig`,
			'-v', `${process.env['VSCODE_NPMRC_PATH']}:/root/.npmrc`,
			'-w', path.resolve('/root/vscode', dir),
			process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'],
			'sh', '-c', `\"chown -R root:root ${path.resolve('/root/vscode', dir)} && export PATH="/root/vscode/.build/nodejs-musl/usr/local/bin:$PATH" && npm i -g node-gyp-build pnpm@${pnpmVersion} && pnpm install --frozen-lockfile --store-dir ${storeDir}\"`
		], syncOpts);
		run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, `${path.resolve(root, dir)}`], syncOpts);
		if (fs.existsSync(path.join(root, '.build', 'pnpm-store-container'))) {
			run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, path.join(root, '.build', 'pnpm-store-container')], syncOpts);
		}
	} else {
		log(dir, 'Installing dependencies...');
		const output = await spawnAsync(pnpm.command, [...pnpm.args, 'install'], { env, cwd: path.join(root, dir), shell: pnpm.shell });
		if (output.trim()) {
			for (const line of output.trim().split('\n')) {
				log(dir, line);
			}
		}
	}
}

/**
 * Applies native module build variables (`undefined` removes a variable).
 */
function applyEnv(env: NodeJS.ProcessEnv, values: Record<string, string | undefined>): NodeJS.ProcessEnv {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) {
			delete env[key];
		} else {
			env[key] = value;
		}
	}
	return env;
}

/**
 * Removes the native build variables that the workspace's `.pnpmfile.mts` exported, for roots
 * without a pnpmfile that don't build for Electron.
 */
function clearNativeBuildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	for (const key of nativeBuildKeys) {
		delete env[`npm_config_${key}`];
	}
	return env;
}

function getRemoteEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	if (process.env['VSCODE_REMOTE_CC']) {
		env['CC'] = process.env['VSCODE_REMOTE_CC'];
	} else {
		delete env['CC'];
	}
	if (process.env['VSCODE_REMOTE_CXX']) {
		env['CXX'] = process.env['VSCODE_REMOTE_CXX'];
	} else {
		delete env['CXX'];
	}
	if (process.env['CXXFLAGS']) { delete env['CXXFLAGS']; }
	if (process.env['CFLAGS']) { delete env['CFLAGS']; }
	if (process.env['LDFLAGS']) { delete env['LDFLAGS']; }
	if (process.env['VSCODE_REMOTE_CXXFLAGS']) { env['CXXFLAGS'] = process.env['VSCODE_REMOTE_CXXFLAGS']; }
	if (process.env['VSCODE_REMOTE_LDFLAGS']) { env['LDFLAGS'] = process.env['VSCODE_REMOTE_LDFLAGS']; }
	return env;
}

/**
 * Removes the prebuilt `@parcel/watcher-<platform>` packages so that `@parcel/watcher` loads the
 * binary built from source. With the hoisted layout they can be in the install root's
 * `node_modules` or in a workspace member's own `node_modules`.
 */
function removeParcelWatcherPrebuilds(dir: string) {
	for (const parcelModuleFolder of [
		path.join(root, dir, 'node_modules', '@parcel'),
		path.join(root, dir, 'node_modules', '@parcel', 'watcher', 'node_modules', '@parcel'),
	]) {
		if (!fs.existsSync(parcelModuleFolder)) {
			continue;
		}
		for (const moduleName of fs.readdirSync(parcelModuleFolder)) {
			if (moduleName.startsWith('watcher-')) {
				const modulePath = path.join(parcelModuleFolder, moduleName);
				fs.rmSync(modulePath, { recursive: true, force: true });
				log(dir || '.', `Removed @parcel/watcher prebuilt module ${modulePath}`);
			}
		}
	}
}

function ensureAgentHarnessLink(sourceRelativePath: string, linkPath: string): 'existing' | 'junction' | 'symlink' | 'hard link' {
	if (fs.existsSync(linkPath)) {
		return 'existing';
	}

	const sourcePath = path.resolve(path.dirname(linkPath), sourceRelativePath);
	const isDirectory = fs.statSync(sourcePath).isDirectory();

	try {
		if (process.platform === 'win32' && isDirectory) {
			fs.symlinkSync(sourcePath, linkPath, 'junction');
			return 'junction';
		}

		fs.symlinkSync(sourceRelativePath, linkPath, isDirectory ? 'dir' : 'file');
		return 'symlink';
	} catch (error) {
		if (process.platform === 'win32' && !isDirectory && (error as NodeJS.ErrnoException).code === 'EPERM') {
			fs.linkSync(sourcePath, linkPath);
			return 'hard link';
		}

		throw error;
	}
}

async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
	const errors: Error[] = [];
	let index = 0;

	async function worker() {
		while (index < tasks.length) {
			const i = index++;
			try {
				await tasks[i]();
			} catch (err) {
				errors.push(err as Error);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

	if (errors.length > 0) {
		for (const err of errors) {
			console.error(err.message);
		}
		process.exit(1);
	}
}

async function main() {
	await ensureElectronTypes();

	if (!process.env['VSCODE_FORCE_INSTALL'] && isUpToDate()) {
		finishCloudSandbox();
		log('.', 'All dependencies up to date, skipping postinstall.');
		child_process.execSync('git config pull.rebase merges');
		child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');
		return;
	}

	const _state = computeState();

	// The workspace members were installed by the `pnpm install` that runs this script.
	for (const dir of workspaceMembers) {
		removeParcelWatcherPrebuilds(dir);
	}

	const nativeTasks: (() => Promise<void>)[] = [];
	const parallelTasks: (() => Promise<void>)[] = [];

	for (const dir of [...separateRoots, ...distroRoots]) {
		const install = (env: NodeJS.ProcessEnv) => async () => {
			await pnpmInstallAsync(dir, env);
			removeParcelWatcherPrebuilds(dir);
		};

		if (dir === 'build') {
			// build/.pnpmfile.mts exports the native module build variables: build/.npmrc, the running
			// Node.js version and the host architecture.
			const env: NodeJS.ProcessEnv = { ...process.env };
			if (process.env['CC']) { env['CC'] = 'gcc'; }
			if (process.env['CXX']) { env['CXX'] = 'g++'; }
			if (process.env['CXXFLAGS']) { env['CXXFLAGS'] = ''; }
			if (process.env['LDFLAGS']) { env['LDFLAGS'] = ''; }
			nativeTasks.push(install(env));
		} else if (dir === 'remote') {
			// remote/.pnpmfile.mts exports the native module build variables of remote/.npmrc.
			nativeTasks.push(install(getRemoteEnv()));
		} else if (dir === 'extensions/copilot') {
			// No .npmrc or pnpmfile: builds native modules for Electron with the workspace's variables.
			nativeTasks.push(install({ ...process.env }));
		} else if (dir === '.build/distro/npm/remote') {
			// Distro roots have no .npmrc or pnpmfile: build for the remote server like remote/.
			nativeTasks.push(install(applyEnv(getRemoteEnv(), getNativeBuildEnv(path.join(root, 'remote'), { forceProcessConfigOnDarwin: true }))));
		} else {
			parallelTasks.push(install(clearNativeBuildEnv({ ...process.env })));
		}
	}

	// Native roots (build, remote) run sequentially to avoid node-gyp conflicts
	for (const task of nativeTasks) {
		await task();
	}

	// JS-only roots run in parallel
	const concurrency = Math.min(os.cpus().length, 8);
	log('.', `Running ${parallelTasks.length} pnpm installs with concurrency ${concurrency}...`);
	await runWithConcurrency(parallelTasks, concurrency);

	child_process.execSync('git config pull.rebase merges');
	child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');

	finishCloudSandbox();

	fs.writeFileSync(stateFile, JSON.stringify(_state));
	fs.writeFileSync(stateContentsFile, JSON.stringify(computeContents()));

	// Symlink .claude/ files to their canonical locations to test Claude agent harness
	const claudeDir = path.join(root, '.claude');
	fs.mkdirSync(claudeDir, { recursive: true });

	const claudeMdLink = path.join(claudeDir, 'CLAUDE.md');
	const claudeMdLinkType = ensureAgentHarnessLink(path.join('..', '.github', 'copilot-instructions.md'), claudeMdLink);
	if (claudeMdLinkType !== 'existing') {
		log('.', `Created ${claudeMdLinkType} .claude/CLAUDE.md -> .github/copilot-instructions.md`);
	}

	const claudeSkillsLink = path.join(claudeDir, 'skills');
	const claudeSkillsLinkType = ensureAgentHarnessLink(path.join('..', '.agents', 'skills'), claudeSkillsLink);
	if (claudeSkillsLinkType !== 'existing') {
		log('.', `Created ${claudeSkillsLinkType} .claude/skills -> .agents/skills`);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
