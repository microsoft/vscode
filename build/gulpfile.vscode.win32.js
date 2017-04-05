/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const assert = require('assert');
const cp = require('child_process');
const util = require('./lib/util');
const pkg = require('../package.json');
const product = require('../product.json');

const repoPath = path.dirname(__dirname);
const buildPath = path.join(path.dirname(repoPath), 'VSCode-win32');
const issPath = path.join(__dirname, 'win32', 'code.iss');
const innoSetupPath = path.join(path.dirname(path.dirname(require.resolve('innosetup-compiler'))), 'bin', 'ISCC.exe');

function packageInnoSetup(iss, options, cb) {
	options = options || {};

	const definitions = options.definitions || {};
	const keys = Object.keys(definitions);

	keys.forEach(key => assert(typeof definitions[key] === 'string', `Missing value for '${ key }' in Inno Setup package step`));

	const defs = keys.map(key => `/d${ key }=${ definitions[key] }`);
	const args = [iss].concat(defs);

	cp.spawn(innoSetupPath, args, { stdio: 'inherit' })
		.on('error', cb)
		.on('exit', () => cb(null));
}

function buildWin32Setup(cb) {
	const definitions = {
		NameLong: product.nameLong,
		NameShort: product.nameShort,
		DirName: product.win32DirName,
		Version: pkg.version,
		RawVersion: pkg.version.replace(/-\w+$/, ''),
		NameVersion: product.win32NameVersion,
		ExeBasename: product.nameShort,
		RegValueName: product.win32RegValueName,
		ShellNameShort: product.win32ShellNameShort,
		AppMutex: product.win32MutexName,
		AppId: product.win32AppId,
		AppUserId: product.win32AppUserModelId,
		SourceDir: buildPath,
		RepoDir: repoPath
	};

	packageInnoSetup(issPath, { definitions }, cb);
}

gulp.task('clean-vscode-win32-setup', util.rimraf('.build/win32/setup'));
gulp.task('vscode-win32-setup', ['clean-vscode-win32-setup'], buildWin32Setup);
