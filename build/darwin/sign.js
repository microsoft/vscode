"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const codesign = require("electron-osx-sign");
const path = require("path");
const util = require("../lib/util");
const product = require("../../product.json");
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
async function main() {
    const buildDir = process.env['AGENT_BUILDDIRECTORY'];
    const tempDir = process.env['AGENT_TEMPDIRECTORY'];
    const arch = process.env['VSCODE_ARCH'];
    if (!buildDir) {
        throw new Error('$AGENT_BUILDDIRECTORY not set');
    }
    if (!tempDir) {
        throw new Error('$AGENT_TEMPDIRECTORY not set');
    }
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
        version: util.getElectronVersion(),
        identity: '99FM488X57',
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
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyw4Q0FBOEM7QUFDOUMsNkJBQTZCO0FBQzdCLG9DQUFvQztBQUNwQyw4Q0FBOEM7QUFDOUMscUVBQW9EO0FBRXBELEtBQUssVUFBVSxJQUFJO0lBQ2xCLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUNyRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDbkQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUV4QyxJQUFJLENBQUMsUUFBUSxFQUFFO1FBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0tBQ2pEO0lBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRTtRQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztLQUNoRDtJQUVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLElBQUksRUFBRSxDQUFDLENBQUM7SUFDN0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUM7SUFDMUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQy9FLE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztJQUM1QyxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO0lBQ2pFLE1BQU0scUJBQXFCLEdBQUcsaUJB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