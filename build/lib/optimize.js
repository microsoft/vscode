/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.minifyTask = exports.optimizeTask = exports.loaderConfig = void 0;
const es = require("event-stream");
const gulp = require("gulp");
const concat = require("gulp-concat");
const filter = require("gulp-filter");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const path = require("path");
const pump = require("pump");
const VinylFile = require("vinyl");
const bundle = require("./bundle");
const i18n_1 = require("./i18n");
const stats_1 = require("./stats");
const util = require("./util");
const REPO_ROOT_PATH = path.join(__dirname, '../..');
function log(prefix, message) {
    fancyLog(ansiColors.cyan('[' + prefix + ']'), message);
}
function loaderConfig() {
    const result = {
        paths: {
            'vs': 'out-build/vs',
            'vscode': 'empty:'
        },
        amdModulesPattern: /^vs\//
    };
    result['vs/css'] = { inlineResources: true };
    return result;
}
exports.loaderConfig = loaderConfig;
const IS_OUR_COPYRIGHT_REGEXP = /Copyright \(C\) Microsoft Corporation/i;
function loader(src, bundledFileHeader, bundleLoader) {
    let sources = [
        `${src}/vs/loader.js`
    ];
    if (bundleLoader) {
        sources = sources.concat([
            `${src}/vs/css.js`,
            `${src}/vs/nls.js`
        ]);
    }
    let isFirst = true;
    return (gulp
        .src(sources, { base: `${src}` })
        .pipe(es.through(function (data) {
        if (isFirst) {
            isFirst = false;
            this.emit('data', new VinylFile({
                path: 'fake',
                base: '.',
                contents: Buffer.from(bundledFileHeader)
            }));
            this.emit('data', data);
        }
        else {
            this.emit('data', data);
        }
    }))
        .pipe(concat('vs/loader.js')));
}
function toConcatStream(src, bundledFileHeader, sources, dest, fileContentMapper) {
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
    const treatedSources = sources.map(function (source) {
        const root = source.path ? REPO_ROOT_PATH.replace(/\\/g, '/') : '';
        const base = source.path ? root + `/${src}` : '.';
        const path = source.path ? root + '/' + source.path.replace(/\\/g, '/') : 'fake';
        const contents = source.path ? fileContentMapper(source.contents, path) : source.contents;
        return new VinylFile({
            path: path,
            base: base,
            contents: Buffer.from(contents)
        });
    });
    return es.readArray(treatedSources)
        .pipe(useSourcemaps ? util.loadSourcemaps() : es.through())
        .pipe(concat(dest))
        .pipe(stats_1.createStatsStream(dest));
}
function toBundleStream(src, bundledFileHeader, bundles, fileContentMapper) {
    return es.merge(bundles.map(function (bundle) {
        return toConcatStream(src, bundledFileHeader, bundle.sources, bundle.dest, fileContentMapper);
    }));
}
const DEFAULT_FILE_HEADER = [
    '/*!--------------------------------------------------------',
    ' * Copyright (C) Microsoft Corporation. All rights reserved.',
    ' *--------------------------------------------------------*/'
].join('\n');
function optimizeTask(opts) {
    const src = opts.src;
    const entryPoints = opts.entryPoints;
    const resources = opts.resources;
    const loaderConfig = opts.loaderConfig;
    const bundledFileHeader = opts.header || DEFAULT_FILE_HEADER;
    const bundleLoader = (typeof opts.bundleLoader === 'undefined' ? true : opts.bundleLoader);
    const out = opts.out;
    const fileContentMapper = opts.fileContentMapper || ((contents, _path) => contents);
    return function () {
        const sourcemaps = require('gulp-sourcemaps');
        const bundlesStream = es.through(); // this stream will contain the bundled files
        const resourcesStream = es.through(); // this stream will contain the resources
        const bundleInfoStream = es.through(); // this stream will contain bundleInfo.json
        bundle.bundle(entryPoints, loaderConfig, function (err, result) {
            if (err || !result) {
                return bundlesStream.emit('error', JSON.stringify(err));
            }
            toBundleStream(src, bundledFileHeader, result.files, fileContentMapper).pipe(bundlesStream);
            // Remove css inlined resources
            const filteredResources = resources.slice();
            result.cssInlinedResources.forEach(function (resource) {
                if (process.env['VSCODE_BUILD_VERBOSE']) {
                    log('optimizer', 'excluding inlined: ' + resource);
                }
                filteredResources.push('!' + resource);
            });
            gulp.src(filteredResources, { base: `${src}`, allowEmpty: true }).pipe(resourcesStream);
            const bundleInfoArray = [];
            if (opts.bundleInfo) {
                bundleInfoArray.push(new VinylFile({
                    path: 'bundleInfo.json',
                    base: '.',
                    contents: Buffer.from(JSON.stringify(result.bundleData, null, '\t'))
                }));
            }
            es.readArray(bundleInfoArray).pipe(bundleInfoStream);
        });
        const result = es.merge(loader(src, bundledFileHeader, bundleLoader), bundlesStream, resourcesStream, bundleInfoStream);
        return result
            .pipe(sourcemaps.write('./', {
            sourceRoot: undefined,
            addComment: true,
            includeContent: true
        }))
            .pipe(opts.languages && opts.languages.length ? i18n_1.processNlsFiles({
            fileHeader: bundledFileHeader,
            languages: opts.languages
        }) : es.through())
            .pipe(gulp.dest(out));
    };
}
exports.optimizeTask = optimizeTask;
function minifyTask(src, sourceMapBaseUrl) {
    const esbuild = require('esbuild');
    const sourceMappingURL = sourceMapBaseUrl ? ((f) => `${sourceMapBaseUrl}/${f.relative}.map`) : undefined;
    return cb => {
        const cssnano = require('cssnano');
        const postcss = require('gulp-postcss');
        const sourcemaps = require('gulp-sourcemaps');
        const jsFilter = filter('**/*.js', { restore: true });
        const cssFilter = filter('**/*.css', { restore: true });
        pump(gulp.src([src + '/**', '!' + src + '/**/*.map']), jsFilter, sourcemaps.init({ loadMaps: true }), es.map((f, cb) => {
            esbuild.build({
                entryPoints: [f.path],
                minify: true,
                sourcemap: 'external',
                outdir: '.',
                platform: 'node',
                target: ['node12.18'],
                write: false
            }).then(res => {
                const jsFile = res.outputFiles.find(f => /\.js$/.test(f.path));
                const sourceMapFile = res.outputFiles.find(f => /\.js\.map$/.test(f.path));
                f.contents = Buffer.from(jsFile.contents);
                f.sourceMap = JSON.parse(sourceMapFile.text);
                cb(undefined, f);
            }, cb);
        }), jsFilter.restore, cssFilter, postcss([cssnano({ preset: 'default' })]), cssFilter.restore, sourcemaps.mapSources((sourcePath) => {
            if (sourcePath === 'bootstrap-fork.js') {
                return 'bootstrap-fork.orig.js';
            }
            return sourcePath;
        }), sourcemaps.write('./', {
            sourceMappingURL,
            sourceRoot: undefined,
            includeContent: true,
            addComment: true
        }), gulp.dest(src + '-min'), (err) => cb(err));
    };
}
exports.minifyTask = minifyTask;
