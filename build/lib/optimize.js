"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundleTask = bundleTask;
exports.minifyTask = minifyTask;
const event_stream_1 = __importDefault(require("event-stream"));
const gulp_1 = __importDefault(require("gulp"));
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pump_1 = __importDefault(require("pump"));
const vinyl_1 = __importDefault(require("vinyl"));
const bundle = __importStar(require("./bundle"));
const postcss_1 = require("./postcss");
const esbuild_1 = __importDefault(require("esbuild"));
const gulp_sourcemaps_1 = __importDefault(require("gulp-sourcemaps"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const REPO_ROOT_PATH = path_1.default.join(__dirname, '../..');
const DEFAULT_FILE_HEADER = [
    '/*!--------------------------------------------------------',
    ' * Copyright (C) Microsoft Corporation. All rights reserved.',
    ' *--------------------------------------------------------*/'
].join('\n');
function bundleESMTask(opts) {
    const resourcesStream = event_stream_1.default.through(); // this stream will contain the resources
    const bundlesStream = event_stream_1.default.through(); // this stream will contain the bundled files
    const entryPoints = opts.entryPoints.map(entryPoint => {
        if (typeof entryPoint === 'string') {
            return { name: path_1.default.parse(entryPoint).name };
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
            (0, fancy_log_1.default)(`Bundled entry point: ${ansi_colors_1.default.yellow(entryPoint.name)}...`);
            // support for 'dest' via esbuild#in/out
            const dest = entryPoint.dest?.replace(/\.[^/.]+$/, '') ?? entryPoint.name;
            // banner contents
            const banner = {
                js: DEFAULT_FILE_HEADER,
                css: DEFAULT_FILE_HEADER
            };
            // TS Boilerplate
            if (!opts.skipTSBoilerplateRemoval?.(entryPoint.name)) {
                const tslibPath = path_1.default.join(require.resolve('tslib'), '../tslib.es6.js');
                banner.js += await fs_1.default.promises.readFile(tslibPath, 'utf-8');
            }
            const contentsMapper = {
                name: 'contents-mapper',
                setup(build) {
                    build.onLoad({ filter: /\.js$/ }, async ({ path }) => {
                        const contents = await fs_1.default.promises.readFile(path, 'utf-8');
                        // TS Boilerplate
                        let newContents;
                        if (!opts.skipTSBoilerplateRemoval?.(entryPoint.name)) {
                            newContents = bundle.removeAllTSBoilerplate(contents);
                        }
                        else {
                            newContents = contents;
                        }
                        // File Content Mapper
                        const mapper = opts.fileContentMapper?.(path.replace(/\\/g, '/'));
                        if (mapper) {
                            newContents = await mapper(newContents);
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
                        return { path: path_1.default.join(REPO_ROOT_PATH, 'node_modules', 'minimist', 'index.js'), external: false };
                    });
                },
            };
            const task = esbuild_1.default.build({
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
                        in: path_1.default.join(REPO_ROOT_PATH, opts.src, `${entryPoint.name}.js`),
                        out: dest,
                    }
                ],
                outdir: path_1.default.join(REPO_ROOT_PATH, opts.src),
                write: false, // enables res.outputFiles
                metafile: true, // enables res.metafile
                // minify: NOT enabled because we have a separate minify task that takes care of the TSLib banner as well
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
                        base: path_1.default.join(REPO_ROOT_PATH, opts.src)
                    };
                    files.push(new vinyl_1.default(fileProps));
                }
            });
            tasks.push(task);
        }
        await Promise.all(tasks);
        return { files };
    };
    bundleAsync().then((output) => {
        // bundle output (JS, CSS, SVG...)
        event_stream_1.default.readArray(output.files).pipe(bundlesStream);
        // forward all resources
        gulp_1.default.src(opts.resources ?? [], { base: `${opts.src}`, allowEmpty: true }).pipe(resourcesStream);
    });
    const result = event_stream_1.default.merge(bundlesStream, resourcesStream);
    return result
        .pipe(gulp_sourcemaps_1.default.write('./', {
        sourceRoot: undefined,
        addComment: true,
        includeContent: true
    }));
}
function bundleTask(opts) {
    return function () {
        return bundleESMTask(opts.esm).pipe(gulp_1.default.dest(opts.out));
    };
}
function minifyTask(src, sourceMapBaseUrl) {
    const sourceMappingURL = sourceMapBaseUrl ? ((f) => `${sourceMapBaseUrl}/${f.relative}.map`) : undefined;
    return cb => {
        const cssnano = require('cssnano');
        const svgmin = require('gulp-svgmin');
        const jsFilter = (0, gulp_filter_1.default)('**/*.js', { restore: true });
        const cssFilter = (0, gulp_filter_1.default)('**/*.css', { restore: true });
        const svgFilter = (0, gulp_filter_1.default)('**/*.svg', { restore: true });
        (0, pump_1.default)(gulp_1.default.src([src + '/**', '!' + src + '/**/*.map']), jsFilter, gulp_sourcemaps_1.default.init({ loadMaps: true }), event_stream_1.default.map((f, cb) => {
            esbuild_1.default.build({
                entryPoints: [f.path],
                minify: true,
                sourcemap: 'external',
                outdir: '.',
                packages: 'external', // "external all the things", see https://esbuild.github.io/api/#packages
                platform: 'neutral', // makes esm
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
        }), jsFilter.restore, cssFilter, (0, postcss_1.gulpPostcss)([cssnano({ preset: 'default' })]), cssFilter.restore, svgFilter, svgmin(), svgFilter.restore, gulp_sourcemaps_1.default.write('./', {
            sourceMappingURL,
            sourceRoot: undefined,
            includeContent: true,
            addComment: true
        }), gulp_1.default.dest(src + '-min'), (err) => cb(err));
    };
}
//# sourceMappingURL=optimize.js.map