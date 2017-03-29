/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var path = require("path");
var gulp = require("gulp");
var sourcemaps = require("gulp-sourcemaps");
var filter = require("gulp-filter");
var minifyCSS = require("gulp-cssnano");
var uglify = require("gulp-uglify");
var es = require("event-stream");
var concat = require("gulp-concat");
var VinylFile = require("vinyl");
var bundle = require("./bundle");
var util = require("./util");
var i18n = require("./i18n");
var gulpUtil = require("gulp-util");
var flatmap = require("gulp-flatmap");
var pump = require("pump");
var REPO_ROOT_PATH = path.join(__dirname, '../..');
function log(prefix, message) {
    gulpUtil.log(gulpUtil.colors.cyan('[' + prefix + ']'), message);
}
function loaderConfig(emptyPaths) {
    var result = {
        paths: {
            'vs': 'out-build/vs',
            'vscode': 'empty:'
        },
        nodeModules: emptyPaths || []
    };
    result['vs/css'] = { inlineResources: true };
    return result;
}
exports.loaderConfig = loaderConfig;
var IS_OUR_COPYRIGHT_REGEXP = /Copyright \(C\) Microsoft Corporation/i;
function loader(bundledFileHeader, bundleLoader) {
    var sources = [
        'out-build/vs/loader.js'
    ];
    if (bundleLoader) {
        sources = sources.concat([
            'out-build/vs/css.js',
            'out-build/vs/nls.js'
        ]);
    }
    var isFirst = true;
    return (gulp
        .src(sources, { base: 'out-build' })
        .pipe(es.through(function (data) {
        if (isFirst) {
            isFirst = false;
            this.emit('data', new VinylFile({
                path: 'fake',
                base: '',
                contents: new Buffer(bundledFileHeader)
            }));
            this.emit('data', data);
        }
        else {
            this.emit('data', data);
        }
    }))
        .pipe(util.loadSourcemaps())
        .pipe(concat('vs/loader.js'))
        .pipe(es.mapSync(function (f) {
        f.sourceMap.sourceRoot = util.toFileUri(path.join(REPO_ROOT_PATH, 'src'));
        return f;
    })));
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
    var treatedSources = sources.map(function (source) {
        var root = source.path ? REPO_ROOT_PATH.replace(/\\/g, '/') : '';
        var base = source.path ? root + '/out-build' : '';
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
    return es.merge(bundles.map(function (bundle) {
        return toConcatStream(bundledFileHeader, bundle.sources, bundle.dest);
    }));
}
function optimizeTask(opts) {
    var entryPoints = opts.entryPoints;
    var otherSources = opts.otherSources;
    var resources = opts.resources;
    var loaderConfig = opts.loaderConfig;
    var bundledFileHeader = opts.header;
    var bundleLoader = (typeof opts.bundleLoader === 'undefined' ? true : opts.bundleLoader);
    var out = opts.out;
    return function () {
        var bundlesStream = es.through(); // this stream will contain the bundled files
        var resourcesStream = es.through(); // this stream will contain the resources
        var bundleInfoStream = es.through(); // this stream will contain bundleInfo.json
        bundle.bundle(entryPoints, loaderConfig, function (err, result) {
            if (err) {
                return bundlesStream.emit('error', JSON.stringify(err));
            }
            toBundleStream(bundledFileHeader, result.files).pipe(bundlesStream);
            // Remove css inlined resources
            var filteredResources = resources.slice();
            result.cssInlinedResources.forEach(function (resource) {
                if (process.env['VSCODE_BUILD_VERBOSE']) {
                    log('optimizer', 'excluding inlined: ' + resource);
                }
                filteredResources.push('!' + resource);
            });
            gulp.src(filteredResources, { base: 'out-build' }).pipe(resourcesStream);
            var bundleInfoArray = [];
            if (opts.bundleInfo) {
                bundleInfoArray.push(new VinylFile({
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
            }
            else {
                es.merge(otherSourcesStreamArr).pipe(otherSourcesStream);
            }
        }));
        var result = es.merge(loader(bundledFileHeader, bundleLoader), bundlesStream, otherSourcesStream, resourcesStream, bundleInfoStream);
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
}
exports.optimizeTask = optimizeTask;
;
/**
 * Wrap around uglify and allow the preserveComments function
 * to have a file "context" to include our copyright only once per file.
 */
function uglifyWithCopyrights() {
    var preserveComments = function (f) {
        return function (node, comment) {
            var text = comment.value;
            var type = comment.type;
            if (/@minifier_do_not_preserve/.test(text)) {
                return false;
            }
            var isOurCopyright = IS_OUR_COPYRIGHT_REGEXP.test(text);
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
            }
            else if ('comment1' === type) {
                return /license|copyright/i.test(text);
            }
            return false;
        };
    };
    var input = es.through();
    var output = input
        .pipe(flatmap(function (stream, f) {
        return stream.pipe(uglify({
            preserveComments: preserveComments(f),
            output: {
                // linux tfs build agent is crashing, does this help?§
                max_line_len: 3200000
            }
        }));
    }));
    return es.duplex(input, output);
}
function minifyTask(src, sourceMapBaseUrl) {
    var sourceMappingURL = sourceMapBaseUrl && (function (f) { return sourceMapBaseUrl + "/" + f.relative + ".map"; });
    return function (cb) {
        var jsFilter = filter('**/*.js', { restore: true });
        var cssFilter = filter('**/*.css', { restore: true });
        pump(gulp.src([src + '/**', '!' + src + '/**/*.map']), jsFilter, sourcemaps.init({ loadMaps: true }), uglifyWithCopyrights(), jsFilter.restore, cssFilter, minifyCSS({ reduceIdents: false }), cssFilter.restore, sourcemaps.write('./', {
            sourceMappingURL: sourceMappingURL,
            sourceRoot: null,
            includeContent: true,
            addComment: true
        }), gulp.dest(src + '-min'), function (err) {
            if (err instanceof uglify.GulpUglifyError) {
                console.error("Uglify error in '" + (err.cause && err.cause.filename) + "'");
            }
            cb(err);
        });
    };
}
exports.minifyTask = minifyTask;
;
