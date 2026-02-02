"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuiltInExtensions = exports.getExtensionStream = void 0;
const fs = require("fs");
const path = require("path");
const os = require("os");
const rimraf = require("rimraf");
const es = require("event-stream");
const rename = require("gulp-rename");
const vfs = require("vinyl-fs");
const ext = require("./extensions");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const mkdirp = require('mkdirp');
const root = path.dirname(path.dirname(__dirname));
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions || [];
const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');
const ENABLE_LOGGING = !process.env['VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE'];
function log(...messages) {
    if (ENABLE_LOGGING) {
        fancyLog(...messages);
    }
}
function getExtensionPath(extension) {
    return path.join(root, '.build', 'builtInExtensions', extension.name);
}
function isUpToDate(extension) {
    const packagePath = path.join(getExtensionPath(extension), 'package.json');
    if (!fs.existsSync(packagePath)) {
        return false;
    }
    const packageContents = fs.readFileSync(packagePath, { encoding: 'utf8' });
    try {
        const diskVersion = JSON.parse(packageContents).version;
        return (diskVersion === extension.version);
    }
    catch (err) {
        return false;
    }
}
function getExtensionDownloadStream(extension) {
    const galleryServiceUrl = productjson.extensionsGallery?.serviceUrl;
    return (galleryServiceUrl ? ext.fromMarketplace(galleryServiceUrl, extension) : ext.fromGithub(extension))
        .pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
}
function getExtensionStream(extension) {
    // if the extension exists on disk, use those files instead of downloading anew
    if (isUpToDate(extension)) {
        log('[extensions]', `${extension.name}@${extension.version} up to date`, ansiColors.green('✔︎'));
        return vfs.src(['**'], { cwd: getExtensionPath(extension), dot: true })
            .pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
    }
    return getExtensionDownloadStream(extension);
}
exports.getExtensionStream = getExtensionStream;
function syncMarketplaceExtension(extension) {
    const galleryServiceUrl = productjson.extensionsGallery?.serviceUrl;
    const source = ansiColors.blue(galleryServiceUrl ? '[marketplace]' : '[github]');
    if (isUpToDate(extension)) {
        log(source, `${extension.name}@${extension.version}`, ansiColors.green('✔︎'));
        return es.readArray([]);
    }
    rimraf.sync(getExtensionPath(extension));
    return getExtensionDownloadStream(extension)
        .pipe(vfs.dest('.build/builtInExtensions'))
        .on('end', () => log(source, extension.name, ansiColors.green('✔︎')));
}
function syncExtension(extension, controlState) {
    if (extension.platforms) {
        const platforms = new Set(extension.platforms);
        if (!platforms.has(process.platform)) {
            log(ansiColors.gray('[skip]'), `${extension.name}@${extension.version}: Platform '${process.platform}' not supported: [${extension.platforms}]`, ansiColors.green('✔︎'));
            return es.readArray([]);
        }
    }
    switch (controlState) {
        case 'disabled':
            log(ansiColors.blue('[disabled]'), ansiColors.gray(extension.name));
            return es.readArray([]);
        case 'marketplace':
            return syncMarketplaceExtension(extension);
        default:
            if (!fs.existsSync(controlState)) {
                log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but that path does not exist.`));
                return es.readArray([]);
            }
            else if (!fs.existsSync(path.join(controlState, 'package.json'))) {
                log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but there is no 'package.json' file in that directory.`));
                return es.readArray([]);
            }
            log(ansiColors.blue('[local]'), `${extension.name}: ${ansiColors.cyan(controlState)}`, ansiColors.green('✔︎'));
            return es.readArray([]);
    }
}
function readControlFile() {
    try {
        return JSON.parse(fs.readFileSync(controlFilePath, 'utf8'));
    }
    catch (err) {
        return {};
    }
}
function writeControlFile(control) {
    mkdirp.sync(path.dirname(controlFilePath));
    fs.writeFileSync(controlFilePath, JSON.stringify(control, null, 2));
}
function getBuiltInExtensions() {
    log('Synchronizing built-in extensions...');
    log(`You can manage built-in extensions with the ${ansiColors.cyan('--builtin')} flag`);
    const control = readControlFile();
    const streams = [];
    for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
        const controlState = control[extension.name] || 'marketplace';
        control[extension.name] = controlState;
        streams.push(syncExtension(extension, controlState));
    }
    writeControlFile(control);
    return new Promise((resolve, reject) => {
        es.merge(streams)
            .on('error', reject)
            .on('end', resolve);
    });
}
exports.getBuiltInExtensions = getBuiltInExtensions;
if (require.main === module) {
    getBuiltInExtensions().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbHRJbkV4dGVuc2lvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJidWlsdEluRXh0ZW5zaW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QixpQ0FBaUM7QUFDakMsbUNBQW1DO0FBQ25DLHNDQUFzQztBQUN0QyxnQ0FBZ0M7QUFDaEMsb0NBQW9DO0FBQ3BDLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFHMUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBb0JqQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNuRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3BHLE1BQU0saUJBQWlCLEdBQTJCLFdBQVcsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUM7QUFDdEYsTUFBTSxvQkFBb0IsR0FBMkIsV0FBVyxDQUFDLG9CQUFvQixJQUFJLEVBQUUsQ0FBQztBQUM1RixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDakcsTUFBTSxjQUFjLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7QUFFdEYsU0FBUyxHQUFHLENBQUMsR0FBRyxRQUFrQjtJQUNqQyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3BCLFFBQVEsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZCLENB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