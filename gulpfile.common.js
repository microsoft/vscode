/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var filter = require('gulp-filter');
var minifyCSS = require('gulp-minify-css');
var uglify = require('gulp-uglify');
var es = require('event-stream');
var concat = require('gulp-concat');
var File = require('vinyl');
var underscore = require('underscore');
var bundle = require('./build/lib/bundle');
var util = require('./build/lib/util');

var tsOptions = {
	target: 'ES5',
	module: 'amd',
	verbose: true,
	preserveConstEnums: true,
	experimentalDecorators: true,
	sourceMap: true,
	rootDir: path.join(__dirname, 'src')
};

exports.loaderConfig = function (emptyPaths) {
	var result = {
		paths: {
			'vs': 'out-build/vs',
			'vs/extensions': 'extensions',
			'vscode': 'empty:',
			'lib': 'out-build/lib'
		},
		'vs/text': {
			paths: {
				'vs/extensions': 'extensions'
			}
		}
	};

	(emptyPaths || []).forEach(function(m) { result.paths[m] = 'empty:'; });
	return result;
};

var IS_OUR_COPYRIGHT_REGEXP = /Copyright \(C\) Microsoft Corporation/;

function loader() {
	return gulp.src([
		'out-build/vs/loader.js',
		'out-build/vs/css.js',
		'out-build/vs/nls.js',
		'out-build/vs/text.js'
	], { base: 'out-build' })
		.pipe(util.loadSourcemaps())
		.pipe(concat('vs/loader.js'))
		.pipe(es.mapSync(function (f) {
			f.sourceMap.sourceRoot = util.toFileUri(tsOptions.rootDir);
			return f;
		}));
}

function toBundleStream(bundles) {
	return es.merge(bundles.map(function(bundle) {
		var useSourcemaps = /\.js$/.test(bundle.dest) && !/\.nls\.js$/.test(bundle.dest);
		var sources = bundle.sources.map(function(source) {
			var root = source.path ? __dirname.replace(/\\/g, '/') : '';
			var base = source.path ? root + '/out-build' : '';

			return new File({
				path: source.path ? root + '/' + source.path.replace(/\\/g, '/') : 'fake',
				base: base,
				contents: new Buffer(source.contents)
			});
		});

		return es.readArray(sources)
			.pipe(useSourcemaps ? util.loadSourcemaps() : es.through())
			.pipe(concat(bundle.dest));
	}));
}

exports.optimizeTask = function(entryPoints, resources, loaderConfig, out) {
	return function() {
		var bundles = es.through();

		bundle.bundle(entryPoints, loaderConfig, function(err, result) {
			if (err) { return bundles.emit('error', JSON.stringify(err)); }

			// If a bundle ends up including in any of the sources our copyright, then
			// insert a fake source at the beginning of each bundle with our copyright
			result.forEach(function(b) {
				var containsOurCopyright = false;
				for (var i = 0, len = b.sources.length; i < len; i++) {
					var fileContents = b.sources[i].contents;
					if (IS_OUR_COPYRIGHT_REGEXP.test(fileContents)) {
						containsOurCopyright = true;
						break;
					}
				}

				if (containsOurCopyright) {
					b.sources.unshift({
						path: null,
						contents: [
							'/*!--------------------------------------------------------',
							' * Copyright (C) Microsoft Corporation. All rights reserved.',
							' *--------------------------------------------------------*/'
						].join('\r\n')
					});
				}
			});

			var bundleInformation = result.map(function (b) {
				return {
					dest: b.dest,
					sources: b.sources.filter(function (s) {
						return !!s.path;
					}).map(function (s) {
						return path.relative('out-build', s.path);
					})
				}
			});

			var info = es.readArray([new File({
				path: 'bundles.json',
				contents: new Buffer(JSON.stringify(bundleInformation), 'utf8')
			})]);

			es.merge(toBundleStream(result), info).pipe(bundles);
		});

		var result = es.merge(
			loader(),
			bundles,
			gulp.src(resources, { base: 'out-build' })
		);

		return result
			.pipe(sourcemaps.write('./', {
				sourceRoot: null,
				addComment: false,
				includeContent: true
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

exports.minifyTask = function (src) {
	return function() {
		var jsFilter = filter('**/*.js', { restore: true });
		var cssFilter = filter('**/*.css', { restore: true });

		return gulp.src([src + '/**', '!' + src + '/**/*.map'])
			.pipe(jsFilter)
			.pipe(sourcemaps.init({ loadMaps: true }))
			.pipe(uglifyWithCopyrights())
			.pipe(jsFilter.restore)
			.pipe(cssFilter)
			.pipe(minifyCSS())
			.pipe(cssFilter.restore)
			.pipe(sourcemaps.write('./', {
				sourceRoot: null,
				includeContent: true,
				addComment: false
			}))
			.pipe(gulp.dest(src + '-min'));
	};
};