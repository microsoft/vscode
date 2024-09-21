"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.loaderConfig = loaderConfig;
exports.optimizeLoaderTask = optimizeLoaderTask;
exports.optimizeTask = optimizeTask;
exports.minifyTask = minifyTask;
const es = require("event-stream");
const gulp = require("gulp");
const concat = require("gulp-concat");
const filter = require("gulp-filter");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const path = require("path");
const fs = require("fs");
const pump = require("pump");
const VinylFile = require("vinyl");
const bundle = require("./bundle");
const i18n_1 = require("./i18n");
const stats_1 = require("./stats");
const util = require("./util");
const postcss_1 = require("./postcss");
const esbuild = require("esbuild");
const sourcemaps = require("gulp-sourcemaps");
const amd_1 = require("./amd");
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
        loaderStream = es.merge(loaderStream, loaderPlugin(`${src}/vs/css.js`, `${src}`, 'vs/css'));
    }
    const files = [];
    const order = (f) => {
        if (f.path.endsWith('loader.js')) {
            return 0;
        }
        if (f.path.endsWith('css.js')) {
            return 1;
        }
        return 2;
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
    const entryPoints = opts.entryPoints.filter(d => d.target !== 'esm');
    const resources = opts.resources;
    const loaderConfig = opts.loaderConfig;
    const bundledFileHeader = opts.header || DEFAULT_FILE_HEADER;
    const fileContentMapper = opts.fileContentMapper || ((contents, _path) => contents);
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
        out: opts.src,
        fileHeader: bundledFileHeader,
        languages: opts.languages
    }) : es.through());
}
function optimizeESMTask(opts, cjsOpts) {
    const resourcesStream = es.through(); // this stream will contain the resources
    const bundlesStream = es.through(); // this stream will contain the bundled files
    const entryPoints = opts.entryPoints.filter(d => d.target !== 'amd');
    if (cjsOpts) {
        cjsOpts.entryPoints.forEach(entryPoint => entryPoints.push({ name: path.parse(entryPoint).name }));
    }
    const allMentionedModules = new Set();
    for (const entryPoint of entryPoints) {
        allMentionedModules.add(entryPoint.name);
        entryPoint.include?.forEach(allMentionedModules.add, allMentionedModules);
        entryPoint.exclude?.forEach(allMentionedModules.add, allMentionedModules);
    }
    allMentionedModules.delete('vs/css'); // TODO@esm remove this when vs/css is removed
    const bundleAsync = async () => {
        const files = [];
        const tasks = [];
        for (const entryPoint of entryPoints) {
            console.log(`[bundle] '${entryPoint.name}'`);
            // support for 'dest' via esbuild#in/out
            const dest = entryPoint.dest?.replace(/\.[^/.]+$/, '') ?? entryPoint.name;
            // boilerplate massage
            const banner = { js: '' };
            const tslibPath = path.join(require.resolve('tslib'), '../tslib.es6.js');
            banner.js += await fs.promises.readFile(tslibPath, 'utf-8');
            const boilerplateTrimmer = {
                name: 'boilerplate-trimmer',
                setup(build) {
                    build.onLoad({ filter: /\.js$/ }, async (args) => {
                        const contents = await fs.promises.readFile(args.path, 'utf-8');
                        const newContents = bundle.removeAllTSBoilerplate(contents);
                        return { contents: newContents };
                    });
                }
            };
            // support for 'preprend' via the esbuild#banner
            if (entryPoint.prepend?.length) {
                for (const item of entryPoint.prepend) {
                    const fullpath = path.join(REPO_ROOT_PATH, opts.src, item.path);
                    const source = await fs.promises.readFile(fullpath, 'utf8');
                    banner.js += source + '\n';
                }
            }
            const task = esbuild.build({
                bundle: true,
                external: entryPoint.exclude,
                packages: 'external', // "external all the things", see https://esbuild.github.io/api/#packages
                platform: 'neutral', // makes esm
                format: 'esm',
                sourcemap: 'external',
                plugins: [boilerplateTrimmer],
                target: ['es2022'],
                loader: {
                    '.ttf': 'file',
                    '.svg': 'file',
                    '.png': 'file',
                    '.sh': 'file',
                },
                assetNames: 'media/[name]', // moves media assets into a sub-folder "media"
                banner: entryPoint.name === 'vs/workbench/workbench.web.main' ? undefined : banner, // TODO@esm remove line when we stop supporting web-amd-esm-bridge
                entryPoints: [
                    {
                        in: path.join(REPO_ROOT_PATH, opts.src, `${entryPoint.name}.js`),
                        out: dest,
                    }
                ],
                outdir: path.join(REPO_ROOT_PATH, opts.src),
                write: false, // enables res.outputFiles
                metafile: true, // enables res.metafile
            }).then(res => {
                for (const file of res.outputFiles) {
                    let contents = file.contents;
                    let sourceMapFile = undefined;
                    if (file.path.endsWith('.js')) {
                        if (opts.fileContentMapper) {
                            // UGLY the fileContentMapper is per file but at this point we have all files
                            // bundled already. So, we call the mapper for the same contents but each file
                            // that has been included in the bundle...
                            let newText = file.text;
                            for (const input of Object.keys(res.metafile.inputs)) {
                                newText = opts.fileContentMapper(newText, input);
                            }
                            contents = Buffer.from(newText);
                        }
                        sourceMapFile = res.outputFiles.find(f => f.path === `${file.path}.map`);
                    }
                    const fileProps = {
                        contents: Buffer.from(contents),
                        sourceMap: sourceMapFile ? JSON.parse(sourceMapFile.text) : undefined, // support gulp-sourcemaps
                        path: file.path,
                        base: path.join(REPO_ROOT_PATH, opts.src)
                    };
                    files.push(new VinylFile(fileProps));
                }
            });
            // await task; // FORCE serial bundling (makes debugging easier)
            tasks.push(task);
        }
        await Promise.all(tasks);
        return { files };
    };
    bundleAsync().then((output) => {
        // bundle output (JS, CSS, SVG...)
        es.readArray(output.files).pipe(bundlesStream);
        // forward all resources
        gulp.src(opts.resources, { base: `${opts.src}`, allowEmpty: true }).pipe(resourcesStream);
    });
    const result = es.merge(bundlesStream, resourcesStream);
    return result
        .pipe(sourcemaps.write('./', {
        sourceRoot: undefined,
        addComment: true,
        includeContent: true
    }))
        .pipe(opts.languages && opts.languages.length ? (0, i18n_1.processNlsFiles)({
        out: opts.src,
        fileHeader: opts.header || DEFAULT_FILE_HEADER,
        languages: opts.languages
    }) : es.through());
}
function optimizeCommonJSTask(opts) {
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
function optimizeTask(opts) {
    return function () {
        const optimizers = [];
        if (!(0, amd_1.isAMD)()) {
            optimizers.push(optimizeESMTask(opts.amd, opts.commonJS));
        }
        else {
            optimizers.push(optimizeAMDTask(opts.amd));
            if (opts.commonJS) {
                optimizers.push(optimizeCommonJSTask(opts.commonJS));
            }
        }
        if (opts.manual) {
            optimizers.push(optimizeManualTask(opts.manual));
        }
        return es.merge(...optimizers).pipe(gulp.dest(opts.out));
    };
}
function minifyTask(src, sourceMapBaseUrl) {
    const sourceMappingURL = sourceMapBaseUrl ? ((f) => `${sourceMapBaseUrl}/${f.relative}.map`) : undefined;
    return cb => {
        const cssnano = require('cssnano');
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
                target: ['es2022'],
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
        }), jsFilter.restore, cssFilter, (0, postcss_1.gulpPostcss)([cssnano({ preset: 'default' })]), cssFilter.restore, svgFilter, svgmin(), svgFilter.restore, sourcemaps.write('./', {
            sourceMappingURL,
            sourceRoot: undefined,
            includeContent: true,
            addComment: true
        }), gulp.dest(src + '-min'), (err) => cb(err));
    };
}
//# sourceMappingURL=optimize.js.map