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
exports.fromMarketplace = fromMarketplace;
exports.fromVsix = fromVsix;
exports.fromGithub = fromGithub;
exports.packageNonNativeLocalExtensionsStream = packageNonNativeLocalExtensionsStream;
exports.packageNativeLocalExtensionsStream = packageNativeLocalExtensionsStream;
exports.packageAllLocalExtensionsStream = packageAllLocalExtensionsStream;
exports.packageMarketplaceExtensionsStream = packageMarketplaceExtensionsStream;
exports.scanBuiltinExtensions = scanBuiltinExtensions;
exports.translatePackageJSON = translatePackageJSON;
exports.webpackExtensions = webpackExtensions;
exports.buildExtensionMedia = buildExtensionMedia;
const event_stream_1 = __importDefault(require("event-stream"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = __importDefault(require("child_process"));
const glob_1 = __importDefault(require("glob"));
const gulp_1 = __importDefault(require("gulp"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const vinyl_1 = __importDefault(require("vinyl"));
const stats_1 = require("./stats");
const util2 = __importStar(require("./util"));
const vzip = require('gulp-vinyl-zip');
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const gulp_rename_1 = __importDefault(require("gulp-rename"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const gulp_buffer_1 = __importDefault(require("gulp-buffer"));
const jsoncParser = __importStar(require("jsonc-parser"));
const dependencies_1 = require("./dependencies");
const builtInExtensions_1 = require("./builtInExtensions");
const getVersion_1 = require("./getVersion");
const fetch_1 = require("./fetch");
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const commit = (0, getVersion_1.getVersion)(root);
const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
function minifyExtensionResources(input) {
    const jsonFilter = (0, gulp_filter_1.default)(['**/*.json', '**/*.code-snippets'], { restore: true });
    return input
        .pipe(jsonFilter)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(event_stream_1.default.mapSync((f) => {
        const errors = [];
        const value = jsoncParser.parse(f.contents.toString('utf8'), errors, { allowTrailingComma: true });
        if (errors.length === 0) {
            // file parsed OK => just stringify to drop whitespace and comments
            f.contents = Buffer.from(JSON.stringify(value));
        }
        return f;
    }))
        .pipe(jsonFilter.restore);
}
function updateExtensionPackageJSON(input, update) {
    const packageJsonFilter = (0, gulp_filter_1.default)('extensions/*/package.json', { restore: true });
    return input
        .pipe(packageJsonFilter)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(event_stream_1.default.mapSync((f) => {
        const data = JSON.parse(f.contents.toString('utf8'));
        f.contents = Buffer.from(JSON.stringify(update(data)));
        return f;
    }))
        .pipe(packageJsonFilter.restore);
}
function fromLocal(extensionPath, forWeb, disableMangle) {
    const webpackConfigFileName = forWeb ? 'extension-browser.webpack.config.js' : 'extension.webpack.config.js';
    const isWebPacked = fs_1.default.existsSync(path_1.default.join(extensionPath, webpackConfigFileName));
    let input = isWebPacked
        ? fromLocalWebpack(extensionPath, webpackConfigFileName, disableMangle)
        : fromLocalNormal(extensionPath);
    if (isWebPacked) {
        input = updateExtensionPackageJSON(input, (data) => {
            delete data.scripts;
            delete data.dependencies;
            delete data.devDependencies;
            if (data.main) {
                data.main = data.main.replace('/out/', '/dist/');
            }
            return data;
        });
    }
    return input;
}
function fromLocalWebpack(extensionPath, webpackConfigFileName, disableMangle) {
    const vsce = require('@vscode/vsce');
    const webpack = require('webpack');
    const webpackGulp = require('webpack-stream');
    const result = event_stream_1.default.through();
    const packagedDependencies = [];
    const packageJsonConfig = require(path_1.default.join(extensionPath, 'package.json'));
    if (packageJsonConfig.dependencies) {
        const webpackRootConfig = require(path_1.default.join(extensionPath, webpackConfigFileName));
        for (const key in webpackRootConfig.externals) {
            if (key in packageJsonConfig.dependencies) {
                packagedDependencies.push(key);
            }
        }
    }
    // TODO: add prune support based on packagedDependencies to vsce.PackageManager.Npm similar
    // to vsce.PackageManager.Yarn.
    // A static analysis showed there are no webpack externals that are dependencies of the current
    // local extensions so we can use the vsce.PackageManager.None config to ignore dependencies list
    // as a temporary workaround.
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.None, packagedDependencies }).then(fileNames => {
        const files = fileNames
            .map(fileName => path_1.default.join(extensionPath, fileName))
            .map(filePath => new vinyl_1.default({
            path: filePath,
            stat: fs_1.default.statSync(filePath),
            base: extensionPath,
            contents: fs_1.default.createReadStream(filePath)
        }));
        // check for a webpack configuration files, then invoke webpack
        // and merge its output with the files stream.
        const webpackConfigLocations = glob_1.default.sync(path_1.default.join(extensionPath, '**', webpackConfigFileName), { ignore: ['**/node_modules'] });
        const webpackStreams = webpackConfigLocations.flatMap(webpackConfigPath => {
            const webpackDone = (err, stats) => {
                (0, fancy_log_1.default)(`Bundled extension: ${ansi_colors_1.default.yellow(path_1.default.join(path_1.default.basename(extensionPath), path_1.default.relative(extensionPath, webpackConfigPath)))}...`);
                if (err) {
                    result.emit('error', err);
                }
                const { compilation } = stats;
                if (compilation.errors.length > 0) {
                    result.emit('error', compilation.errors.join('\n'));
                }
                if (compilation.warnings.length > 0) {
                    result.emit('error', compilation.warnings.join('\n'));
                }
            };
            const exportedConfig = require(webpackConfigPath);
            return (Array.isArray(exportedConfig) ? exportedConfig : [exportedConfig]).map(config => {
                const webpackConfig = {
                    ...config,
                    ...{ mode: 'production' }
                };
                if (disableMangle) {
                    if (Array.isArray(config.module.rules)) {
                        for (const rule of config.module.rules) {
                            if (Array.isArray(rule.use)) {
                                for (const use of rule.use) {
                                    if (String(use.loader).endsWith('mangle-loader.js')) {
                                        use.options.disabled = true;
                                    }
                                }
                            }
                        }
                    }
                }
                const relativeOutputPath = path_1.default.relative(extensionPath, webpackConfig.output.path);
                return webpackGulp(webpackConfig, webpack, webpackDone)
                    .pipe(event_stream_1.default.through(function (data) {
                    data.stat = data.stat || {};
                    data.base = extensionPath;
                    this.emit('data', data);
                }))
                    .pipe(event_stream_1.default.through(function (data) {
                    // source map handling:
                    // * rewrite sourceMappingURL
                    // * save to disk so that upload-task picks this up
                    if (path_1.default.extname(data.basename) === '.js') {
                        const contents = data.contents.toString('utf8');
                        data.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, function (_m, g1) {
                            return `\n//# sourceMappingURL=${sourceMappingURLBase}/extensions/${path_1.default.basename(extensionPath)}/${relativeOutputPath}/${g1}`;
                        }), 'utf8');
                    }
                    this.emit('data', data);
                }));
            });
        });
        event_stream_1.default.merge(...webpackStreams, event_stream_1.default.readArray(files))
            // .pipe(es.through(function (data) {
            // 	// debug
            // 	console.log('out', data.path, data.contents.length);
            // 	this.emit('data', data);
            // }))
            .pipe(result);
    }).catch(err => {
        console.error(extensionPath);
        console.error(packagedDependencies);
        result.emit('error', err);
    });
    return result.pipe((0, stats_1.createStatsStream)(path_1.default.basename(extensionPath)));
}
function fromLocalNormal(extensionPath) {
    const vsce = require('@vscode/vsce');
    const result = event_stream_1.default.through();
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Npm })
        .then(fileNames => {
        const files = fileNames
            .map(fileName => path_1.default.join(extensionPath, fileName))
            .map(filePath => new vinyl_1.default({
            path: filePath,
            stat: fs_1.default.statSync(filePath),
            base: extensionPath,
            contents: fs_1.default.createReadStream(filePath)
        }));
        event_stream_1.default.readArray(files).pipe(result);
    })
        .catch(err => result.emit('error', err));
    return result.pipe((0, stats_1.createStatsStream)(path_1.default.basename(extensionPath)));
}
const userAgent = 'VSCode Build';
const baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': userAgent,
    'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};
function fromMarketplace(serviceUrl, { name: extensionName, version, sha256, metadata }) {
    const json = require('gulp-json-editor');
    const [publisher, name] = extensionName.split('.');
    const url = `${serviceUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
    (0, fancy_log_1.default)('Downloading extension:', ansi_colors_1.default.yellow(`${extensionName}@${version}`), '...');
    const packageJsonFilter = (0, gulp_filter_1.default)('package.json', { restore: true });
    return (0, fetch_1.fetchUrls)('', {
        base: url,
        nodeFetchOptions: {
            headers: baseHeaders
        },
        checksumSha256: sha256
    })
        .pipe(vzip.src())
        .pipe((0, gulp_filter_1.default)('extension/**'))
        .pipe((0, gulp_rename_1.default)(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
function fromVsix(vsixPath, { name: extensionName, version, sha256, metadata }) {
    const json = require('gulp-json-editor');
    (0, fancy_log_1.default)('Using local VSIX for extension:', ansi_colors_1.default.yellow(`${extensionName}@${version}`), '...');
    const packageJsonFilter = (0, gulp_filter_1.default)('package.json', { restore: true });
    return gulp_1.default.src(vsixPath)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(event_stream_1.default.mapSync((f) => {
        const hash = crypto_1.default.createHash('sha256');
        hash.update(f.contents);
        const checksum = hash.digest('hex');
        if (checksum !== sha256) {
            throw new Error(`Checksum mismatch for ${vsixPath} (expected ${sha256}, actual ${checksum}))`);
        }
        return f;
    }))
        .pipe(vzip.src())
        .pipe((0, gulp_filter_1.default)('extension/**'))
        .pipe((0, gulp_rename_1.default)(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
function fromGithub({ name, version, repo, sha256, metadata }) {
    const json = require('gulp-json-editor');
    (0, fancy_log_1.default)('Downloading extension from GH:', ansi_colors_1.default.yellow(`${name}@${version}`), '...');
    const packageJsonFilter = (0, gulp_filter_1.default)('package.json', { restore: true });
    return (0, fetch_1.fetchGithub)(new URL(repo).pathname, {
        version,
        name: name => name.endsWith('.vsix'),
        checksumSha256: sha256
    })
        .pipe((0, gulp_buffer_1.default)())
        .pipe(vzip.src())
        .pipe((0, gulp_filter_1.default)('extension/**'))
        .pipe((0, gulp_rename_1.default)(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe((0, gulp_buffer_1.default)())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
/**
 * All extensions that are known to have some native component and thus must be built on the
 * platform that is being built.
 */
const nativeExtensions = [
    'microsoft-authentication',
];
const excludedExtensions = [
    'vscode-api-tests',
    'vscode-colorize-tests',
    'vscode-colorize-perf-tests',
    'vscode-test-resolver',
    'ms-vscode.node-debug',
    'ms-vscode.node-debug2',
];
const marketplaceWebExtensionsExclude = new Set([
    'ms-vscode.node-debug',
    'ms-vscode.node-debug2',
    'ms-vscode.js-debug-companion',
    'ms-vscode.js-debug',
    'ms-vscode.vscode-js-profile-table'
]);
const productJson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productJson.builtInExtensions || [];
const webBuiltInExtensions = productJson.webBuiltInExtensions || [];
/**
 * Loosely based on `getExtensionKind` from `src/vs/workbench/services/extensions/common/extensionManifestPropertiesService.ts`
 */
function isWebExtension(manifest) {
    if (Boolean(manifest.browser)) {
        return true;
    }
    if (Boolean(manifest.main)) {
        return false;
    }
    // neither browser nor main
    if (typeof manifest.extensionKind !== 'undefined') {
        const extensionKind = Array.isArray(manifest.extensionKind) ? manifest.extensionKind : [manifest.extensionKind];
        if (extensionKind.indexOf('web') >= 0) {
            return true;
        }
    }
    if (typeof manifest.contributes !== 'undefined') {
        for (const id of ['debuggers', 'terminal', 'typescriptServerPlugins']) {
            if (manifest.contributes.hasOwnProperty(id)) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Package local extensions that are known to not have native dependencies. Mutually exclusive to {@link packageNativeLocalExtensionsStream}.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
function packageNonNativeLocalExtensionsStream(forWeb, disableMangle) {
    return doPackageLocalExtensionsStream(forWeb, disableMangle, false);
}
/**
 * Package local extensions that are known to have native dependencies. Mutually exclusive to {@link packageNonNativeLocalExtensionsStream}.
 * @note it's possible that the extension does not have native dependencies for the current platform, especially if building for the web,
 * but we simplify the logic here by having a flat list of extensions (See {@link nativeExtensions}) that are known to have native
 * dependencies on some platform and thus should be packaged on the platform that they are building for.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
function packageNativeLocalExtensionsStream(forWeb, disableMangle) {
    return doPackageLocalExtensionsStream(forWeb, disableMangle, true);
}
/**
 * Package all the local extensions... both those that are known to have native dependencies and those that are not.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
function packageAllLocalExtensionsStream(forWeb, disableMangle) {
    return event_stream_1.default.merge([
        packageNonNativeLocalExtensionsStream(forWeb, disableMangle),
        packageNativeLocalExtensionsStream(forWeb, disableMangle)
    ]);
}
/**
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @param native build the extensions that are marked as having native dependencies
 */
function doPackageLocalExtensionsStream(forWeb, disableMangle, native) {
    const nativeExtensionsSet = new Set(nativeExtensions);
    const localExtensionsDescriptions = (glob_1.default.sync('extensions/*/package.json')
        .map(manifestPath => {
        const absoluteManifestPath = path_1.default.join(root, manifestPath);
        const extensionPath = path_1.default.dirname(path_1.default.join(root, manifestPath));
        const extensionName = path_1.default.basename(extensionPath);
        return { name: extensionName, path: extensionPath, manifestPath: absoluteManifestPath };
    })
        .filter(({ name }) => native ? nativeExtensionsSet.has(name) : !nativeExtensionsSet.has(name))
        .filter(({ name }) => excludedExtensions.indexOf(name) === -1)
        .filter(({ name }) => builtInExtensions.every(b => b.name !== name))
        .filter(({ manifestPath }) => (forWeb ? isWebExtension(require(manifestPath)) : true)));
    const localExtensionsStream = minifyExtensionResources(event_stream_1.default.merge(...localExtensionsDescriptions.map(extension => {
        return fromLocal(extension.path, forWeb, disableMangle)
            .pipe((0, gulp_rename_1.default)(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
    })));
    let result;
    if (forWeb) {
        result = localExtensionsStream;
    }
    else {
        // also include shared production node modules
        const productionDependencies = (0, dependencies_1.getProductionDependencies)('extensions/');
        const dependenciesSrc = productionDependencies.map(d => path_1.default.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat();
        result = event_stream_1.default.merge(localExtensionsStream, gulp_1.default.src(dependenciesSrc, { base: '.' })
            .pipe(util2.cleanNodeModules(path_1.default.join(root, 'build', '.moduleignore')))
            .pipe(util2.cleanNodeModules(path_1.default.join(root, 'build', `.moduleignore.${process.platform}`))));
    }
    return (result
        .pipe(util2.setExecutableBit(['**/*.sh'])));
}
function packageMarketplaceExtensionsStream(forWeb) {
    const marketplaceExtensionsDescriptions = [
        ...builtInExtensions.filter(({ name }) => (forWeb ? !marketplaceWebExtensionsExclude.has(name) : true)),
        ...(forWeb ? webBuiltInExtensions : [])
    ];
    const marketplaceExtensionsStream = minifyExtensionResources(event_stream_1.default.merge(...marketplaceExtensionsDescriptions
        .map(extension => {
        const src = (0, builtInExtensions_1.getExtensionStream)(extension).pipe((0, gulp_rename_1.default)(p => p.dirname = `extensions/${p.dirname}`));
        return updateExtensionPackageJSON(src, (data) => {
            delete data.scripts;
            delete data.dependencies;
            delete data.devDependencies;
            return data;
        });
    })));
    return (marketplaceExtensionsStream
        .pipe(util2.setExecutableBit(['**/*.sh'])));
}
function scanBuiltinExtensions(extensionsRoot, exclude = []) {
    const scannedExtensions = [];
    try {
        const extensionsFolders = fs_1.default.readdirSync(extensionsRoot);
        for (const extensionFolder of extensionsFolders) {
            if (exclude.indexOf(extensionFolder) >= 0) {
                continue;
            }
            const packageJSONPath = path_1.default.join(extensionsRoot, extensionFolder, 'package.json');
            if (!fs_1.default.existsSync(packageJSONPath)) {
                continue;
            }
            const packageJSON = JSON.parse(fs_1.default.readFileSync(packageJSONPath).toString('utf8'));
            if (!isWebExtension(packageJSON)) {
                continue;
            }
            const children = fs_1.default.readdirSync(path_1.default.join(extensionsRoot, extensionFolder));
            const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
            const packageNLS = packageNLSPath ? JSON.parse(fs_1.default.readFileSync(path_1.default.join(extensionsRoot, extensionFolder, packageNLSPath)).toString()) : undefined;
            const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
            const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
            scannedExtensions.push({
                extensionPath: extensionFolder,
                packageJSON,
                packageNLS,
                readmePath: readme ? path_1.default.join(extensionFolder, readme) : undefined,
                changelogPath: changelog ? path_1.default.join(extensionFolder, changelog) : undefined,
            });
        }
        return scannedExtensions;
    }
    catch (ex) {
        return scannedExtensions;
    }
}
function translatePackageJSON(packageJSON, packageNLSPath) {
    const CharCode_PC = '%'.charCodeAt(0);
    const packageNls = JSON.parse(fs_1.default.readFileSync(packageNLSPath).toString());
    const translate = (obj) => {
        for (const key in obj) {
            const val = obj[key];
            if (Array.isArray(val)) {
                val.forEach(translate);
            }
            else if (val && typeof val === 'object') {
                translate(val);
            }
            else if (typeof val === 'string' && val.charCodeAt(0) === CharCode_PC && val.charCodeAt(val.length - 1) === CharCode_PC) {
                const translated = packageNls[val.substr(1, val.length - 2)];
                if (translated) {
                    obj[key] = typeof translated === 'string' ? translated : (typeof translated.message === 'string' ? translated.message : val);
                }
            }
        }
    };
    translate(packageJSON);
    return packageJSON;
}
const extensionsPath = path_1.default.join(root, 'extensions');
// Additional projects to run esbuild on. These typically build code for webviews
const esbuildMediaScripts = [
    'markdown-language-features/esbuild-notebook.js',
    'markdown-language-features/esbuild-preview.js',
    'markdown-math/esbuild.js',
    'notebook-renderers/esbuild.js',
    'ipynb/esbuild.js',
    'simple-browser/esbuild-preview.js',
];
async function webpackExtensions(taskName, isWatch, webpackConfigLocations) {
    const webpack = require('webpack');
    const webpackConfigs = [];
    for (const { configPath, outputRoot } of webpackConfigLocations) {
        const configOrFnOrArray = require(configPath);
        function addConfig(configOrFnOrArray) {
            for (const configOrFn of Array.isArray(configOrFnOrArray) ? configOrFnOrArray : [configOrFnOrArray]) {
                const config = typeof configOrFn === 'function' ? configOrFn({}, {}) : configOrFn;
                if (outputRoot) {
                    config.output.path = path_1.default.join(outputRoot, path_1.default.relative(path_1.default.dirname(configPath), config.output.path));
                }
                webpackConfigs.push(config);
            }
        }
        addConfig(configOrFnOrArray);
    }
    function reporter(fullStats) {
        if (Array.isArray(fullStats.children)) {
            for (const stats of fullStats.children) {
                const outputPath = stats.outputPath;
                if (outputPath) {
                    const relativePath = path_1.default.relative(extensionsPath, outputPath).replace(/\\/g, '/');
                    const match = relativePath.match(/[^\/]+(\/server|\/client)?/);
                    (0, fancy_log_1.default)(`Finished ${ansi_colors_1.default.green(taskName)} ${ansi_colors_1.default.cyan(match[0])} with ${stats.errors.length} errors.`);
                }
                if (Array.isArray(stats.errors)) {
                    stats.errors.forEach((error) => {
                        fancy_log_1.default.error(error);
                    });
                }
                if (Array.isArray(stats.warnings)) {
                    stats.warnings.forEach((warning) => {
                        fancy_log_1.default.warn(warning);
                    });
                }
            }
        }
    }
    return new Promise((resolve, reject) => {
        if (isWatch) {
            webpack(webpackConfigs).watch({}, (err, stats) => {
                if (err) {
                    reject();
                }
                else {
                    reporter(stats?.toJson());
                }
            });
        }
        else {
            webpack(webpackConfigs).run((err, stats) => {
                if (err) {
                    fancy_log_1.default.error(err);
                    reject();
                }
                else {
                    reporter(stats?.toJson());
                    resolve();
                }
            });
        }
    });
}
async function esbuildExtensions(taskName, isWatch, scripts) {
    function reporter(stdError, script) {
        const matches = (stdError || '').match(/\> (.+): error: (.+)?/g);
        (0, fancy_log_1.default)(`Finished ${ansi_colors_1.default.green(taskName)} ${script} with ${matches ? matches.length : 0} errors.`);
        for (const match of matches || []) {
            fancy_log_1.default.error(match);
        }
    }
    const tasks = scripts.map(({ script, outputRoot }) => {
        return new Promise((resolve, reject) => {
            const args = [script];
            if (isWatch) {
                args.push('--watch');
            }
            if (outputRoot) {
                args.push('--outputRoot', outputRoot);
            }
            const proc = child_process_1.default.execFile(process.argv[0], args, {}, (error, _stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                reporter(stderr, script);
                return resolve();
            });
            proc.stdout.on('data', (data) => {
                (0, fancy_log_1.default)(`${ansi_colors_1.default.green(taskName)}: ${data.toString('utf8')}`);
            });
        });
    });
    return Promise.all(tasks);
}
async function buildExtensionMedia(isWatch, outputRoot) {
    return esbuildExtensions('esbuilding extension media', isWatch, esbuildMediaScripts.map(p => ({
        script: path_1.default.join(extensionsPath, p),
        outputRoot: outputRoot ? path_1.default.join(root, outputRoot, path_1.default.dirname(p)) : undefined
    })));
}
//# sourceMappingURL=extensions.js.map