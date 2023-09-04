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
                contents: Buffer.from(emitExternalLoaderInfo(externalLoaderInfo))
            }));
        }
        for (const file of files) {
            this.emit('data', file);
        }
        this.emit('end');
    }))
        .pipe(concat('vs/loader.js')));
}
function emitExternalLoaderInfo(externalLoaderInfo) {
    const externalBaseUrl = externalLoaderInfo.baseUrl;
    externalLoaderInfo.baseUrl = '$BASE_URL';
    // If defined, use the runtime configured baseUrl.
    const code = `
(function() {
	const baseUrl = require.getConfig().baseUrl || ${JSON.stringify(externalBaseUrl)};
	require.config(${JSON.stringify(externalLoaderInfo, undefined, 2)});
})();`;
    return code.replace('"$BASE_URL"', 'baseUrl');
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
                const contents = Buffer.from(jsFile.contents);
                const unicodeMatch = contents.toString().match(/[^\x00-\xFF]+/g);
                if (unicodeMatch) {
                    cb(new Error(`Found non-ascii character ${unicodeMatch[0]} in the minified output of ${f.path}. Non-ASCII characters in the output can cause performance problems when loading. Please review if you have introduced a regular expression that esbuild is not automatically converting and convert it to using unicode escape sequences.`));
                }
                else {
                    f.contents = contents;
                    f.sourceMap = JSON.parse(sourceMapFile.text);
                    cb(undefined, f);
                }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW1pemUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJvcHRpbWl6ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsNkJBQTZCO0FBQzdCLHNDQUFzQztBQUN0QyxzQ0FBc0M7QUFDdEMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyw2QkFBNkI7QUFDN0IsNkJBQTZCO0FBQzdCLG1DQUFtQztBQUNuQyxtQ0FBbUM7QUFDbkMsaUNBQW1EO0FBQ25ELG1DQUE0QztBQUM1QywrQkFBK0I7QUFFL0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFckQsU0FBUyxHQUFHLENBQUMsTUFBYyxFQUFFLE9BQWU7SUFDM0MsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sR0FBRyxHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBRUQsU0FBZ0IsWUFBWTtJQUMzQixNQUFNLE1BQU0sR0FBUTtRQUNuQixLQUFLLEVBQUU7WUFDTixJQUFJLEVBQUUsY0FBYztZQUNwQixRQUFRLEVBQUUsUUFBUTtTQUNsQjtRQUNELGlCQUFpQixFQUFFLE9BQU87S0FDMUIsQ0FBQztJQUVGLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUU3QyxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFaRCxvQ0FZQztBQUVELE1BQU0sdUJBQXVCLEdBQUcsd0NBQXdDLENBQUM7QUFFekUsU0FBUyxZQUFZLENBQUMsR0FBVyxFQUFFLElBQVksRUFBRSxXQUErQjtJQUMvRSxPQUFPLENBQ04sSUFBSTtTQUNGLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUNsQixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQWU7UUFDekMsSUFBSSxXQUFXLEVBQUU7WUFDaEIsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLFdBQVcsV0FBVyxJQUFJLENBQUMsQ0FBQztZQUN0RSxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDdEM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN6QixDQUFDLENBQUMsQ0FBQyxDQUNKLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxNQUFNLENBQUMsR0FBVyxFQUFFLGlCQUF5QixFQUFFLFlBQXFCLEVBQUUsa0JBQTZDO0lBQzNILElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLGVBQWUsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN2RSxJQUFJLFlBQVksRUFBRTtRQUNqQixZQUFZLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FDdEIsWUFBWSxFQUNaLFlBQVksQ0FBQyxHQUFHLEdBQUcsWUFBWSxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQ3BELFlBQVksQ0FBQyxHQUFHLEdBQUcsWUFBWSxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQ3BELENBQUM7S0FDRjtJQUVELE1BQU0sS0FBSyxHQUFnQixFQUFFLENBQUM7SUFDOUIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFZLEVBQUUsRUFBRTtRQUM5QixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sQ0FBQyxDQUFDO1NBQ1Q7UUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQzlCLE9BQU8sQ0FBQyxDQUFDO1NBQ1Q7UUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQzlCLE9BQU8sQ0FBQyxDQUFDO1NBQ1Q7UUFDRCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUMsQ0FBQztJQUVGLE9BQU8sQ0FDTixZQUFZO1NBQ1YsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJO1FBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEIsQ0FBQyxFQUFFO1FBQ0YsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNuQixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksU0FBUyxDQUFDO1lBQzNCLElBQUksRUFBRSxNQUFNO1lBQ1osSUFBSSxFQUFFLEdBQUc7WUFDVCxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztTQUN4QyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksa0JBQWtCLEtBQUssU0FBUyxFQUFFO1lBQ3JDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxTQUFTLENBQUM7Z0JBQ3hCLElBQUksRUFBRSxPQUFPO2dCQUNiLElBQUksRUFBRSxHQUFHO2dCQUNULFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGtCQUFrQixDQUFDLENBQUM7YUFDakUsQ0FBQyxDQUFDLENBQUM7U0FDSjtRQUNELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFO1lBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQ3hCO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztTQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FDOUIsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLGtCQUE0QztJQUMzRSxNQUFNLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLENBQUM7SUFDbkQsa0JBQWtCLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQztJQUV6QyxrREFBa0Q7SUFDbEQsTUFBTSxJQUFJLEdBQUc7O2tEQUVvQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQztrQkFDL0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO01BQzVELENBQUM7SUFDTixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxHQUFXLEVBQUUsaUJBQXlCLEVBQUUsT0FBdUIsRUFBRSxJQUFZLEVBQUUsaUJBQTZEO0lBQ25LLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRXJFLDBFQUEwRTtJQUMxRSwwRUFBMEU7SUFDMUUsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUM7SUFDakMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNuRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQ3pDLElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQy9DLG9CQUFvQixHQUFHLElBQUksQ0FBQztZQUM1QixNQUFNO1NBQ047S0FDRDtJQUVELElBQUksb0JBQW9CLEVBQUU7UUFDekIsT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUNmLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLGlCQUFpQjtTQUMzQixDQUFDLENBQUM7S0FDSDtJQUVELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxNQUFNO1FBQ2xELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDbkUsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUNsRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2pGLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFFMUYsT0FBTyxJQUFJLFNBQVMsQ0FBQztZQUNwQixJQUFJLEVBQUUsSUFBSTtZQUNWLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO1NBQy9CLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxFQUFFLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztTQUNqQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztTQUMxRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2xCLElBQUksQ0FBQyxJQUFBLHlCQUFpQixFQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEdBQVcsRUFBRSxpQkFBeUIsRUFBRSxPQUE2QixFQUFFLGlCQUE2RDtJQUMzSixPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLE1BQU07UUFDM0MsT0FBTyxjQUFjLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQy9GLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBNENELE1BQU0sbUJBQW1CLEdBQUc7SUFDM0IsNkRBQTZEO0lBQzdELDhEQUE4RDtJQUM5RCw4REFBOEQ7Q0FDOUQsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFYixTQUFTLGVBQWUsQ0FBQyxJQUEwQjtJQUNsRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ3JCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDckMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUNqQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQ3ZDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxtQkFBbUIsQ0FBQztJQUM3RCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsUUFBZ0IsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXBHLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBcUMsQ0FBQztJQUVsRixNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyw2Q0FBNkM7SUFDakYsTUFBTSxlQUFlLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMseUNBQXlDO0lBQy9FLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsMkNBQTJDO0lBRWxGLE1BQU0sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxVQUFVLEdBQUcsRUFBRSxNQUFNO1FBQzdELElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQUUsT0FBTyxhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FBRTtRQUVoRixjQUFjLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFNUYsK0JBQStCO1FBQy9CLE1BQU0saUJBQWlCLEdBQUcsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsVUFBVSxRQUFRO1lBQ3BELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO2dCQUN4QyxHQUFHLENBQUMsV0FBVyxFQUFFLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxDQUFDO2FBQ25EO1lBQ0QsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxHQUFHLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFeEYsTUFBTSxlQUFlLEdBQWdCLEVBQUUsQ0FBQztRQUN4QyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDcEIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsQ0FBQztnQkFDbEMsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsSUFBSSxFQUFFLEdBQUc7Z0JBQ1QsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzthQUNwRSxDQUFDLENBQUMsQ0FBQztTQUNKO1FBQ0QsRUFBRSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUN0RCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQ3RCLE1BQU0sQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxFQUM5RCxhQUFhLEVBQ2IsZUFBZSxFQUNmLGdCQUFnQixDQUNoQixDQUFDO0lBRUYsT0FBTyxNQUFNO1NBQ1gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO1FBQzVCLFVBQVUsRUFBRSxTQUFTO1FBQ3JCLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLGNBQWMsRUFBRSxJQUFJO0tBQ3BCLENBQUMsQ0FBQztTQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFBLHNCQUFlLEVBQUM7UUFDL0QsVUFBVSxFQUFFLGlCQUFpQjtRQUM3QixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7S0FDekIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUNyQixDQUFDO0FBcUJELFNBQVMsb0JBQW9CLENBQUMsSUFBK0I7SUFDNUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBNkIsQ0FBQztJQUUvRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ3JCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7SUFFckMsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUNoRSxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLEVBQUUsRUFBRTtRQUMzQixPQUFPLENBQUMsS0FBSyxDQUFDO1lBQ2IsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNyQixNQUFNLEVBQUUsSUFBSTtZQUNaLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixLQUFLLEVBQUUsS0FBSztZQUNaLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtTQUN2QixDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2IsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQWNELFNBQVMsa0JBQWtCLENBQUMsT0FBa0M7SUFDN0QsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUN4QyxPQUFPLElBQUk7YUFDVCxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQzthQUNaLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekIsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQztBQUNwQyxDQUFDO0FBRUQsU0FBZ0Isa0JBQWtCLENBQUMsR0FBVyxFQUFFLEdBQVcsRUFBRSxZQUFxQixFQUFFLGlCQUFpQixHQUFHLEVBQUUsRUFBRSxrQkFBNkM7SUFDeEosT0FBTyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEcsQ0FBQztBQUZELGdEQUVDO0FBcUJELFNBQWdCLFlBQVksQ0FBQyxJQUF1QjtJQUNuRCxPQUFPO1FBQ04sTUFBTSxVQUFVLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0MsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2xCLFVBQVUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDckQ7UUFFRCxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDaEIsVUFBVSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztTQUNqRDtRQUVELE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQztBQUNILENBQUM7QUFiRCxvQ0FhQztBQUVELFNBQWdCLFVBQVUsQ0FBQyxHQUFXLEVBQUUsZ0JBQXlCO0lBQ2hFLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQTZCLENBQUM7SUFDL0QsTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxnQkFBZ0IsSUFBSSxDQUFDLENBQUMsUUFBUSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBRTlHLE9BQU8sRUFBRSxDQUFDLEVBQUU7UUFDWCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUE2QixDQUFDO1FBQy9ELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQWtDLENBQUM7UUFDekUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFxQyxDQUFDO1FBQ2xGLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQWlDLENBQUM7UUFFdEUsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxVQUFVLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsVUFBVSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFeEQsSUFBSSxDQUNILElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsS0FBSyxFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsV0FBVyxDQUFDLENBQUMsRUFDaEQsUUFBUSxFQUNSLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFDbkMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLEVBQUUsRUFBRTtZQUNyQixPQUFPLENBQUMsS0FBSyxDQUFDO2dCQUNiLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ3JCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVMsRUFBRSxVQUFVO2dCQUNyQixNQUFNLEVBQUUsR0FBRztnQkFDWCxRQUFRLEVBQUUsTUFBTTtnQkFDaEIsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDO2dCQUNsQixLQUFLLEVBQUUsS0FBSzthQUNaLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ2IsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDO2dCQUNoRSxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFFLENBQUM7Z0JBRTVFLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM5QyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQ2pFLElBQUksWUFBWSxFQUFFO29CQUNqQixFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsNkJBQTZCLFlBQVksQ0FBQyxDQUFDLENBQUMsOEJBQThCLENBQUMsQ0FBQyxJQUFJLDRPQUE0TyxDQUFDLENBQUMsQ0FBQztpQkFDNVU7cUJBQU07b0JBQ04sQ0FBQyxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7b0JBQ3RCLENBQUMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRTdDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7aUJBQ2pCO1lBQ0YsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ1IsQ0FBQyxDQUFDLEVBQ0YsUUFBUSxDQUFDLE9BQU8sRUFDaEIsU0FBUyxFQUNULE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDekMsU0FBUyxDQUFDLE9BQU8sRUFDakIsU0FBUyxFQUNULE1BQU0sRUFBRSxFQUNSLFNBQVMsQ0FBQyxPQUFPLEVBQ1gsVUFBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQWtCLEVBQUUsRUFBRTtZQUNuRCxJQUFJLFVBQVUsS0FBSyxtQkFBbUIsRUFBRTtnQkFDdkMsT0FBTyx3QkFBd0IsQ0FBQzthQUNoQztZQUVELE9BQU8sVUFBVSxDQUFDO1FBQ25CLENBQUMsQ0FBQyxFQUNGLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO1lBQ3RCLGdCQUFnQjtZQUNoQixVQUFVLEVBQUUsU0FBUztZQUNyQixjQUFjLEVBQUUsSUFBSTtZQUNwQixVQUFVLEVBQUUsSUFBSTtTQUNULENBQUMsRUFDVCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsRUFDdkIsQ0FBQyxHQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3pCLENBQUMsQ0FBQztBQUNILENBQUM7QUFsRUQsZ0NBa0VDIn0=