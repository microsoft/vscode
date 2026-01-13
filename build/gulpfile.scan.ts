/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import gulp from 'gulp';
import * as path from 'path';
import * as task from './lib/task.ts';
import * as util from './lib/util.ts';
import electron from '@vscode/gulp-electron';
import { config } from './lib/electron.ts';
import filter from 'gulp-filter';
import * as deps from './lib/dependencies.ts';
import { existsSync, readdirSync } from 'fs';

const root = path.dirname(import.meta.dirname);

const BUILD_TARGETS = [
	{ platform: 'win32', arch: 'x64' },
	{ platform: 'win32', arch: 'arm64' },
	{ platform: 'darwin', arch: null, opts: { stats: true } },
	{ platform: 'linux', arch: 'x64' },
	{ platform: 'linux', arch: 'armhf' },
	{ platform: 'linux', arch: 'arm64' },
];

// The following files do not have PDBs downloaded for them during the download symbols process.
const excludedCheckList = [
	'd3dcompiler_47.dll',
	'dxil.dll',
	'dxcompiler.dll',
];

BUILD_TARGETS.forEach(buildTarget => {
	const dashed = (str: string | null) => (str ? `-${str}` : ``);
	const platform = buildTarget.platform;
	const arch = buildTarget.arch;

	const destinationExe = path.join(path.dirname(root), 'scanbin', `VSCode${dashed(platform)}${dashed(arch)}`, 'bin');
	const destinationPdb = path.join(path.dirname(root), 'scanbin', `VSCode${dashed(platform)}${dashed(arch)}`, 'pdb');

	const tasks: task.Task[] = [];

	// removal tasks
	tasks.push(util.rimraf(destinationExe), util.rimraf(destinationPdb));

	// electron
	tasks.push(() => electron.dest(destinationExe, { ...config, platform, arch: arch === 'armhf' ? 'arm' : arch }));

	// pdbs for windows
	if (platform === 'win32') {
		tasks.push(
			() => electron.dest(destinationPdb, { ...config, platform, arch: arch === 'armhf' ? 'arm' : arch, pdbs: true }),
			() => confirmPdbsExist(destinationExe, destinationPdb)
		);
	}

	if (platform === 'linux') {
		tasks.push(
			() => electron.dest(destinationPdb, { ...config, platform, arch: arch === 'armhf' ? 'arm' : arch, symbols: true })
		);
	}

	// node modules
	tasks.push(
		nodeModules(destinationExe, destinationPdb, platform)
	);

	const setupSymbolsTask = task.define(`vscode-symbols${dashed(platform)}${dashed(arch)}`,
		task.series(...tasks)
	);

	gulp.task(setupSymbolsTask);
});

function getProductionDependencySources() {
	const productionDependencies = deps.getProductionDependencies(root);
	return productionDependencies.map(d => path.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat();
}

function nodeModules(destinationExe: string, destinationPdb: string, platform: string): task.CallbackTask {

	const exe = () => {
		return gulp.src(getProductionDependencySources(), { base: '.', dot: true })
			.pipe(filter([
				'**/*.node',
				// Exclude these paths.
				// We don't build the prebuilt node files so we don't scan them
				'!**/prebuilds/**/*.node'
			]))
			.pipe(gulp.dest(destinationExe));
	};

	if (platform === 'win32') {
		const pdb = () => {
			return gulp.src(getProductionDependencySources(), { base: '.', dot: true })
				.pipe(filter(['**/*.pdb']))
				.pipe(gulp.dest(destinationPdb));
		};

		return gulp.parallel(exe, pdb) as task.CallbackTask;
	}

	if (platform === 'linux') {
		const pdb = () => {
			return gulp.src(getProductionDependencySources(), { base: '.', dot: true })
				.pipe(filter(['**/*.sym']))
				.pipe(gulp.dest(destinationPdb));
		};

		return gulp.parallel(exe, pdb) as task.CallbackTask;
	}

	return exe;
}

function confirmPdbsExist(destinationExe: string, destinationPdb: string) {
	readdirSync(destinationExe).forEach(file => {
		if (excludedCheckList.includes(file)) {
			return;
		}

		if (file.endsWith('.dll') || file.endsWith('.exe')) {
			const pdb = `${file}.pdb`;
			if (!existsSync(path.join(destinationPdb, pdb))) {
				throw new Error(`Missing pdb file for ${file}. Tried searching for ${pdb} in ${destinationPdb}.`);
			}
		}
	});
	return Promise.resolve();
}
