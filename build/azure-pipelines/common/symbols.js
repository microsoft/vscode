/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const fs_1 = require("fs");
const github = require("github-releases");
const path_1 = require("path");
const os_1 = require("os");
const util_1 = require("util");
const BASE_URL = 'https://rink.hockeyapp.net/api/2/';
const HOCKEY_APP_TOKEN_HEADER = 'X-HockeyAppToken';
var Platform;
(function (Platform) {
    Platform["WIN_32"] = "win32-ia32";
    Platform["WIN_64"] = "win32-x64";
    Platform["LINUX_64"] = "linux-x64";
    Platform["MAC_OS"] = "darwin-x64";
})(Platform || (Platform = {}));
function symbolsZipName(platform, electronVersion, insiders) {
    return `${insiders ? 'insiders' : 'stable'}-symbols-v${electronVersion}-${platform}.zip`;
}
const SEED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
async function tmpFile(name) {
    let res = '';
    for (let i = 0; i < 8; i++) {
        res += SEED.charAt(Math.floor(Math.random() * SEED.length));
    }
    const tmpParent = path_1.join(os_1.tmpdir(), res);
    await util_1.promisify(fs_1.mkdir)(tmpParent);
    return path_1.join(tmpParent, name);
}
function getVersions(accessor) {
    return asyncRequest({
        url: `${BASE_URL}/apps/${accessor.appId}/app_versions`,
        method: 'GET',
        headers: {
            [HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
        }
    });
}
function createVersion(accessor, version) {
    return asyncRequest({
        url: `${BASE_URL}/apps/${accessor.appId}/app_versions/new`,
        method: 'POST',
        headers: {
            [HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
        },
        formData: {
            bundle_version: version
        }
    });
}
function updateVersion(accessor, symbolsPath) {
    return asyncRequest({
        url: `${BASE_URL}/apps/${accessor.appId}/app_versions/${accessor.id}`,
        method: 'PUT',
        headers: {
            [HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
        },
        formData: {
            dsym: fs_1.createReadStream(symbolsPath)
        }
    });
}
function asyncRequest(options) {
    return new Promise((resolve, reject) => {
        request(options, (error, _response, body) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(JSON.parse(body));
            }
        });
    });
}
function downloadAsset(repository, assetName, targetPath, electronVersion) {
    return new Promise((resolve, reject) => {
        repository.getReleases({ tag_name: `v${electronVersion}` }, (err, releases) => {
            if (err) {
                reject(err);
            }
            else {
                const asset = releases[0].assets.filter((asset) => asset.name === assetName)[0];
                if (!asset) {
                    reject(new Error(`Asset with name ${assetName} not found`));
                }
                else {
                    repository.downloadAsset(asset, (err, reader) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            const writer = fs_1.createWriteStream(targetPath);
                            writer.on('error', reject);
                            writer.on('close', resolve);
                            reader.on('error', reject);
                            reader.pipe(writer);
                        }
                    });
                }
            }
        });
    });
}
async function ensureVersionAndSymbols(options) {
    // Check version does not exist
    console.log(`HockeyApp: checking for existing version ${options.versions.code} (${options.platform})`);
    const versions = await getVersions({ accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId });
    if (!Array.isArray(versions.app_versions)) {
        throw new Error(`Unexpected response: ${JSON.stringify(versions)}`);
    }
    if (versions.app_versions.some(v => v.version === options.versions.code)) {
        console.log(`HockeyApp: Returning without uploading symbols because version ${options.versions.code} (${options.platform}) was already found`);
        return;
    }
    // Download symbols for platform and electron version
    const symbolsName = symbolsZipName(options.platform, options.versions.electron, options.versions.insiders);
    const symbolsPath = await tmpFile('symbols.zip');
    console.log(`HockeyApp: downloading symbols ${symbolsName} for electron ${options.versions.electron} (${options.platform}) into ${symbolsPath}`);
    await downloadAsset(new github({ repo: options.repository, token: options.access.githubToken }), symbolsName, symbolsPath, options.versions.electron);
    // Create version
    console.log(`HockeyApp: creating new version ${options.versions.code} (${options.platform})`);
    const version = await createVersion({ accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId }, options.versions.code);
    // Upload symbols
    console.log(`HockeyApp: uploading symbols for version ${options.versions.code} (${options.platform})`);
    await updateVersion({ id: String(version.id), accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId }, symbolsPath);
    // Cleanup
    await util_1.promisify(fs_1.unlink)(symbolsPath);
}
// Environment
const pakage = require('../../../package.json');
const product = require('../../../product.json');
const repository = product.electronRepository;
const electronVersion = require('../../lib/electron').getElectronVersion();
const insiders = product.quality !== 'stable';
let codeVersion = pakage.version;
if (insiders) {
    codeVersion = `${codeVersion}-insider`;
}
const githubToken = process.argv[2];
const hockeyAppToken = process.argv[3];
const is64 = process.argv[4] === 'x64';
const hockeyAppId = process.argv[5];
if (process.argv.length !== 6) {
    throw new Error(`HockeyApp: Unexpected number of arguments. Got ${process.argv}`);
}
let platform;
if (process.platform === 'darwin') {
    platform = Platform.MAC_OS;
}
else if (process.platform === 'win32') {
    platform = is64 ? Platform.WIN_64 : Platform.WIN_32;
}
else {
    platform = Platform.LINUX_64;
}
// Create version and upload symbols in HockeyApp
if (repository && codeVersion && electronVersion && (product.quality === 'stable' || product.quality === 'insider')) {
    ensureVersionAndSymbols({
        repository,
        platform,
        versions: {
            code: codeVersion,
            insiders,
            electron: electronVersion
        },
        access: {
            githubToken,
            hockeyAppToken,
            hockeyAppId
        }
    }).then(() => {
        console.log('HockeyApp: done');
    }).catch(error => {
        console.error(`HockeyApp: error ${error} (AppID: ${hockeyAppId})`);
        return process.exit(1);
    });
}
else {
    console.log(`HockeyApp: skipping due to unexpected context (repository: ${repository}, codeVersion: ${codeVersion}, electronVersion: ${electronVersion}, quality: ${product.quality})`);
}
