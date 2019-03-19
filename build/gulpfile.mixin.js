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

	cp.execSync(`git remote add distro ${url}`);
	cp.execSync(`git fetch distro`);
	cp.execSync(`git merge ${pkg.distro}`);

	console.log('Mixing in sources from \'' + url + '\':');

	const productJsonFilter = filter('product.json', { restore: true });

	return vfs
		.src(`quality/${quality}/**`, { base: `quality/${quality}` })
		.pipe(productJsonFilter)
		.pipe(buffer())
		.pipe(json(o => Object.assign({}, require('../product.json'), o)))
		.pipe(productJsonFilter.restore)
		.pipe(es.mapSync(function (f) {
			console.log('mixin', f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});