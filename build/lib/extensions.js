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
const builtInExtensions_1 = require("./builtInExtensions");
const getVersion_1 = require("./getVersion");
const fetch_1 = require("./fetch");
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
function fromLocal(extensionPath, forWeb, disableMangle) {
    const webpackConfigFileName = forWeb ? 'extension-browser.webpack.config.js' : 'extension.webpack.config.js';
    const isWebPacked = fs.existsSync(path.join(extensionPath, webpackConfigFileName));
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
    const vsce = require('@vscode/vsce');
    const result = es.through();
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
function fromMarketplace(serviceUrl, { name: extensionName, version, sha256, metadata }) {
    const json = require('gulp-json-editor');
    const [publisher, name] = extensionName.split('.');
    const url = `${serviceUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
    fancyLog('Downloading extension:', ansiColors.yellow(`${extensionName}@${version}`), '...');
    const packageJsonFilter = filter('package.json', { restore: true });
    return (0, fetch_1.fetchUrls)('', {
        base: url,
        nodeFetchOptions: {
            headers: baseHeaders
        },
        checksumSha256: sha256
    })
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromMarketplace = fromMarketplace;
function fromGithub({ name, version, repo, sha256, metadata }) {
    const json = require('gulp-json-editor');
    fancyLog('Downloading extension from GH:', ansiColors.yellow(`${name}@${version}`), '...');
    const packageJsonFilter = filter('package.json', { restore: true });
    return (0, fetch_1.fetchGithub)(new URL(repo).pathname, {
        version,
        name: name => name.endsWith('.vsix'),
        checksumSha256: sha256
    })
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
function packageLocalExtensionsStream(forWeb, disableMangle) {
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
        return fromLocal(extension.path, forWeb, disableMangle)
            .pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
    })));
    let result;
    if (forWeb) {
        result = localExtensionsStream;
    }
    else {
        // also include shared production node modules
        const productionDependencies = (0, dependencies_1.getProductionDependencies)('extensions/');
        const dependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat();
        result = es.merge(localExtensionsStream, gulp.src(dependenciesSrc, { base: '.' })
            .pipe(util2.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
            .pipe(util2.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`))));
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
            const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
            const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
            scannedExtensions.push({
                extensionPath: extensionFolder,
                packageJSON,
                packageNLS,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLHlCQUF5QjtBQUN6QixvQ0FBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFFN0IsOEJBQThCO0FBQzlCLG1DQUE0QztBQUM1QyxnQ0FBZ0M7QUFDaEMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDdkMsc0NBQXVDO0FBQ3ZDLHNDQUF1QztBQUN2QyxzQ0FBc0M7QUFDdEMsMENBQTBDO0FBQzFDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN0Qyw0Q0FBNEM7QUFFNUMsaURBQTJEO0FBQzNELDJEQUErRTtBQUMvRSw2Q0FBMEM7QUFDMUMsbUNBQWlEO0FBRWpELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUEsdUJBQVUsRUFBQyxJQUFJLENBQUMsQ0FBQztBQUNoQyxNQUFNLG9CQUFvQixHQUFHLG1EQUFtRCxNQUFNLEVBQUUsQ0FBQztBQUV6RixTQUFTLHdCQUF3QixDQUFDLEtBQWE7SUFDOUMsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLENBQUMsV0FBVyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNsRixPQUFPLEtBQUs7U0FDVixJQUFJLENBQUMsVUFBVSxDQUFDO1NBQ2hCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztTQUNkLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBTyxFQUFFLEVBQUU7UUFDNUIsTUFBTSxNQUFNLEdBQTZC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