/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const task = require('./lib/task');
const util = require('./lib/util');
const _ = require('underscore');
const electron = require('gulp-atom-electron');
const { config } = require('./lib/electron');
const filter = require('gulp-filter');
const deps = require('./lib/dependencies');

const root = path.dirname(__dirname);

const BUILD_TARGETS = [
	{ platform: 'win32', arch: 'ia32' },
	{ platform: 'win32', arch: 'x64' },
	{ platform: 'win32', arch: 'arm64' },
	{ platform: 'darwin', arch: null, opts: { stats: true } },
	{ platform: 'linux', arch: 'ia32' },
	{ platform: 'linux', arch: 'x64' },
	{ platform: 'linux', arch: 'armhf' },
	{ platform: 'linux', arch: 'arm64' },
];

BUILD_TARGETS.forEach(buildTarget => {
	const dashed = (/** @type {string | null} */ str) => (str ? `-${str}` : ``);
	const platform = buildTarget.platform;
	const arch = buildTarget.arch;

	const destinationExe = path.join(path.dirname(root), 'scanbin', `VSCode${dashed(platform)}${dashed(arch)}`, 'bin');
	const destinationPdb = path.join(path.dirname(root), 'scanbin', `VSCode${dashed(platform)}${dashed(arch)}`, 'pdb');

	const tasks = [];

	// removal tasks
	tasks.push(util.rimraf(destinationExe), util.rimraf(destinationPdb));

	// electron
	tasks.push(() => electron.dest(destinationExe, _.extend({}, config, { platform, arch: arch === 'armhf' ? 'arm' : arch })));

	// pdbs for windows
	if (platform === 'win32') {
		tasks.push(
			() => electron.dest(destinationPdb, _.extend({}, config, { platform, arch: arch === 'armhf' ? 'arm' : arch, pdbs: true })),
			util.rimraf(path.join(destinationExe, 'swiftshader')),
			util.rimraf(path.join(destinationExe, 'd3dcompiler_47.dll')));
	}

	if (platform === 'linux') {
		tasks.push(
			() => electron.dest(destinationPdb, _.extend({}, config, { platform, arch: arch === 'armhf' ? 'arm' : arch, symbols: true }))
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

function nodeModules(destinationExe, destinationPdb, platform) {
	const productionDependencies = deps.getProductionDependencies(root);
	const dependenciesSrc = _.flatten(productionDependencies.map(d => path.relative(root, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]));

	const exe = () => {
		return gulp.src(dependenciesSrc, { base: '.', dot: true })
			.pipe(filter(['**/*.node', '!**/prebuilds/**/*.node']))
			.pipe(gulp.dest(destinationExe));
	};

	if (platform === 'win32') {
		const pdb = () => {
			return gulp.src(dependenciesSrc, { base: '.', dot: true })
				.pipe(filter(['**/*.pdb']))
				.pipe(gulp.dest(destinationPdb));
		};

		return gulp.parallel(exe, pdb);
	}

	if (platform === 'linux') {
		const pdb = () => {
			return gulp.src(dependenciesSrc, { base: '.', dot: true })
				.pipe(filter(['**/*.sym']))
				.pipe(gulp.dest(destinationPdb));
		};

		return gulp.parallel(exe, pdb);
	}

	return exe;
}
