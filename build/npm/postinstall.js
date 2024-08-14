/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const { dirs } = require('./dirs');
const { setupBuildNpmrc, setupRemoteNpmrc } = require('./setupNpmrc');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = path.dirname(path.dirname(__dirname));

function log(dir, message) {
	if (process.stdout.isTTY) {
		console.log(`\x1b[34m[${dir}]\x1b[0m`, message);
	} else {
		console.log(`[${dir}]`, message);
	}
}

function run(command, args, opts) {
	log(opts.cwd || '.', '$ ' + command + ' ' + args.join(' '));

	const result = cp.spawnSync(command, args, opts);

	if (result.error) {
		console.error(`ERR Failed to spawn process: ${result.error}`);
		process.exit(1);
	} else if (result.status !== 0) {
		console.error(`ERR Process exited with code: ${result.status}`);
		process.exit(result.status);
	}
}

/**
 * @param {string} dir
 * @param {*} [opts]
 */
function npmInstall(dir, opts) {
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
		run('sudo', ['docker', 'run', '-e', 'GITHUB_TOKEN', '-e', 'npm_config_arch', '-e', 'npm_config_disturl', '-e', 'npm_config_target', '-e', 'npm_config_runtime', '-e', 'npm_config_ms_build_id', '-e', 'npm_config_build_from_source', '-e', 'npm_config_legacy_peer_deps', '-v', `${process.env['VSCODE_HOST_MOUNT']}:/root/vscode`, '-v', `${process.env['VSCODE_HOST_MOUNT']}/.build/.netrc:/root/.netrc`, '-w', path.resolve(root, dir), process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'], 'npm', command], opts);
		run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, `${dir}/node_modules`], opts);
	} else {
		log(dir, 'Installing dependencies...');
		run(npm, [command], opts);
	}
}

for (let dir of dirs) {

	if (dir === '') {
		// already executed in root
		continue;
	}

	let opts;

	if (dir === 'build') {
		const env = { ...process.env };
		setupBuildNpmrc(env);
		opts = { env };
		if (process.env['CC']) { env['CC'] = 'gcc'; }
		if (process.env['CXX']) { env['CXX'] = 'g++'; }
		if (process.env['CXXFLAGS']) { env['CXXFLAGS'] = ''; }
		if (process.env['LDFLAGS']) { env['LDFLAGS'] = ''; }
		npmInstall('build', opts);
		continue;
	}

	if (/^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		// node modules used by vscode server
		const env = { ...process.env };
		setupRemoteNpmrc(env);
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

		opts = { env };
	}

	npmInstall(dir, opts);
}

cp.execSync('git config pull.rebase merges');
cp.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');
