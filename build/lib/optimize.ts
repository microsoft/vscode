/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const filter = require('gulp-filter');
const minifyCSS = require('gulp-cssnano');
const uglify = require('gulp-uglify');
const es = require('event-stream');
const concat = require('gulp-concat');
const VinylFile = require('vinyl');
const bundle = require('./bundle');
const util = require('./util');
const i18n = require('./i18n');
const gulpUtil = require('gulp-util');
const flatmap = require('gulp-flatmap');
const pump = require('pump');

const REPO_ROOT_PATH = path.join(__dirname, '../..');

function log(prefix, message) {
	gulpUtil.log(gulpUtil.colors.cyan('[' + prefix + ']'), message);
}

exports.loaderConfig = function (emptyPaths) {
	const result = {
		paths: {
			'vs': 'out-build/vs',
			'vscode': 'empty:'
		},
		nodeModules: emptyPaths||[]
	};

	result['vs/css'] = { inlineResources: true };

	return result;
};

const IS_OUR_COPYRIGHT_REGEXP = /Copyright \(C\) Microsoft Corporation/i;

function loader(bundledFileHeader, bundleLoader) {
	let sources = [
		'out-build/vs/loader.js'
	];
	if (bundleLoader) {
		sources = sources.concat([
			'out-build/vs/css.js',
			'out-build/vs/nls.js'
		]);
	}

	let isFirst = true;
	return (
		gulp
		.src(sources, { base: 'out-build' })
		.pipe(es.through(function(data) {
			if (isFirst) {
				isFirst = false;
				this.emit('data', new VinylFile({
					path: 'fake',
					base: '',
					contents: new Buffer(bundledFileHeader)
				}));
				this.emit('data', data);
			} else {
				this.emit('data', data);
			}
		}))
		.pipe(util.loadSourcemaps())
		.pipe(concat('vs/loader.js'))
		.pipe(es.mapSync(function (f) {
			f.sourceMap.sourceRoot = util.toFileUri(path.join(REPO_ROOT_PATH, 'src'));
			return f;
		}))
	);
}

function toConcatStream(bundledFileHeader, sources, dest) {
	const useSourcemaps = /\.js$/.test(dest) && !/\.nls\.js$/.test(dest);

	// If a bundle ends up including in any of the sources our copyright, then
	// insert a fake source at the beginning of each bundle with our copyright
	let containsOurCopyright = false;
	for (let i = 0, len = sources.length; i < len; i++) {
		const fileContents = sources[i].contents;
		if (IS_OUR_COPYRIGHT_REGEXP.test(fileContents)) {
			containsOurCopyright = true;
			break;
		}
	}

	if (containsOurCopyright) {
		sources.unshift({
			path: null,
			contents: bundledFileHeader
		});
	}

	const treatedSources = sources.map(function(source) {
		const root = source.path ? REPO_ROOT_PATH.replace(/\\/g, '/') : '';
		const base = source.path ? root + '/out-build' : '';

		return new VinylFile({
			path: source.path ? root + '/' + source.path.replace(/\\/g, '/') : 'fake',
			base: base,
			contents: new Buffer(source.contents)
		});
	});

	return es.readArray(treatedSources)
		.pipe(useSourcemaps ? util.loadSourcemaps() : es.through())
		.pipe(concat(dest));
}

function toBundleStream(bundledFileHeader, bundles) {
	return es.merge(bundles.map(function(bundle) {
		return toConcatStream(bundledFileHeader, bundle.sources, bundle.dest);
	}));
}

/**
 * opts:
 * - entryPoints (for AMD files, will get bundled and get Copyright treatment)
 * - otherSources (for non-AMD files that should get Copyright treatment)
 * - resources (svg, etc.)
 * - loaderConfig
 * - bundleLoader (boolean - true by default - append css and nls to loader)
 * - header (basically the Copyright treatment)
 * - bundleInfo (boolean - emit bundleInfo.json file)
 * - out (out folder name)
 */
exports.optimizeTask = function(opts) {
	const entryPoints = opts.entryPoints;
	const otherSources = opts.otherSources;
	const resources = opts.resources;
	const loaderConfig = opts.loaderConfig;
	const bundledFileHeader = opts.header;
	const bundleLoader = (typeof opts.bundleLoader === 'undefined' ? true : opts.bundleLoader);
	const out = opts.out;

	return function() {
		const bundlesStream = es.through(); // this stream will contain the bundled files
		const resourcesStream = es.through(); // this stream will contain the resources
		const bundleInfoStream = es.through(); // this stream will contain bundleInfo.json

		bundle.bundle(entryPoints, loaderConfig, function(err, result) {
			if (err) { return bundlesStream.emit('error', JSON.stringify(err)); }

			toBundleStream(bundledFileHeader, result.files).pipe(bundlesStream);

			// Remove css inlined resources
			const filteredResources = resources.slice();
			result.cssInlinedResources.forEach(function(resource) {
				if (process.env['VSCODE_BUILD_VERBOSE']) {
					log('optimizer', 'excluding inlined: ' + resource);
				}
				filteredResources.push('!' + resource);
			});
			gulp.src(filteredResources, { base: 'out-build' }).pipe(resourcesStream);

			const bundleInfoArray = [];
			if (opts.bundleInfo) {
				bundleInfoArray.push(new VinylFile({
					path: 'bundleInfo.json',
					base: '.',
					contents: new Buffer(JSON.stringify(result.bundleData, null, '\t'))
				}));
			}
			es.readArray(bundleInfoArray).pipe(bundleInfoStream);
		});

		const otherSourcesStream = es.through();
		const otherSourcesStreamArr = [];

		gulp.src(otherSources, { base: 'out-build' })
			.pipe(es.through(function (data) {
				otherSourcesStreamArr.push(toConcatStream(bundledFileHeader, [data], data.relative));
			}, function () {
				if (!otherSourcesStreamArr.length) {
					setTimeout(function () { otherSourcesStream.emit('end'); }, 0);
				} else {
					es.merge(otherSourcesStreamArr).pipe(otherSourcesStream);
				}
			}));

		const result = es.merge(
			loader(bundledFileHeader, bundleLoader),
			bundlesStream,
			otherSourcesStream,
			resourcesStream,
			bundleInfoStream
		);

		return result
			.pipe(sourcemaps.write('./', {
				sourceRoot: null,
				addComment: true,
				includeContent: true
			}))
			.pipe(i18n.processNlsFiles({
				fileHeader: bundledFileHeader
			}))
			.pipe(gulp.dest(out));
	};
};

/**
 * Wrap around uglify and allow the preserveComments function
 * to have a file "context" to include our copyright only once per file.
 */
function uglifyWithCopyrights() {
	const preserveComments = f => (node, comment) => {
		const text = comment.value;
		const type = comment.type;

		if (/@minifier_do_not_preserve/.test(text)) {
			return false;
		}

		const isOurCopyright = IS_OUR_COPYRIGHT_REGEXP.test(text);

		if (isOurCopyright) {
			if (f.__hasOurCopyright) {
				return false;
			}
			f.__hasOurCopyright = true;
			return true;
		}

		if ('comment2' === type) {
			// check for /*!. Note that text doesn't contain leading /*
			return (text.length > 0 && text[0] === '!') || /@preserve|license|@cc_on|copyright/i.test(text);
		} else if ('comment1' === type) {
			return /license|copyright/i.test(text);
		}
		return false;
	};

	const input = es.through();
	const output = input
		.pipe(flatmap((stream, f) => {
			return stream
				.pipe(uglify({ preserveComments: preserveComments(f) }));
		}));

	return es.duplex(input, output);
}

exports.minifyTask = function (src, sourceMapBaseUrl) {
	const sourceMappingURL = sourceMapBaseUrl && (f => `${ sourceMapBaseUrl }/${ f.relative }.map`);

	return cb => {
		const jsFilter = filter('**/*.js', { restore: true });
		const cssFilter = filter('**/*.css', { restore: true });

		pump(
			gulp.src([src + '/**', '!' + src + '/**/*.map']),
			jsFilter,
			sourcemaps.init({ loadMaps: true }),
			uglifyWithCopyrights(),
			jsFilter.restore,
			cssFilter,
			minifyCSS({ reduceIdents: false }),
			cssFilter.restore,
			sourcemaps.write('./', {
				sourceMappingURL,
				sourceRoot: null,
				includeContent: true,
				addComment: true
			}),
			gulp.dest(src + '-min')
		, err => {
			if (err instanceof uglify.GulpUglifyError) {
				console.error(`Uglify error in '${ err.cause && err.cause.filename }'`);
			}

			cb(err);
		});
	};
};
