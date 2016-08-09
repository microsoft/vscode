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
const File = require('vinyl');
const bundle = require('./lib/bundle');
const util = require('./lib/util');
const i18n = require('./lib/i18n');
const gulpUtil = require('gulp-util');

function log(prefix, message) {
	gulpUtil.log(gulpUtil.colors.cyan('[' + prefix + ']'), message);
}

const root = path.dirname(__dirname);
const commit = util.getVersion(root);

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

function loader(bundledFileHeader) {
	let isFirst = true;
	return gulp.src([
		'out-build/vs/loader.js',
		'out-build/vs/css.js',
		'out-build/vs/nls.js'
	], { base: 'out-build' })
		.pipe(es.through(function(data) {
			if (isFirst) {
				isFirst = false;
				this.emit('data', new File({
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
			f.sourceMap.sourceRoot = util.toFileUri(path.join(path.dirname(__dirname), 'src'));
			return f;
		}));
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
		const root = source.path ? path.dirname(__dirname).replace(/\\/g, '/') : '';
		const base = source.path ? root + '/out-build' : '';

		return new File({
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
				bundleInfoArray.push(new File({
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
			loader(bundledFileHeader),
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
	let currentFileHasOurCopyright = false;

	const onNewFile = () => currentFileHasOurCopyright = false;

	const preserveComments = function(node, comment) {
		const text = comment.value;
		const type = comment.type;

		if (/@minifier_do_not_preserve/.test(text)) {
			return false;
		}

		const isOurCopyright = IS_OUR_COPYRIGHT_REGEXP.test(text);

		if (isOurCopyright) {
			if (currentFileHasOurCopyright) {
				return false;
			}
			currentFileHasOurCopyright = true;
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

	const uglifyStream = uglify({ preserveComments });

	return es.through(function (data) {
		const _this = this;

		onNewFile();

		uglifyStream.once('data', function(data) {
			_this.emit('data', data);
		})
		uglifyStream.write(data);
	},
	function () { this.emit('end'); });
}

exports.minifyTask = function (src, addSourceMapsComment) {
	return function() {
		const jsFilter = filter('**/*.js', { restore: true });
		const cssFilter = filter('**/*.css', { restore: true });

		return gulp.src([src + '/**', '!' + src + '/**/*.map'])
			.pipe(jsFilter)
			.pipe(sourcemaps.init({ loadMaps: true }))
			.pipe(uglifyWithCopyrights())
			.pipe(jsFilter.restore)
			.pipe(cssFilter)
			.pipe(minifyCSS({ reduceIdents: false }))
			.pipe(cssFilter.restore)
			.pipe(sourcemaps.write('./', {
				sourceMappingURL: function (file) {
					return 'https://ticino.blob.core.windows.net/sourcemaps/' + commit + '/' + file.relative + '.map';
				},
				sourceRoot: null,
				includeContent: true,
				addComment: addSourceMapsComment
			}))
			.pipe(gulp.dest(src + '-min'));
	};
};