"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeTask = optimizeTask;
exports.minifyTask = minifyTask;
const es = require("event-stream");
const gulp = require("gulp");
const concat = require("gulp-concat");
const filter = require("gulp-filter");
const path = require("path");
const fs = require("fs");
const pump = require("pump");
const VinylFile = require("vinyl");
const bundle = require("./bundle");
const postcss_1 = require("./postcss");
const esbuild = require("esbuild");
const sourcemaps = require("gulp-sourcemaps");
const REPO_ROOT_PATH = path.join(__dirname, '../..');
const DEFAULT_FILE_HEADER = [
    '/*!--------------------------------------------------------',
    ' * Copyright (C) Microsoft Corporation. All rights reserved.',
    ' *--------------------------------------------------------*/'
].join('\n');
function optimizeESMTask(opts) {
    const resourcesStream = es.through(); // this stream will contain the resources
    const bundlesStream = es.through(); // this stream will contain the bundled files
    const entryPoints = opts.entryPoints.map(entryPoint => {
        if (typeof entryPoint === 'string') {
            return { name: path.parse(entryPoint).name };
        }
        return entryPoint;
    });
    const allMentionedModules = new Set();
    for (const entryPoint of entryPoints) {
        allMentionedModules.add(entryPoint.name);
        entryPoint.include?.forEach(allMentionedModules.add, allMentionedModules);
        entryPoint.exclude?.forEach(allMentionedModules.add, allMentionedModules);
    }
    const bundleAsync = async () => {
        const files = [];
        const tasks = [];
        for (const entryPoint of entryPoints) {
            console.log(`[bundle] '${entryPoint.name}'`);
            // support for 'dest' via esbuild#in/out
            const dest = entryPoint.dest?.replace(/\.[^/.]+$/, '') ?? entryPoint.name;
            // boilerplate massage
            const banner = {
                js: DEFAULT_FILE_HEADER,
                css: DEFAULT_FILE_HEADER
            };
            const tslibPath = path.join(require.resolve('tslib'), '../tslib.es6.js');
            banner.js += await fs.promises.readFile(tslibPath, 'utf-8');
            const contentsMapper = {
                name: 'contents-mapper',
                setup(build) {
                    build.onLoad({ filter: /\.js$/ }, async ({ path }) => {
                        // TS Boilerplate
                        const contents = await fs.promises.readFile(path, 'utf-8');
                        let newContents = bundle.removeAllTSBoilerplate(contents);
                        // File Content Mapper
                        const mapper = opts.fileContentMapper?.(path);
                        if (mapper) {
                            newContents = mapper(newContents);
                        }
                        return { contents: newContents };
                    });
                }
            };
            const externalOverride = {
                name: 'external-override',
                setup(build) {
                    // We inline selected modules that are we depend on on startup without
                    // a conditional `await import(...)` by hooking into the resolution.
                    build.onResolve({ filter: /^minimist$/ }, () => {
                        return { path: path.join(REPO_ROOT_PATH, 'node_modules', 'minimist', 'index.js'), external: false };
                    });
                },
            };
            const task = esbuild.build({
                bundle: true,
                external: entryPoint.exclude,
                packages: 'external', // "external all the things", see https://esbuild.github.io/api/#packages
                platform: 'neutral', // makes esm
                format: 'esm',
                sourcemap: 'external',
                plugins: [contentsMapper, externalOverride],
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
                    let sourceMapFile = undefined;
                    if (file.path.endsWith('.js')) {
                        sourceMapFile = res.outputFiles.find(f => f.path === `${file.path}.map`);
                    }
                    const fileProps = {
                        contents: Buffer.from(file.contents),
                        sourceMap: sourceMapFile ? JSON.parse(sourceMapFile.text) : undefined, // support gulp-sourcemaps
                        path: file.path,
                        base: path.join(REPO_ROOT_PATH, opts.src)
                    };
                    files.push(new VinylFile(fileProps));
                }
            });
            tasks.push(task);
        }
        await Promise.all(tasks);
        return { files };
    };
    bundleAsync().then((output) => {
        // bundle output (JS, CSS, SVG...)
        es.readArray(output.files).pipe(bundlesStream);
        // forward all resources
        gulp.src(opts.resources ?? [], { base: `${opts.src}`, allowEmpty: true }).pipe(resourcesStream);
    });
    const result = es.merge(bundlesStream, resourcesStream);
    return result
        .pipe(sourcemaps.write('./', {
        sourceRoot: undefined,
        addComment: true,
        includeContent: true
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
function optimizeTask(opts) {
    return function () {
        const optimizers = [];
        optimizers.push(optimizeESMTask(opts.esm));
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