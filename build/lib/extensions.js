"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExtensionMedia = exports.webpackExtensions = exports.translatePackageJSON = exports.scanBuiltinExtensions = exports.packageMarketplaceExtensionsStream = exports.packageLocalExtensionsStream = exports.fromGithub = exports.fromMarketplace = void 0;
const es = require("event-stream");
const fs = require("fs");
const cp = require("child_process");
const glob = require("glob");
const gulp = require("gulp");
const path = require("path");
const through2 = require("through2");
const got_1 = require("got");
const File = require("vinyl");
const stats_1 = require("./stats");
const util2 = require("./util");
const vzip = require('gulp-vinyl-zip');
const filter = require("gulp-filter");
const rename = require("gulp-rename");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const buffer = require('gulp-buffer');
const jsoncParser = require("jsonc-parser");
const dependencies_1 = require("./dependencies");
const _ = require("underscore");
const builtInExtensions_1 = require("./builtInExtensions");
const getVersion_1 = require("./getVersion");
const root = path.dirname(path.dirname(__dirname));
const commit = (0, getVersion_1.getVersion)(root);
const sourceMappingURLBase = `https://ticino.blob.core.windows.net/sourcemaps/${commit}`;
function minifyExtensionResources(input) {
    const jsonFilter = filter(['**/*.json', '**/*.code-snippets'], { restore: true });
    return input
        .pipe(jsonFilter)
        .pipe(buffer())
        .pipe(es.mapSync((f) => {
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
    const packageJsonFilter = filter('extensions/*/package.json', { restore: true });
    return input
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(es.mapSync((f) => {
        const data = JSON.parse(f.contents.toString('utf8'));
        f.contents = Buffer.from(JSON.stringify(update(data)));
        return f;
    }))
        .pipe(packageJsonFilter.restore);
}
function fromLocal(extensionPath, forWeb) {
    const webpackConfigFileName = forWeb ? 'extension-browser.webpack.config.js' : 'extension.webpack.config.js';
    const isWebPacked = fs.existsSync(path.join(extensionPath, webpackConfigFileName));
    let input = isWebPacked
        ? fromLocalWebpack(extensionPath, webpackConfigFileName)
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
function fromLocalWebpack(extensionPath, webpackConfigFileName) {
    const result = es.through();
    const packagedDependencies = [];
    const packageJsonConfig = require(path.join(extensionPath, 'package.json'));
    if (packageJsonConfig.dependencies) {
        const webpackRootConfig = require(path.join(extensionPath, webpackConfigFileName));
        for (const key in webpackRootConfig.externals) {
            if (key in packageJsonConfig.dependencies) {
                packagedDependencies.push(key);
            }
        }
    }
    const vsce = require('vsce');
    const webpack = require('webpack');
    const webpackGulp = require('webpack-stream');
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn, packagedDependencies }).then(fileNames => {
        const files = fileNames
            .map(fileName => path.join(extensionPath, fileName))
            .map(filePath => new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }));
        // check for a webpack configuration files, then invoke webpack
        // and merge its output with the files stream.
        const webpackConfigLocations = glob.sync(path.join(extensionPath, '**', webpackConfigFileName), { ignore: ['**/node_modules'] });
        const webpackStreams = webpackConfigLocations.flatMap(webpackConfigPath => {
            const webpackDone = (err, stats) => {
                fancyLog(`Bundled extension: ${ansiColors.yellow(path.join(path.basename(extensionPath), path.relative(extensionPath, webpackConfigPath)))}...`);
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
                const relativeOutputPath = path.relative(extensionPath, webpackConfig.output.path);
                return webpackGulp(webpackConfig, webpack, webpackDone)
                    .pipe(es.through(function (data) {
                    data.stat = data.stat || {};
                    data.base = extensionPath;
                    this.emit('data', data);
                }))
                    .pipe(es.through(function (data) {
                    // source map handling:
                    // * rewrite sourceMappingURL
                    // * save to disk so that upload-task picks this up
                    const contents = data.contents.toString('utf8');
                    data.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, function (_m, g1) {
                        return `\n//# sourceMappingURL=${sourceMappingURLBase}/extensions/${path.basename(extensionPath)}/${relativeOutputPath}/${g1}`;
                    }), 'utf8');
                    this.emit('data', data);
                }));
            });
        });
        es.merge(...webpackStreams, es.readArray(files))
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
    return result.pipe((0, stats_1.createStatsStream)(path.basename(extensionPath)));
}
function fromLocalNormal(extensionPath) {
    const result = es.through();
    const vsce = require('vsce');
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn })
        .then(fileNames => {
        const files = fileNames
            .map(fileName => path.join(extensionPath, fileName))
            .map(filePath => new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }));
        es.readArray(files).pipe(result);
    })
        .catch(err => result.emit('error', err));
    return result.pipe((0, stats_1.createStatsStream)(path.basename(extensionPath)));
}
const userAgent = 'VSCode Build';
const baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': userAgent,
    'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};
function fromMarketplace(serviceUrl, { name: extensionName, version, metadata }) {
    const remote = require('gulp-remote-retry-src');
    const json = require('gulp-json-editor');
    const [publisher, name] = extensionName.split('.');
    const url = `${serviceUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
    fancyLog('Downloading extension:', ansiColors.yellow(`${extensionName}@${version}`), '...');
    const options = {
        base: url,
        requestOptions: {
            gzip: true,
            headers: baseHeaders
        }
    };
    const packageJsonFilter = filter('package.json', { restore: true });
    return remote('', options)
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromMarketplace = fromMarketplace;
const ghApiHeaders = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': userAgent,
};
if (process.env.GITHUB_TOKEN) {
    ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
    ...ghApiHeaders,
    Accept: 'application/octet-stream',
};
function fromGithub({ name, version, repo, metadata }) {
    const remote = require('gulp-remote-retry-src');
    const json = require('gulp-json-editor');
    fancyLog('Downloading extension from GH:', ansiColors.yellow(`${name}@${version}`), '...');
    const packageJsonFilter = filter('package.json', { restore: true });
    return remote([`/repos${new URL(repo).pathname}/releases/tags/v${version}`], {
        base: 'https://api.github.com',
        requestOptions: { headers: ghApiHeaders }
    }).pipe(through2.obj(function (file, _enc, callback) {
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => a.name.endsWith('.vsix'));
        if (!asset) {
            return callback(new Error(`Could not find vsix in release of ${repo} @ ${version}`));
        }
        const res = got_1.default.stream(asset.url, { headers: ghDownloadHeaders, followRedirect: true });
        file.contents = res.pipe(through2());
        callback(null, file);
    }))
        .pipe(buffer())
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromGithub = fromGithub;
const excludedExtensions = [
    'vscode-api-tests',
    'vscode-colorize-tests',
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
const productJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
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
function packageLocalExtensionsStream(forWeb) {
    const localExtensionsDescriptions = (glob.sync('extensions/*/package.json')
        .map(manifestPath => {
        const absoluteManifestPath = path.join(root, manifestPath);
        const extensionPath = path.dirname(path.join(root, manifestPath));
        const extensionName = path.basename(extensionPath);
        return { name: extensionName, path: extensionPath, manifestPath: absoluteManifestPath };
    })
        .filter(({ name }) => excludedExtensions.indexOf(name) === -1)
        .filter(({ name }) => builtInExtensions.every(b => b.name !== name))
        .filter(({ manifestPath }) => (forWeb ? isWebExtension(require(manifestPath)) : true)));
    const localExtensionsStream = minifyExtensionResources(es.merge(...localExtensionsDescriptions.map(extension => {
        return fromLocal(extension.path, forWeb)
            .pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
    })));
    let result;
    if (forWeb) {
        result = localExtensionsStream;
    }
    else {
        // also include shared production node modules
        const productionDependencies = (0, dependencies_1.getProductionDependencies)('extensions/');
        const dependenciesSrc = _.flatten(productionDependencies.map(d => path.relative(root, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]));
        result = es.merge(localExtensionsStream, gulp.src(dependenciesSrc, { base: '.' })
            .pipe(util2.cleanNodeModules(path.join(root, 'build', '.moduleignore'))));
    }
    return (result
        .pipe(util2.setExecutableBit(['**/*.sh'])));
}
exports.packageLocalExtensionsStream = packageLocalExtensionsStream;
function packageMarketplaceExtensionsStream(forWeb) {
    const marketplaceExtensionsDescriptions = [
        ...builtInExtensions.filter(({ name }) => (forWeb ? !marketplaceWebExtensionsExclude.has(name) : true)),
        ...(forWeb ? webBuiltInExtensions : [])
    ];
    const marketplaceExtensionsStream = minifyExtensionResources(es.merge(...marketplaceExtensionsDescriptions
        .map(extension => {
        const src = (0, builtInExtensions_1.getExtensionStream)(extension).pipe(rename(p => p.dirname = `extensions/${p.dirname}`));
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
exports.packageMarketplaceExtensionsStream = packageMarketplaceExtensionsStream;
function scanBuiltinExtensions(extensionsRoot, exclude = []) {
    const scannedExtensions = [];
    try {
        const extensionsFolders = fs.readdirSync(extensionsRoot);
        for (const extensionFolder of extensionsFolders) {
            if (exclude.indexOf(extensionFolder) >= 0) {
                continue;
            }
            const packageJSONPath = path.join(extensionsRoot, extensionFolder, 'package.json');
            if (!fs.existsSync(packageJSONPath)) {
                continue;
            }
            const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath).toString('utf8'));
            if (!isWebExtension(packageJSON)) {
                continue;
            }
            const children = fs.readdirSync(path.join(extensionsRoot, extensionFolder));
            const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
            const packageNLS = packageNLSPath ? JSON.parse(fs.readFileSync(path.join(extensionsRoot, extensionFolder, packageNLSPath)).toString()) : undefined;
            let browserNlsMetadataPath;
            if (packageJSON.browser) {
                const browserEntrypointFolderPath = path.join(extensionFolder, path.dirname(packageJSON.browser));
                if (fs.existsSync(path.join(extensionsRoot, browserEntrypointFolderPath, 'nls.metadata.json'))) {
                    browserNlsMetadataPath = path.join(browserEntrypointFolderPath, 'nls.metadata.json');
                }
            }
            const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
            const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
            scannedExtensions.push({
                extensionPath: extensionFolder,
                packageJSON,
                packageNLS,
                browserNlsMetadataPath,
                readmePath: readme ? path.join(extensionFolder, readme) : undefined,
                changelogPath: changelog ? path.join(extensionFolder, changelog) : undefined,
            });
        }
        return scannedExtensions;
    }
    catch (ex) {
        return scannedExtensions;
    }
}
exports.scanBuiltinExtensions = scanBuiltinExtensions;
function translatePackageJSON(packageJSON, packageNLSPath) {
    const CharCode_PC = '%'.charCodeAt(0);
    const packageNls = JSON.parse(fs.readFileSync(packageNLSPath).toString());
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
exports.translatePackageJSON = translatePackageJSON;
const extensionsPath = path.join(root, 'extensions');
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
                    config.output.path = path.join(outputRoot, path.relative(path.dirname(configPath), config.output.path));
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
                    const relativePath = path.relative(extensionsPath, outputPath).replace(/\\/g, '/');
                    const match = relativePath.match(/[^\/]+(\/server|\/client)?/);
                    fancyLog(`Finished ${ansiColors.green(taskName)} ${ansiColors.cyan(match[0])} with ${stats.errors.length} errors.`);
                }
                if (Array.isArray(stats.errors)) {
                    stats.errors.forEach((error) => {
                        fancyLog.error(error);
                    });
                }
                if (Array.isArray(stats.warnings)) {
                    stats.warnings.forEach((warning) => {
                        fancyLog.warn(warning);
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
                    fancyLog.error(err);
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
exports.webpackExtensions = webpackExtensions;
async function esbuildExtensions(taskName, isWatch, scripts) {
    function reporter(stdError, script) {
        const matches = (stdError || '').match(/\> (.+): error: (.+)?/g);
        fancyLog(`Finished ${ansiColors.green(taskName)} ${script} with ${matches ? matches.length : 0} errors.`);
        for (const match of matches || []) {
            fancyLog.error(match);
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
            const proc = cp.execFile(process.argv[0], args, {}, (error, _stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                reporter(stderr, script);
                if (stderr) {
                    return reject();
                }
                return resolve();
            });
            proc.stdout.on('data', (data) => {
                fancyLog(`${ansiColors.green(taskName)}: ${data.toString('utf8')}`);
            });
        });
    });
    return Promise.all(tasks);
}
async function buildExtensionMedia(isWatch, outputRoot) {
    return esbuildExtensions('esbuilding extension media', isWatch, esbuildMediaScripts.map(p => ({
        script: path.join(extensionsPath, p),
        outputRoot: outputRoot ? path.join(root, outputRoot, path.dirname(p)) : undefined
    })));
}
exports.buildExtensionMedia = buildExtensionMedia;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLHlCQUF5QjtBQUN6QixvQ0FBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFDN0IscUNBQXFDO0FBQ3JDLDZCQUFzQjtBQUV0Qiw4QkFBOEI7QUFDOUIsbUNBQTRDO0FBQzVDLGdDQUFnQztBQUNoQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxzQ0FBdUM7QUFDdkMsc0NBQXVDO0FBQ3ZDLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFDMUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3RDLDRDQUE0QztBQUU1QyxpREFBMkQ7QUFDM0QsZ0NBQWlDO0FBQ2pDLDJEQUF5RDtBQUN6RCw2Q0FBMEM7QUFFMUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbkQsTUFBTSxNQUFNLEdBQUcsSUFBQSx1QkFBVSxFQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hDLE1BQU0sb0JBQW9CLEdBQUcsbURBQW1ELE1BQU0sRUFBRSxDQUFDO0FBRXpGLFNBQVMsd0JBQXdCLENBQUMsS0FBYTtJQUM5QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsQ0FBQyxXQUFXLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ2xGLE9BQU8sS0FBSztTQUNWLElBQUksQ0FBQyxVQUFVLENBQUM7U0FDaEIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1NBQ2QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFPLEVBQUUs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