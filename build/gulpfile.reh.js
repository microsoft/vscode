/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');

const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');

const vfs = require('vinyl-fs');
const flatmap = require('gulp-flatmap');
const gunzip = require('gulp-gunzip');
const untar = require('gulp-untar');
const File = require('vinyl');
const fs = require('fs');

const cp = require('child_process');

const REPO_ROOT = path.dirname(__dirname);

const noop = () => { return Promise.resolve(); };

gulp.task('vscode-reh-win32-ia32-min', noop);
gulp.task('vscode-reh-win32-x64-min', noop);
gulp.task('vscode-reh-darwin-min', noop);
gulp.task('vscode-reh-linux-x64-min', noop);
gulp.task('vscode-reh-linux-armhf-min', noop);
gulp.task('vscode-reh-linux-alpine-min', noop);


function getNodeVersion() {
	const yarnrc = fs.readFileSync(path.join(REPO_ROOT, 'remote', '.yarnrc'), 'utf8');
	const target = /^target "(.*)"$/m.exec(yarnrc)[1];
	return target;
}

function ensureDirs(dirPath) {
	if (!fs.existsSync(dirPath)) {
		ensureDirs(path.dirname(dirPath));
		fs.mkdirSync(dirPath);
	}
}

/* Downloads the node executable used for the remote server to ./build/node-remote */
gulp.task(task.define('node-remote', () => {
	const VERSION = getNodeVersion();
	const nodePath = path.join('.build', 'node-remote');
	const nodeVersionPath = path.join(nodePath, 'version');
	if (!fs.existsSync(nodeVersionPath) || fs.readFileSync(nodeVersionPath).toString() !== VERSION) {
		ensureDirs(nodePath);
		util.rimraf(nodePath);
		fs.writeFileSync(nodeVersionPath, VERSION);
		return nodejs(process.platform, process.arch).pipe(vfs.dest(nodePath));
	}
	return vfs.src(nodePath);
}));

function nodejs(platform, arch) {
	const VERSION = getNodeVersion();

	if (arch === 'ia32') {
		arch = 'x86';
	}

	if (platform === 'win32') {
		const downloadPath = `/dist/v${VERSION}/win-${arch}/node.exe`;

		return (
			util.download({ host: 'nodejs.org', path: downloadPath })
				.pipe(es.through(function (data) {
					// base comes in looking like `https:\nodejs.org\dist\v10.2.1\win-x64\node.exe`
					this.emit('data', new File({
						path: data.path,
						base: data.base.replace(/\\node\.exe$/, ''),
						contents: data.contents,
						stat: {
							isFile: true,
							mode: /* 100755 */ 33261
						}
					}));
				}))
		);
	}

	if (arch === 'alpine') {
		return es.readArray([
			new File({
				path: 'node',
				contents: cp.execSync(`docker run --rm node:${VERSION}-alpine /bin/sh -c 'cat \`which node\`'`, { maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' }),
				stat: {
					mode: parseInt('755', 8)
				}
			})
		]);
	}

	if (platform === 'darwin') {
		arch = 'x64';
	}

	if (arch === 'armhf') {
		arch = 'armv7l';
	}

	const downloadPath = `/dist/v${VERSION}/node-v${VERSION}-${platform}-${arch}.tar.gz`;

	return (
		util.download({ host: 'nodejs.org', path: downloadPath })
			.pipe(flatmap(stream => stream.pipe(gunzip()).pipe(untar())))
			.pipe(es.through(function (data) {
				// base comes in looking like `https:/nodejs.org/dist/v8.9.3/node-v8.9.3-darwin-x64.tar.gz`
				// => we must remove the `.tar.gz`
				// Also, keep only bin/node
				if (/\/bin\/node$/.test(data.path)) {
					this.emit('data', new File({
						path: data.path.replace(/bin\/node$/, 'node'),
						base: data.base.replace(/\.tar\.gz$/, ''),
						contents: data.contents,
						stat: {
							isFile: true,
							mode: /* 100755 */ 33261
						}
					}));
				}
			}))
	);
}

function mixinServer(watch) {
	const packageJSONPath = path.join(path.dirname(__dirname), 'package.json');
	function exec(cmdLine) {
		console.log(cmdLine);
		cp.execSync(cmdLine, { stdio: "inherit" });
	}
	function checkout() {
		const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath).toString());
		exec('git fetch distro');
		exec(`git checkout ${packageJSON['distro']} -- src/vs/server resources/server`);
		exec('git reset HEAD src/vs/server resources/server');
	}
	checkout();
	if (watch) {
		console.log('Enter watch mode (observing package.json)');
		const watcher = fs.watch(packageJSONPath);
		watcher.addListener('change', () => {
			try {
				checkout();
			} catch (e) {
				console.log(e);
			}
		});
	}
	return Promise.resolve();
}

gulp.task(task.define('mixin-server', () => mixinServer(false)));
gulp.task(task.define('mixin-server-watch', () => mixinServer(true)));
