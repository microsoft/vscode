/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { dirs } from './dirs.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = path.dirname(path.dirname(import.meta.dirname));

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

function npmInstall(dir: string, opts?: child_process.SpawnSyncOptions) {
	opts = {
		env: { ...process.env },
		...(opts ?? {}),
		cwd: dir,
		stdio: 'inherit',
		shell: true
	};

	const command = process.env['npm_command'] || 'install';

	if (process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'] && /^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		const userinfo = os.userInfo();
		log(dir, `Installing dependencies inside container ${process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME']}...`);

		opts.cwd = root;
		if (process.env['npm_config_arch'] === 'arm64') {
			run('sudo', ['docker', 'run', '--rm', '--privileged', 'multiarch/qemu-user-static', '--reset', '-p', 'yes'], opts);
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
		], opts);
		run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, `${path.resolve(root, dir)}`], opts);
	} else {
		log(dir, 'Installing dependencies...');
		run(npm, command.split(' '), opts);
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

/**
 * Fixes ajv version conflict: ajv-keywords@5.x requires ajv@8.x but npm dedupes to ajv@6.x
 * Copy ajv@8.x from schema-utils/node_modules/ajv to ajv-keywords/node_modules/ajv
 */
function fixAjvVersionConflict(dir: string) {
	const ajvKeywordsPath = path.join(root, dir, 'node_modules', 'ajv-keywords');
	const schemaUtilsAjvPath = path.join(root, dir, 'node_modules', 'schema-utils', 'node_modules', 'ajv');

	// Only fix if ajv-keywords exists and schema-utils has its own ajv@8
	if (!fs.existsSync(ajvKeywordsPath) || !fs.existsSync(schemaUtilsAjvPath)) {
		return;
	}

	const ajvKeywordsNestedPath = path.join(ajvKeywordsPath, 'node_modules', 'ajv');

	// Skip if already fixed
	if (fs.existsSync(ajvKeywordsNestedPath)) {
		return;
	}

	// Check if schema-utils/node_modules/ajv is version 8.x
	try {
		const ajvPkg = JSON.parse(fs.readFileSync(path.join(schemaUtilsAjvPath, 'package.json'), 'utf8'));
		if (!ajvPkg.version.startsWith('8.')) {
			return;
		}

		// Create nested node_modules and copy ajv@8
		fs.mkdirSync(path.join(ajvKeywordsPath, 'node_modules'), { recursive: true });
		fs.cpSync(schemaUtilsAjvPath, ajvKeywordsNestedPath, { recursive: true });
		log(dir, `Fixed ajv version conflict: copied ajv@${ajvPkg.version} to ajv-keywords/node_modules/ajv`);
	} catch (e) {
		// Ignore errors - this is a best-effort fix
	}
}

for (const dir of dirs) {

	if (dir === '') {
		removeParcelWatcherPrebuild(dir);
		fixAjvVersionConflict(dir);
		continue; // already executed in root
	}

	let opts: child_process.SpawnSyncOptions | undefined;

	if (dir === 'build') {
		opts = {
			env: {
				...process.env
			},
		};
		if (process.env['CC']) { opts.env!['CC'] = 'gcc'; }
		if (process.env['CXX']) { opts.env!['CXX'] = 'g++'; }
		if (process.env['CXXFLAGS']) { opts.env!['CXXFLAGS'] = ''; }
		if (process.env['LDFLAGS']) { opts.env!['LDFLAGS'] = ''; }

		setNpmrcConfig('build', opts.env!);
		npmInstall('build', opts);
		continue;
	}

	if (/^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		// node modules used by vscode server
		opts = {
			env: {
				...process.env
			},
		};
		if (process.env['VSCODE_REMOTE_CC']) {
			opts.env!['CC'] = process.env['VSCODE_REMOTE_CC'];
		} else {
			delete opts.env!['CC'];
		}
		if (process.env['VSCODE_REMOTE_CXX']) {
			opts.env!['CXX'] = process.env['VSCODE_REMOTE_CXX'];
		} else {
			delete opts.env!['CXX'];
		}
		if (process.env['CXXFLAGS']) { delete opts.env!['CXXFLAGS']; }
		if (process.env['CFLAGS']) { delete opts.env!['CFLAGS']; }
		if (process.env['LDFLAGS']) { delete opts.env!['LDFLAGS']; }
		if (process.env['VSCODE_REMOTE_CXXFLAGS']) { opts.env!['CXXFLAGS'] = process.env['VSCODE_REMOTE_CXXFLAGS']; }
		if (process.env['VSCODE_REMOTE_LDFLAGS']) { opts.env!['LDFLAGS'] = process.env['VSCODE_REMOTE_LDFLAGS']; }
		if (process.env['VSCODE_REMOTE_NODE_GYP']) { opts.env!['npm_config_node_gyp'] = process.env['VSCODE_REMOTE_NODE_GYP']; }

		setNpmrcConfig('remote', opts.env!);
		npmInstall(dir, opts);
		continue;
	}

	npmInstall(dir, opts);
}

child_process.execSync('git config pull.rebase merges');
child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');
