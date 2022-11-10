"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.minifyTask = exports.optimizeTask = exports.optimizeLoaderTask = exports.loaderConfig = void 0;
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
function loaderPlugin(src, base, amdModuleId) {
    return (gulp
        .src(src, { base })
        .pipe(es.through(function (data) {
        if (amdModuleId) {
            let contents = data.contents.toString('utf8');
            contents = contents.replace(/^define\(/m, `define("${amdModuleId}",`);
            data.contents = Buffer.from(contents);
        }
        this.emit('data', data);
    })));
}
function loader(src, bundledFileHeader, bundleLoader, externalLoaderInfo) {
    let loaderStream = gulp.src(`${src}/vs/loader.js`, { base: `${src}` });
    if (bundleLoader) {
        loaderStream = es.merge(loaderStream, loaderPlugin(`${src}/vs/css.js`, `${src}`, 'vs/css'), loaderPlugin(`${src}/vs/nls.js`, `${src}`, 'vs/nls'));
    }
    const files = [];
    const order = (f) => {
        if (f.path.endsWith('loader.js')) {
            return 0;
        }
        if (f.path.endsWith('css.js')) {
            return 1;
        }
        if (f.path.endsWith('nls.js')) {
            return 2;
        }
        return 3;
    };
    return (loaderStream
        .pipe(es.through(function (data) {
        files.push(data);
    }, function () {
        files.sort((a, b) => {
            return order(a) - order(b);
        });
        files.unshift(new VinylFile({
            path: 'fake',
            base: '.',
            contents: Buffer.from(bundledFileHeader)
        }));
        if (externalLoaderInfo !== undefined) {
            files.push(new VinylFile({
                path: 'fake2',
                base: '.',
                contents: Buffer.from(`require.config(${JSON.stringify(externalLoaderInfo, undefined, 2)});`)
            }));
        }
        for (const file of files) {
            this.emit('data', file);
        }
        this.emit('end');
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
        .pipe((0, stats_1.createStatsStream)(dest));
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
function optimizeAMDTask(opts) {
    const src = opts.src;
    const entryPoints = opts.entryPoints;
    const resources = opts.resources;
    const loaderConfig = opts.loaderConfig;
    const bundledFileHeader = opts.header || DEFAULT_FILE_HEADER;
    const fileContentMapper = opts.fileContentMapper || ((contents, _path) => contents);
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
    const result = es.merge(loader(src, bundledFileHeader, false, opts.externalLoaderInfo), bundlesStream, resourcesStream, bundleInfoStream);
    return result
        .pipe(sourcemaps.write('./', {
        sourceRoot: undefined,
        addComment: true,
        includeContent: true
    }))
        .pipe(opts.languages && opts.languages.length ? (0, i18n_1.processNlsFiles)({
        fileHeader: bundledFileHeader,
        languages: opts.languages
    }) : es.through());
}
function optimizeCommonJSTask(opts) {
    const esbuild = require('esbuild');
    const src = opts.src;
    const entryPoints = opts.entryPoints;
    return gulp.src(entryPoints, { base: `${src}`, allowEmpty: true })
        .pipe(es.map((f, cb) => {
        esbuild.build({
            entryPoints: [f.path],
            bundle: true,
            platform: opts.platform,
            write: false,
            external: opts.external
        }).then(res => {
            const jsFile = res.outputFiles[0];
            f.contents = Buffer.from(jsFile.contents);
            cb(undefined, f);
        });
    }));
}
function optimizeManualTask(options) {
    const concatenations = options.map(opt => {
        return gulp
            .src(opt.src)
            .pipe(concat(opt.out));
    });
    return es.merge(...concatenations);
}
function optimizeLoaderTask(src, out, bundleLoader, bundledFileHeader = '', externalLoaderInfo) {
    return () => loader(src, bundledFileHeader, bundleLoader, externalLoaderInfo).pipe(gulp.dest(out));
}
exports.optimizeLoaderTask = optimizeLoaderTask;
function optimizeTask(opts) {
    return function () {
        const optimizers = [optimizeAMDTask(opts.amd)];
        if (opts.commonJS) {
            optimizers.push(optimizeCommonJSTask(opts.commonJS));
        }
        if (opts.manual) {
            optimizers.push(optimizeManualTask(opts.manual));
        }
        return es.merge(...optimizers).pipe(gulp.dest(opts.out));
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
        const svgmin = require('gulp-svgmin');
        const jsFilter = filter('**/*.js', { restore: true });
        const cssFilter = filter('**/*.css', { restore: true });
        const svgFilter = filter('**/*.svg', { restore: true });
        pump(gulp.src([src + '/**', '!' + src + '/**/*.map']), jsFilter, sourcemaps.init({ loadMaps: true }), es.map((f, cb) => {
            esbuild.build({
                entryPoints: [f.path],
                minify: true,
                sourcemap: 'external',
                outdir: '.',
                platform: 'node',
                target: ['esnext'],
                write: false
            }).then(res => {
                const jsFile = res.outputFiles.find(f => /\.js$/.test(f.path));
                const sourceMapFile = res.outputFiles.find(f => /\.js\.map$/.test(f.path));
                f.contents = Buffer.from(jsFile.contents);
                f.sourceMap = JSON.parse(sourceMapFile.text);
                cb(undefined, f);
            }, cb);
        }), jsFilter.restore, cssFilter, postcss([cssnano({ preset: 'default' })]), cssFilter.restore, svgFilter, svgmin(), svgFilter.restore, sourcemaps.mapSources((sourcePath) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW1pemUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJvcHRpbWl6ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsNkJBQTZCO0FBQzdCLHNDQUFzQztBQUN0QyxzQ0FBc0M7QUFDdEMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyw2QkFBNkI7QUFDN0IsNkJBQTZCO0FBQzdCLG1DQUFtQztBQUNuQyxtQ0FBbUM7QUFDbkMsaUNBQW1EO0FBQ25ELG1DQUE0QztBQUM1QywrQkFBK0I7QUFFL0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFckQsU0FBUyxHQUFHLENBQUMsTUFBYyxFQUFFLE9BQWU7SUFDM0MsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sR0FBRyxHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBRUQsU0FBZ0IsWUFBWTtJQUMzQixNQUFNLE1BQU0sR0FBUTtRQUNuQixLQUFLLEVBQUU7WUFDTixJQUFJLEVBQUUsY0FBYztZQUNwQixRQUFRLEVBQUUsUUFBUTtTQUNsQjtRQUNELGlCQUFpQixFQUFFLE9BQU87S0FDMUIsQ0FBQztJQUVGLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUU3QyxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFaRCxvQ0FZQztBQUVELE1BQU0sdUJBQXVCLEdBQUcsd0NBQXdDLENBQUM7QUFFekUsU0FBUyxZQUFZLENBQUMsR0FBVyxFQUFFLElBQVksRUFBRSxXQUErQjtJQUMvRSxPQUFPLENBQ04sSUFBSTtTQUNGLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUNsQixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FB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