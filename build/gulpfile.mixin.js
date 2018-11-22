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
const util = require('./lib/util');
const remote = require('gulp-remote-src');
const zip = require('gulp-vinyl-zip');

const pkg = require('../package.json');

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

	const url = `https://github.com/${repo}/archive/${pkg.distro}.zip`;
	const opts = { base: url };
	const username = process.env['VSCODE_MIXIN_USERNAME'];
	const password = process.env['VSCODE_MIXIN_PASSWORD'];

	if (username || password) {
		opts.auth = { user: username || '', pass: password || '' };
	}

	console.log('Mixing in sources from \'' + url + '\':');

	let all = remote('', opts)
		.pipe(zip.src())
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(util.rebase(1));

	if (quality) {
		const productJsonFilter = filter('product.json', { restore: true });
		const mixin = all
			.pipe(filter(['quality/' + quality + '/**']))
			.pipe(util.rebase(2))
			.pipe(productJsonFilter)
			.pipe(buffer())
			.pipe(json(o => Object.assign({}, require('../product.json'), o)))
			.pipe(productJsonFilter.restore);

		all = es.merge(mixin);
	}

	return all
		.pipe(es.mapSync(function (f) {
			console.log(f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});