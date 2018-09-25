/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const fs = require('fs-extra');
const assert = require('assert');
const cp = require('child_process');
const _7z = require('7zip')['7z'];
const util = require('./lib/util');
const pkg = require('../package.json');
const product = require('../product.json');
const vfs = require('vinyl-fs');
const mkdirp = require('mkdirp');

const repoPath = path.dirname(__dirname);
const buildPath = arch => path.join(path.dirname(repoPath), `VSCode-win32-${arch}`);
const zipDir = arch => path.join(repoPath, '.build', `win32-${arch}`, 'archive');
const zipPath = arch => path.join(zipDir(arch), `VSCode-win32-${arch}.zip`);
const setupDir = (arch, target) => path.join(repoPath, '.build', `win32-${arch}`, `${target}-setup`);
const issPath = path.join(__dirname, 'win32', 'code.iss');
const innoSetupPath = path.join(path.dirname(path.dirname(require.resolve('innosetup-compiler'))), 'bin', 'ISCC.exe');
const signPS1 = path.join(repoPath, 'build', 'tfs', 'win32', 'sign.ps1');

function packageInnoSetup(iss, options, cb) {
	options = options || {};

	const definitions = options.definitions || {};
	const debug = process.argv.some(arg => arg === '--debug-inno');

	if (debug) {
		definitions['Debug'] = 'true';
	}

	const keys = Object.keys(definitions);

	keys.forEach(key => assert(typeof definitions[key] === 'string', `Missing value for '${key}' in Inno Setup package step`));

	const defs = keys.map(key => `/d${key}=${definitions[key]}`);
	const args = [
		iss,
		...defs,
		`/sesrp=powershell.exe -ExecutionPolicy bypass ${signPS1} $f`
	];

	cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'inherit', 'inherit'] })
		.on('error', cb)
		.on('exit', () => cb(null));
}

function buildWin32Setup(arch, target) {
	if (target !== 'system' && target !== 'user') {
		throw new Error('Invalid setup target');
	}

	return cb => {
		const ia32AppId = target === 'system' ? product.win32AppId : product.win32UserAppId;
		const x64AppId = target === 'system' ? product.win32x64AppId : product.win32x64UserAppId;

		const sourcePath = buildPath(arch);
		const outputPath = setupDir(arch, target);
		mkdirp.sync(outputPath);

		const originalProductJsonPath = path.join(sourcePath, 'resources/app/product.json');
		const productJsonPath = path.join(outputPath, 'product.json');
		const productJson = JSON.parse(fs.readFileSync(originalProductJsonPath, 'utf8'));
		productJson['target'] = target;
		fs.writeFileSync(productJsonPath, JSON.stringify(productJson, undefined, '\t'));

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
			Arch: arch,
			AppId: arch === 'ia32' ? ia32AppId : x64AppId,
			IncompatibleTargetAppId: arch === 'ia32' ? product.win32AppId : product.win32x64AppId,
			IncompatibleArchAppId: arch === 'ia32' ? x64AppId : ia32AppId,
			AppUserId: product.win32AppUserModelId,
			ArchitecturesAllowed: arch === 'ia32' ? '' : 'x64',
			ArchitecturesInstallIn64BitMode: arch === 'ia32' ? '' : 'x64',
			SourceDir: sourcePath,
			RepoDir: repoPath,
			OutputDir: outputPath,
			InstallTarget: target,
			ProductJsonPath: productJsonPath
		};

		packageInnoSetup(issPath, { definitions }, cb);
	};
}

function defineWin32SetupTasks(arch, target) {
	gulp.task(`clean-vscode-win32-${arch}-${target}-setup`, util.rimraf(setupDir(arch, target)));
	gulp.task(`vscode-win32-${arch}-${target}-setup`, [`clean-vscode-win32-${arch}-${target}-setup`], buildWin32Setup(arch, target));
}

defineWin32SetupTasks('ia32', 'system');
defineWin32SetupTasks('x64', 'system');
defineWin32SetupTasks('ia32', 'user');
defineWin32SetupTasks('x64', 'user');

function archiveWin32Setup(arch) {
	return cb => {
		const args = ['a', '-tzip', zipPath(arch), '-x!CodeSignSummary*.md', '.', '-r'];

		cp.spawn(_7z, args, { stdio: 'inherit', cwd: buildPath(arch) })
			.on('error', cb)
			.on('exit', () => cb(null));
	};
}

gulp.task('clean-vscode-win32-ia32-archive', util.rimraf(zipDir('ia32')));
gulp.task('vscode-win32-ia32-archive', ['clean-vscode-win32-ia32-archive'], archiveWin32Setup('ia32'));

gulp.task('clean-vscode-win32-x64-archive', util.rimraf(zipDir('x64')));
gulp.task('vscode-win32-x64-archive', ['clean-vscode-win32-x64-archive'], archiveWin32Setup('x64'));

function copyInnoUpdater(arch) {
	return () => {
		return gulp.src('build/win32/{inno_updater.exe,vcruntime140.dll}', { base: 'build/win32' })
			.pipe(vfs.dest(path.join(buildPath(arch), 'tools')));
	};
}

gulp.task('vscode-win32-ia32-copy-inno-updater', copyInnoUpdater('ia32'));
gulp.task('vscode-win32-x64-copy-inno-updater', copyInnoUpdater('x64'));

/**************** Windows Store Release ****************/
const publisher = "CN=Microsoft, O=Microsoft Corporation, C=US";

// Exes
const windowsKitFolder = process.arch == "x64" ? "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\" : "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x86\\";
const makeappxExe = `"${windowsKitFolder}\\makeappx.exe"`;
const signToolExe = `"${windowsKitFolder}\\SignTool.exe"`;

const win32VSCodePath = arch => path.join(repoPath, '.build', `VSCode-win32-${arch}`);
const winstoreArchPath = arch => path.join(repoPath, '.build', `winstore-${arch}`);
const appxArchPath = arch => path.join(winstoreArchPath(arch), `vscode-${arch}.appx`);

const winstoreResourcePath = path.join(__dirname, 'winstore');
const winstoreBundlePath = path.join(repoPath, '.build', `winstore-bundle`);
const appxCertPath = path.join(winstoreBundlePath, 'dev-certificate.pfx');

// Dev Certificate Info
const winstoreDevCertName = "VSCode-Dev";
const winstoreDevCertPassword = "vscode";

function makeAppX(arch){
	return cb => {
		const srcPath = win32VSCodePath(arch);
		const destPath = winstoreArchPath(arch);
		const prepackagePath = path.join(destPath, 'prepackage');
		const packagePath = appxArchPath(arch);
		const exe = "Code - OSS.exe";

		// Get Copy from electron-win32-{arch}
		fs.copySync(srcPath, prepackagePath);

		// Copy Resources into Destination
		fs.copySync(path.join(winstoreResourcePath, "package"), prepackagePath);

		// Update Manifest with proper values.
		let manifest = path.join(prepackagePath, "AppxManifest.xml");
		fs.readFile(manifest, 'utf8', function (err,data) {
			if (err) {
				return console.log(err);
			}

			let output = data.replace('{{arch}}', arch);
			output = output.replace('{{publisher}}', publisher);
			output = output.replace("{{exe}}", exe);

			fs.writeFile(manifest, output, 'utf8', function (err) {
				if (err) return console.log(err);
			});
		});

		const args = [
			"Pack",
			`/d ${prepackagePath}`,
			`/p ${packagePath}`,
			"/l"
		];

		// Create Appx from Prepackage folder.
		cp.spawn(makeappxExe, args, { stdio: 'inherit', shell: true })
			.on('error', cb)
			.on('exit', () => {
				// Remove PrePackage Folder.
				fs.removeSync(prepackagePath);
				cb(null);
			});
	};
}

gulp.task('uwp-create-cert', [], (cb) => {
	// Make Bundle Folder
	if(!fs.existsSync(winstoreBundlePath)){
		fs.mkdirSync(winstoreBundlePath);
	}

	const args = [
		`-File "${path.join(winstoreResourcePath, "makeDevCert.ps1")}"`,
		`"${publisher}"`,
		`"${winstoreDevCertName}"`,
		`"${appxCertPath}"`,
		`"${winstoreDevCertPassword}"`
	];

	// Create a Dev Certificate for the Appx.
	cp.spawn("powershell.exe", args, { stdio: 'inherit', shell: true })
	.on('error', cb)
	.on('exit', () => {
		cb(null);
	});
});

function signWinstoreAppx(arch){
	return cb => {

		const args = [
			"sign",
			"/fd SHA256",
			"/a",
			`/f "${appxCertPath}"`,
			`/p ${winstoreDevCertPassword}`,
			`"${appxArchPath(arch)}"`
		];

		// Sign Appx with Certificate
		cp.spawn(signToolExe, args, { stdio: 'inherit', shell: true })
			.on('error', cb)
			.on('exit', () => {
				cb(null);
			});
	};
}


function defineWinStoreTasks(arch){
	let archClean = `clean-vscode-winstore-${arch}`;
	gulp.task(archClean, util.rimraf(winstoreArchPath(arch)));

	if(arch != "bundle"){
		gulp.task(`vscode-winstore-${arch}`, [archClean, `vscode-win32-${arch}-internal-min`], makeAppX(arch));
	}
	else{
		gulp.task('vscode-winstore-bundle', [archClean, 'vscode-winstore-ia32', 'vscode-winstore-x64']);
	}

	gulp.task(`vscode-winstore-${arch}-devsign`, [`vscode-winstore-${arch}`, 'uwp-create-cert'], signWinstoreAppx(arch));
}

defineWinStoreTasks("ia32");
defineWinStoreTasks("x64");
defineWinStoreTasks("bundle");