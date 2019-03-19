/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const json = require('gulp-json-editor');
const buffer = require('gulp-buffer');
const filter = require('gulp-filter');
const es = require('event-stream');
const vfs = require('vinyl-fs');
const pkg = require('../package.json');
const cp = require('child_process');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');

gulp.task('mixin', function () {
	const repo = process.env['VSCODE_MIXIN_REPO'];

	if (!repo) {
		console.log('Missing VSCODE_MIXIN_REPO, skipping mixin');
		return;
	}

	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		console.log('Missing VSCODE_QUALITY, skipping mixin');
		return;
	}

	const url = `https://github.com/${repo}.git`;

	cp.execSync(`git config user.email "vscode@microsoft.com"`);
	cp.execSync(`git config user.name "VSCode"`);

	fancyLog(ansiColors.blue('[mixin]'), 'Add distro remote');
	cp.execSync(`git remote add distro ${url}`);

	fancyLog(ansiColors.blue('[mixin]'), 'Add fetch distro sources');
	cp.execSync(`git fetch distro`);

	fancyLog(ansiColors.blue('[mixin]'), `Merge ${pkg.distro} from distro`);

	try {
		cp.execSync(`git merge ${pkg.distro}`);
	} catch (err) {
		fancyLog(ansiColors.red('[mixin] ❌'), `Failed to merge ${pkg.distro} from distro. Please proceed with manual merge to fix the build.`);
		throw err;
	}

	const productJsonFilter = filter('product.json', { restore: true });

	fancyLog(ansiColors.blue('[mixin]'), `Mixing in sources:`);
	return vfs
		.src(`quality/${quality}/**`, { base: `quality/${quality}` })
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(productJsonFilter)
		.pipe(buffer())
		.pipe(json(o => Object.assign({}, require('../product.json'), o)))
		.pipe(productJsonFilter.restore)
		.pipe(es.mapSync(function (f) {
			fancyLog(ansiColors.blue('[mixin]'), f.relative, ansiColors.green('✔︎'));
			return f;
		}))
		.pipe(gulp.dest('.'));
});