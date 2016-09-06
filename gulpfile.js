/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const json = require('gulp-json-editor');
const buffer = require('gulp-buffer');
const tsb = require('gulp-tsb');
const filter = require('gulp-filter');
const mocha = require('gulp-mocha');
const es = require('event-stream');
const watch = require('./build/lib/watch');
const nls = require('./build/lib/nls');
const util = require('./build/lib/util');
const reporter = require('./build/lib/reporter')();
const remote = require('gulp-remote-src');
const zip = require('gulp-vinyl-zip');
const path = require('path');
const bom = require('gulp-bom');
const sourcemaps = require('gulp-sourcemaps');
const _ = require('underscore');
const assign = require('object-assign');
const monacodts = require('./build/monaco/api');
const fs = require('fs');
const glob = require('glob');
const pkg = require('./package.json');

const rootDir = path.join(__dirname, 'src');
const options = require('./src/tsconfig.json').compilerOptions;
options.verbose = false;
options.sourceMap = true;
options.rootDir = rootDir;
options.sourceRoot = util.toFileUri(rootDir);

function createCompile(build, emitError) {
	const opts = _.clone(options);
	opts.inlineSources = !!build;
	opts.noFilesystemLookup = true;

	const ts = tsb.create(opts, null, null, err => reporter(err.toString()));

	return function (token) {
		const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
		const tsFilter = util.filter(data => /\.ts$/.test(data.path));
		const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));

		const input = es.through();
		const output = input
			.pipe(utf8Filter)
			.pipe(bom())
			.pipe(utf8Filter.restore)
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(ts(token))
			.pipe(noDeclarationsFilter)
			.pipe(build ? nls() : es.through())
			.pipe(noDeclarationsFilter.restore)
			.pipe(sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: options.sourceRoot
			}))
			.pipe(tsFilter.restore)
			.pipe(reporter.end(emitError));

		return es.duplex(input, output);
	};
}

function compileTask(out, build) {
	const compile = createCompile(build, true);

	return function () {
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts')
		);

		return src
			.pipe(compile())
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, false));
	};
}

function watchTask(out, build) {
	const compile = createCompile(build);

	return function () {
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts')
		);
		const watchSrc = watch('src/**', { base: 'src' });

		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, true));
	};
}

function monacodtsTask(out, isWatch) {
	let timer = -1;

	const runSoon = function(howSoon) {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		timer = setTimeout(function() {
			timer = -1;
			runNow();
		}, howSoon);
	};

	const runNow = function() {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		// if (reporter.hasErrors()) {
		// 	monacodts.complainErrors();
		// 	return;
		// }
		const result = monacodts.run(out);
		if (!result.isTheSame) {
			if (isWatch) {
				fs.writeFileSync(result.filePath, result.content);
			} else {
				resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
			}
		}
	};

	let resultStream;

	if (isWatch) {

		const filesToWatchMap = {};
		monacodts.getFilesToWatch(out).forEach(function(filePath) {
			filesToWatchMap[path.normalize(filePath)] = true;
		});

		watch('build/monaco/*').pipe(es.through(function() {
			runSoon(5000);
		}));

		resultStream = es.through(function(data) {
			const filePath = path.normalize(data.path);
			if (filesToWatchMap[filePath]) {
				runSoon(5000);
			}
			this.emit('data', data);
		});

	} else {

		resultStream = es.through(null, function() {
			runNow();
			this.emit('end');
		});

	}

	return resultStream;
}

// Fast compile for development time
gulp.task('clean-client', util.rimraf('out'));
gulp.task('compile-client', ['clean-client'], compileTask('out', false));
gulp.task('watch-client', ['clean-client'], watchTask('out', false));

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('clean-client-build', util.rimraf('out-build'));
gulp.task('compile-client-build', ['clean-client-build'], compileTask('out-build', true));
gulp.task('watch-client-build', ['clean-client-build'], watchTask('out-build', true));

// Default
gulp.task('default', ['compile']);

// All
gulp.task('clean', ['clean-client', 'clean-extensions']);
gulp.task('compile', ['compile-client', 'compile-extensions']);
gulp.task('watch', ['watch-client', 'watch-extensions']);

// All Build
gulp.task('clean-build', ['clean-client-build', 'clean-extensions-build']);
gulp.task('compile-build', ['compile-client-build', 'compile-extensions-build']);
gulp.task('watch-build', ['watch-client-build', 'watch-extensions-build']);

gulp.task('test', function () {
	return gulp.src('test/all.js')
		.pipe(mocha({ ui: 'tdd', delay: true }))
		.once('end', function () { process.exit(); });
});

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

	const url = `https://github.com/${ repo }/archive/${ pkg.distro }.zip`;
	const opts = { base: '' };
	const username = process.env['VSCODE_MIXIN_USERNAME'];
	const password = process.env['VSCODE_MIXIN_PASSWORD'];

	if (username || password) {
		opts.auth = { user: username || '', pass: password || '' };
	}

	console.log('Mixing in sources from \'' + url + '\':');

	let all = remote(url, opts)
		.pipe(zip.src())
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(util.rebase(1));

	if (quality) {
		const build = all.pipe(filter('build/**'));
		const productJsonFilter = filter('product.json', { restore: true });

		const mixin = all
			.pipe(filter('quality/' + quality + '/**'))
			.pipe(util.rebase(2))
			.pipe(productJsonFilter)
			.pipe(buffer())
			.pipe(json(function (patch) {
				const original = require('./product.json');
				return assign(original, patch);
			}))
			.pipe(productJsonFilter.restore);

		all = es.merge(build, mixin);
	}

	return all
		.pipe(es.mapSync(function (f) {
			console.log(f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});

const build = path.join(__dirname, 'build');
glob.sync('gulpfile.*.js', { cwd: build })
	.forEach(f => require(`./build/${ f }`));
