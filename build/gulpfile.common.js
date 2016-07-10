/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var filter = require('gulp-filter');
var minifyCSS = require('gulp-cssnano');
var uglify = require('gulp-uglify');
var es = require('event-stream');
var concat = require('gulp-concat');
var File = require('vinyl');
var bundle = require('./lib/bundle');
var util = require('./lib/util');
var i18n = require('./lib/i18n');
var gulpUtil = require('gulp-util');

var quiet = !!process.env['VSCODE_BUILD_QUIET'];

function log(prefix, message) {
	gulpUtil.log(gulpUtil.colors.cyan('[' + prefix + ']'), message);
}

var root = path.dirname(__dirname);
var commit = util.getVersion(root);

var tsOptions = {
	target: 'ES5',
	module: 'amd',
	verbose: !quiet,
	preserveConstEnums: true,
	experimentalDecorators: true,
	sourceMap: true,
	rootDir: path.join(path.dirname(__dirname), 'src')
};

exports.loaderConfig = function (emptyPaths) {
	var result = {
		paths: {
			'vs': 'out-build/vs',
			'vscode': 'empty:'
		},
		nodeModules: emptyPaths||[],
	};

	result['vs/css'] = { inlineResources: true };

	return result;
};

var IS_OUR_COPYRIGHT_REGEXP = /Copyright \(C\) Microsoft Corporation/i;

function loader(bundledFileHeader) {
	var isFirst = true;
	return gulp.src([
		'out-build/vs/loader.js',
		'out-build/vs/css.js',
		'out-build/vs/nls.js',
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
			f.sourceMap.sourceRoot = util.toFileUri(tsOptions.rootDir);
			return f;
		}));
}

function toConcatStream(bundledFileHeader, sources, dest) {
	var useSourcemaps = /\.js$/.test(dest) && !/\.nls\.js$/.test(dest);

	// If a bundle ends up including in any of the sources our copyright, then
	// insert a fake source at the beginning of each bundle with our copyright
	var containsOurCopyright = false;
	for (var i = 0, len = sources.length; i < len; i++) {
		var fileContents = sources[i].contents;
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

	var treatedSources = sources.map(function(source) {
		var root = source.path ? path.dirname(__dirname).replace(/\\/g, '/') : '';
		var base = source.path ? root + '/out-build' : '';

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
	var entryPoints = opts.entryPoints;
	var otherSources = opts.otherSources;
	var resources = opts.resources;
	var loaderConfig = opts.loaderConfig;
	var bundledFileHeader = opts.header;
	var out = opts.out;

	return function() {
		var bundlesStream = es.through(); // this stream will contain the bundled files
		var resourcesStream = es.through(); // this stream will contain the resources
		var bundleInfoStream = es.through(); // this stream will contain bundleInfo.json

		bundle.bundle(entryPoints, loaderConfig, function(err, result) {
			if (err) { return bundlesStream.emit('error', JSON.stringify(err)); }

			toBundleStream(bundledFileHeader, result.files).pipe(bundlesStream);

			// Remove css inlined resources
			var filteredResources = [];
			filteredResources = filteredResources.concat(resources);
			result.cssInlinedResources.forEach(function(resource) {
				log('optimizer', 'excluding inlined: ' + resource);
				filteredResources.push('!' + resource);
			});
			gulp.src(filteredResources, { base: 'out-build' }).pipe(resourcesStream);

			var bundleInfoArray = [];
			if (opts.bundleInfo) {
				bundleInfoArray.push(new File({
					path: 'bundleInfo.json',
					base: '.',
					contents: new Buffer(JSON.stringify(result.bundleData, null, '\t'))
				}));
			}
			es.readArray(bundleInfoArray).pipe(bundleInfoStream);
		});

		var otherSourcesStream = es.through();
		var otherSourcesStreamArr = [];

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

		var result = es.merge(
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
 * wrap around uglify and allow the preserveComments function
 * to have a file "context" to include our copyright only once per file
 */
function uglifyWithCopyrights() {
	var currentFileHasOurCopyright = false;

	var onNewFile = function() {
		currentFileHasOurCopyright = false;
	};

	var preserveComments = function(node, comment) {
		var text = comment.value;
		var type = comment.type;

		if (/@minifier_do_not_preserve/.test(text)) {
			return false;
		}

		var isOurCopyright = IS_OUR_COPYRIGHT_REGEXP.test(text);

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

	var uglifyStream = uglify({ preserveComments: preserveComments });

	return es.through(function write(data) {
		var _this = this;

		onNewFile();

		uglifyStream.once('data', function(data) {
			_this.emit('data', data);
		})
		uglifyStream.write(data);
	}, function end() {
		this.emit('end')
	});
}

exports.minifyTask = function (src, addSourceMapsComment) {
	return function() {
		var jsFilter = filter('**/*.js', { restore: true });
		var cssFilter = filter('**/*.css', { restore: true });

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