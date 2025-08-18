"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const osx_sign_1 = require("@electron/osx-sign");
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const baseDir = path_1.default.dirname(__dirname);
const product = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'product.json'), 'utf8'));
const helperAppBaseName = product.nameShort;
const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';
const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';
function getElectronVersion() {
    const npmrc = fs_1.default.readFileSync(path_1.default.join(root, '.npmrc'), 'utf8');
    const target = /^target="(.*)"$/m.exec(npmrc)[1];
    return target;
}
function getEntitlementsForFile(filePath) {
    if (filePath.includes(gpuHelperAppName)) {
        return path_1.default.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist');
    }
    else if (filePath.includes(rendererHelperAppName)) {
        return path_1.default.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist');
    }
    else if (filePath.includes(pluginHelperAppName)) {
        return path_1.default.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist');
    }
    return path_1.default.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist');
}
async function main(buildDir) {
    const tempDir = process.env['AGENT_TEMPDIRECTORY'];
    const arch = process.env['VSCODE_ARCH'];
    const identity = process.env['CODESIGN_IDENTITY'];
    if (!buildDir) {
        throw new Error('$AGENT_BUILDDIRECTORY not set');
    }
    if (!tempDir) {
        throw new Error('$AGENT_TEMPDIRECTORY not set');
    }
    const appRoot = path_1.default.join(buildDir, `VSCode-darwin-${arch}`);
    const appName = product.nameLong + '.app';
    const infoPlistPath = path_1.default.resolve(appRoot, appName, 'Contents', 'Info.plist');
    const appOpts = {
        app: path_1.default.join(appRoot, appName),
        platform: 'darwin',
        optionsForFile: (filePath) => ({
            entitlements: getEntitlementsForFile(filePath),
            hardenedRuntime: true,
        }),
        preAutoEntitlements: false,
        preEmbedProvisioningProfile: false,
        keychain: path_1.default.join(tempDir, 'buildagent.keychain'),
        version: getElectronVersion(),
        identity,
    };
    // Only overwrite plist entries for x64 and arm64 builds,
    // universal will get its copy from the x64 build.
    if (arch !== 'universal') {
        await (0, cross_spawn_promise_1.spawn)('plutil', [
            '-insert',
            'NSAppleEventsUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use AppleScript.',
            `${infoPlistPath}`
        ]);
        await (0, cross_spawn_promise_1.spawn)('plutil', [
            '-replace',
            'NSMicrophoneUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use the Microphone.',
            `${infoPlistPath}`
        ]);
        await (0, cross_spawn_promise_1.spawn)('plutil', [
            '-replace',
            'NSCameraUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use the Camera.',
            `${infoPlistPath}`
        ]);
    }
    await (0, osx_sign_1.sign)(appOpts);
}
if (require.main === module) {
    main(process.argv[2]).catch(async err => {
        console.error(err);
        const tempDir = process.env['AGENT_TEMPDIRECTORY'];
        if (tempDir) {
            const keychain = path_1.default.join(tempDir, 'buildagent.keychain');
            const identities = await (0, cross_spawn_promise_1.spawn)('security', ['find-identity', '-p', 'codesigning', '-v', keychain]);
            console.error(`Available identities:\n${identities}`);
            const dump = await (0, cross_spawn_promise_1.spawn)('security', ['dump-keychain', keychain]);
            console.error(`Keychain dump:\n${dump}`);
        }
        process.exit(1);
    });
}
//# sourceMappingURL=sign.js.map