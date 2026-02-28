/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { dirs } from './dirs.ts';
import { root, stateFile, computeState, isUpToDate } from './installStateHash.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootNpmrcConfigKeys = getNpmrcConfigKeys(path.join(root, '.npmrc'));

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

async function npmInstallAsync(dir: string, opts?: child_process.SpawnOptions): Promise<void> {
	const finalOpts: child_process.SpawnOptions = {
		env: { ...process.env },
		...(opts ?? {}),
		cwd: path.join(root, dir),
		shell: true,
	};

	const command = process.env['npm_command'] || 'install';

	if (process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'] && /^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		const syncOpts: child_process.SpawnSyncOptions = {
			env: finalOpts.env,
			cwd: root,
			stdio: 'inherit',
			shell: true,
		};
		const userinfo = os.userInfo();
		log(dir, `Installing dependencies inside container ${process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME']}...`);

		if (process.env['npm_config_arch'] === 'arm64') {
			run('sudo', ['docker', 'run', '--rm', '--privileged', 'multiarch/qemu-user-static', '--reset', '-p', 'yes'], syncOpts);
		}
		run('sudo', [
			'docker', 'run',
			'-e', 'GITHUB_TOKEN',
			'-v', `${process.env['VSCODE_HOST_MOUNT']}:/root/vscode`,
			'-v', `${process.env['VSCODE_HOST_MOUNT']}/.build/.netrc:/root/.netrc`,
			'-v', `${process.env['VSCODE_NPMRC_PATH']}:/root/.npmrc`,
			'-w', path.resolve('/root/vscode', dir),
			process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'],
			'sh', '-c', `\"chown -R root:root ${path.resolve('/root/vscode', dir)} && export PATH="/root/vscode/.build/nodejs-musl/usr/local/bin:$PATH" && npm i -g node-gyp-build && npm ci\"`
		], syncOpts);
		run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, `${path.resolve(root, dir)}`], syncOpts);
	} else {
		log(dir, 'Installing dependencies...');
		const output = await spawnAsync(npm, command.split(' '), finalOpts);
		if (output.trim()) {
			for (const line of output.trim().split('\n')) {
				log(dir, line);
			}
		}
	}
	removeParcelWatcherPrebuild(dir);
}

function setNpmrcConfig(dir: string, env: NodeJS.ProcessEnv) {
	const npmrcPath = path.join(root, dir, '.npmrc');
	const lines = fs.readFileSync(npmrcPath, 'utf8').split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine && !trimmedLine.startsWith('#')) {
			const [key, value] = trimmedLine.split('=');
			env[`npm_config_${key}`] = value.replace(/^"(.*)"$/, '$1');
		}
	}

	// Use our bundled node-gyp version
	env['npm_config_node_gyp'] =
		process.platform === 'win32'
			? path.join(import.meta.dirname, 'gyp', 'node_modules', '.bin', 'node-gyp.cmd')
			: path.join(import.meta.dirname, 'gyp', 'node_modules', '.bin', 'node-gyp');

	// Force node-gyp to use process.config on macOS
	// which defines clang variable as expected. Otherwise we
	// run into compilation errors due to incorrect compiler
	// configuration.
	// NOTE: This means the process.config should contain
	// the correct clang variable. So keep the version check
	// in preinstall sync with this logic.
	// Change was first introduced in https://github.com/nodejs/node/commit/6e0a2bb54c5bbeff0e9e33e1a0c683ed980a8a0f
	if ((dir === 'remote' || dir === 'build') && process.platform === 'darwin') {
		env['npm_config_force_process_config'] = 'true';
	} else {
		delete env['npm_config_force_process_config'];
	}

	if (dir === 'build') {
		env['npm_config_target'] = process.versions.node;
		env['npm_config_arch'] = process.arch;
	}
}

function removeParcelWatcherPrebuild(dir: string) {
	const parcelModuleFolder = path.join(root, dir, 'node_modules', '@parcel');
	if (!fs.existsSync(parcelModuleFolder)) {
		return;
	}

	const parcelModules = fs.readdirSync(parcelModuleFolder);
	for (const moduleName of parcelModules) {
		if (moduleName.startsWith('watcher-')) {
			const modulePath = path.join(parcelModuleFolder, moduleName);
			fs.rmSync(modulePath, { recursive: true, force: true });
			log(dir, `Removed @parcel/watcher prebuilt module ${modulePath}`);
		}
	}
}

function getNpmrcConfigKeys(npmrcPath: string): string[] {
	if (!fs.existsSync(npmrcPath)) {
		return [];
	}
	const lines = fs.readFileSync(npmrcPath, 'utf8').split('\n');
	const keys: string[] = [];
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine && !trimmedLine.startsWith('#')) {
			const eqIndex = trimmedLine.indexOf('=');
			if (eqIndex > 0) {
				keys.push(trimmedLine.substring(0, eqIndex).trim());
			}
		}
	}
	return keys;
}

function clearInheritedNpmrcConfig(dir: string, env: NodeJS.ProcessEnv): void {
	const dirNpmrcPath = path.join(root, dir, '.npmrc');
	if (fs.existsSync(dirNpmrcPath)) {
		return;
	}

	for (const key of rootNpmrcConfigKeys) {
		const envKey = `npm_config_${key.replace(/-/g, '_')}`;
		delete env[envKey];
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
	if (!process.env['VSCODE_FORCE_INSTALL'] && isUpToDate()) {
		log('.', 'All dependencies up to date, skipping postinstall.');
		child_process.execSync('git config pull.rebase merges');
		child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');
		return;
	}

	const _state = computeState();

	const nativeTasks: (() => Promise<void>)[] = [];
	const parallelTasks: (() => Promise<void>)[] = [];

	for (const dir of dirs) {
		if (dir === '') {
			removeParcelWatcherPrebuild(dir);
			continue; // already executed in root
		}

		if (dir === 'build') {
			nativeTasks.push(() => {
				const env: NodeJS.ProcessEnv = { ...process.env };
				if (process.env['CC']) { env['CC'] = 'gcc'; }
				if (process.env['CXX']) { env['CXX'] = 'g++'; }
				if (process.env['CXXFLAGS']) { env['CXXFLAGS'] = ''; }
				if (process.env['LDFLAGS']) { env['LDFLAGS'] = ''; }
				setNpmrcConfig('build', env);
				return npmInstallAsync('build', { env });
			});
			continue;
		}

		if (/^(.build\/distro\/npm\/)?remote$/.test(dir)) {
			const remoteDir = dir;
			nativeTasks.push(() => {
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
				if (process.env['VSCODE_REMOTE_NODE_GYP']) { env['npm_config_node_gyp'] = process.env['VSCODE_REMOTE_NODE_GYP']; }
				setNpmrcConfig('remote', env);
				return npmInstallAsync(remoteDir, { env });
			});
			continue;
		}

		const taskDir = dir;
		parallelTasks.push(() => {
			const env = { ...process.env };
			clearInheritedNpmrcConfig(taskDir, env);
			return npmInstallAsync(taskDir, { env });
		});
	}

	// Native dirs (build, remote) run sequentially to avoid node-gyp conflicts
	for (const task of nativeTasks) {
		await task();
	}

	// JS-only dirs run in parallel
	const concurrency = Math.min(os.cpus().length, 8);
	log('.', `Running ${parallelTasks.length} npm installs with concurrency ${concurrency}...`);
	await runWithConcurrency(parallelTasks, concurrency);

	child_process.execSync('git config pull.rebase merges');
	child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');

	fs.writeFileSync(stateFile, JSON.stringify(_state));
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
