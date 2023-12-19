/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const cp = require('child_process');
const util = require('./lib/util');
const task = require('./lib/task');
const pkg = require('../package.json');
const product = require('../product.json');
const vfs = require('vinyl-fs');
const rcedit = require('rcedit');
const mkdirp = require('mkdirp');

const repoPath = path.dirname(__dirname);
const buildPath = (/** @type {string} */ arch) => path.join(path.dirname(repoPath), `VSCode-win32-${arch}`);
const setupDir = (/** @type {string} */ arch, /** @type {string} */ target) => path.join(repoPath, '.build', `win32-${arch}`, `${target}-setup`);
const issPath = path.join(__dirname, 'win32', 'code.iss');
const innoSetupPath = path.join(path.dirname(path.dirname(require.resolve('innosetup'))), 'bin', 'ISCC.exe');
const signWin32Path = path.join(repoPath, 'build', 'azure-pipelines', 'common', 'sign-win32');

function packageInnoSetup(iss, options, cb) {
	options = options || {};

	const definitions = options.definitions || {};

	if (process.argv.some(arg => arg === '--debug-inno')) {
		definitions['Debug'] = 'true';
	}

	if (process.argv.some(arg => arg === '--sign')) {
		definitions['Sign'] = 'true';
	}

	const keys = Object.keys(definitions);

	keys.forEach(key => assert(typeof definitions[key] === 'string', `Missing value for '${key}' in Inno Setup package step`));

	const defs = keys.map(key => `/d${key}=${definitions[key]}`);
	const args = [
		iss,
		...defs,
		`/sesrp=node ${signWin32Path} $f`
	];

	cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'inherit', 'inherit'] })
		.on('error', cb)
		.on('exit', code => {
			if (code === 0) {
				cb(null);
			} else {
				cb(new Error(`InnoSetup returned exit code: ${code}`));
			}
		});
}

/**
 * @param {string} arch
 * @param {string} target
 */
function buildWin32Setup(arch, target) {
	if (target !== 'system' && target !== 'user') {
		throw new Error('Invalid setup target');
	}

	return cb => {
		const x64AppId = target === 'system' ? product.win32x64AppId : product.win32x64UserAppId;
		const arm64AppId = target === 'system' ? product.win32arm64AppId : product.win32arm64UserAppId;

		const sourcePath = buildPath(arch);
		const outputPath = setupDir(arch, target);
		mkdirp.sync(outputPath);

		const originalProductJsonPath = path.join(sourcePath, 'resources/app/product.json');
		const productJsonPath = path.join(outputPath, 'product.json');
		const productJson = JSON.parse(fs.readFileSync(originalProductJsonPath, 'utf8'));
		productJson['target'] = target;
		fs.writeFileSync(productJsonPath, JSON.stringify(productJson, undefined, '\t'));

		const quality = product.quality || 'dev';
		const definitions = {
			NameLong: product.nameLong,
			NameShort: product.nameShort,
			DirName: product.win32DirName,
			Version: pkg.version,
			RawVersion: pkg.version.replace(/-\w+$/, ''),
			NameVersion: product.win32NameVersion + (target === 'user' ? ' (User)' : ''),
			ExeBasename: product.nameShort,
			RegValueName: product.win32RegValueName,
			ShellNameShort: product.win32ShellNameShort,
			AppMutex: product.win32MutexName,
			TunnelMutex: product.win32TunnelMutex,
			TunnelServiceMutex: product.win32TunnelServiceMutex,
			TunnelApplicationName: product.tunnelApplicationName,
			ApplicationName: product.applicationName,
			Arch: arch,
			AppId: { 'x64': x64AppId, 'arm64': arm64AppId }[arch],
			IncompatibleTargetAppId: { 'x64': product.win32x64AppId, 'arm64': product.win32arm64AppId }[arch],
			AppUserId: product.win32AppUserModelId,
			ArchitecturesAllowed: { 'x64': 'x64', 'arm64': 'arm64' }[arch],
			ArchitecturesInstallIn64BitMode: { 'x64': 'x64', 'arm64': 'arm64' }[arch],
			SourceDir: sourcePath,
			RepoDir: repoPath,
			OutputDir: outputPath,
			InstallTarget: target,
			ProductJsonPath: productJsonPath,
			Quality: quality
		};

		if (quality === 'insider') {
			definitions['AppxPackage'] = `code_insiders_explorer_${arch}.appx`;
			definitions['AppxPackageFullname'] = `Microsoft.${product.win32RegValueName}_1.0.0.0_neutral__8wekyb3d8bbwe`;
		}

		packageInnoSetup(issPath, { definitions }, cb);
	};
}

/**
 * @param {string} arch
 * @param {string} target
 */
function defineWin32SetupTasks(arch, target) {
	const cleanTask = util.rimraf(setupDir(arch, target));
	gulp.task(task.define(`vscode-win32-${arch}-${target}-setup`, task.series(cleanTask, buildWin32Setup(arch, target))));
}

defineWin32SetupTasks('x64', 'system');
defineWin32SetupTasks('arm64', 'system');
defineWin32SetupTasks('x64', 'user');
defineWin32SetupTasks('arm64', 'user');

/**
 * @param {string} arch
 */
function copyInnoUpdater(arch) {
	return () => {
		return gulp.src('build/win32/{inno_updater.exe,vcruntime140.dll}', { base: 'build/win32' })
			.pipe(vfs.dest(path.join(buildPath(arch), 'tools')));
	};
}

/**
 * @param {string} executablePath
 */
function updateIcon(executablePath) {
	return cb => {
		const icon = path.join(repoPath, 'resources', 'win32', 'code.ico');
		rcedit(executablePath, { icon }, cb);
	};
}

gulp.task(task.define('vscode-win32-x64-inno-updater', task.series(copyInnoUpdater('x64'), updateIcon(path.join(buildPath('x64'), 'tools', 'inno_updater.exe')))));
gulp.task(task.define('vscode-win32-arm64-inno-updater', task.series(copyInnoUpdater('arm64'), updateIcon(path.join(buildPath('arm64'), 'tools', 'inno_updater.exe')))));
