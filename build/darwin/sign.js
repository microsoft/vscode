"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const codesign = require("electron-osx-sign");
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
const root = path.dirname(path.dirname(__dirname));
function getElectronVersion() {
    const yarnrc = fs.readFileSync(path.join(root, '.yarnrc'), 'utf8');
    const target = /^target "(.*)"$/m.exec(yarnrc)[1];
    return target;
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
    const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
    const baseDir = path.dirname(__dirname);
    const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
    const appName = product.nameLong + '.app';
    const appFrameworkPath = path.join(appRoot, appName, 'Contents', 'Frameworks');
    const helperAppBaseName = product.nameShort;
    const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
    const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';
    const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';
    const infoPlistPath = path.resolve(appRoot, appName, 'Contents', 'Info.plist');
    const defaultOpts = {
        app: path.join(appRoot, appName),
        platform: 'darwin',
        entitlements: path.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist'),
        'entitlements-inherit': path.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist'),
        hardenedRuntime: true,
        'pre-auto-entitlements': false,
        'pre-embed-provisioning-profile': false,
        keychain: path.join(tempDir, 'buildagent.keychain'),
        version: getElectronVersion(),
        identity,
        'gatekeeper-assess': false
    };
    const appOpts = {
        ...defaultOpts,
        // TODO(deepak1556): Incorrectly declared type in electron-osx-sign
        ignore: (filePath) => {
            return filePath.includes(gpuHelperAppName) ||
                filePath.includes(rendererHelperAppName) ||
                filePath.includes(pluginHelperAppName);
        }
    };
    const gpuHelperOpts = {
        ...defaultOpts,
        app: path.join(appFrameworkPath, gpuHelperAppName),
        entitlements: path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist'),
        'entitlements-inherit': path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist'),
    };
    const rendererHelperOpts = {
        ...defaultOpts,
        app: path.join(appFrameworkPath, rendererHelperAppName),
        entitlements: path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist'),
        'entitlements-inherit': path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist'),
    };
    const pluginHelperOpts = {
        ...defaultOpts,
        app: path.join(appFrameworkPath, pluginHelperAppName),
        entitlements: path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist'),
        'entitlements-inherit': path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist'),
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
    await codesign.signAsync(gpuHelperOpts);
    await codesign.signAsync(rendererHelperOpts);
    await codesign.signAsync(pluginHelperOpts);
    await codesign.signAsync(appOpts);
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLDhDQUE4QztBQUM5QyxxRUFBb0Q7QUFFcEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFFbkQsU0FBUyxrQkFBa0I7SUFDMUIsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNuRSxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsS0FBSyxVQUFVLElBQUksQ0FBQyxRQUFpQjtJQUNwQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDbkQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN4QyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFFbEQsSUFBSSxDQUFDLFFBQVEsRUFBRTtRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztLQUNqRDtJQUVELElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7S0FDaEQ7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVB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