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
    const identity = process.env['CODESIGN_IDENTITY'];
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
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyw4Q0FBOEM7QUFDOUMsNkJBQTZCO0FBQzdCLG9DQUFvQztBQUNwQyw4Q0FBOEM7QUFDOUMscUVBQW9EO0FBRXBELEtBQUssVUFBVSxJQUFJO0lBQ2xCLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUNyRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDbkQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN4QyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFFbEQsSUFBSSxDQUFDLFFBQVEsRUFBRTtRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztLQUNqRDtJQUVELElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7S0FDaEQ7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLGlCQUFpQixJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzdELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDO0lBQzFDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUMvRSxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7SUFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsR0FBRyxtQkFBbUIsQ0FBQztJQUNqRSxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQixHQUFHLHdCQUF3QixDQUFDO0lBQzNFLE1BQU0sbUJBQW1CLEdBQUcsaUJBQWlCLEdBQUcsc0JBQXNCLENBQUM7SUFDdkUsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUUvRSxNQUFNLFdBQVcsR0FBeUI7UUFDekMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztRQUNoQyxRQUFRLEVBQUUsUUFBUTtRQUNsQixZQUFZLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLHdCQUF3QixDQUFDO1FBQ3ZGLHNCQUFzQixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSx3QkFBd0IsQ0FBQztRQUNqRyxlQUFlLEVBQUUsSUFBSTtRQUNyQix1QkFBdUIsRUFBRSxLQUFLO1FBQzlCLGdDQUFnQyxFQUFFLEtBQUs7UUFDdkMsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLHFCQUFxQixDQUFDO1FBQ25ELE9BQU8sRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7UUFDbEMsUUFBUTtRQUNSLG1CQUFtQixFQUFFLEtBQUs7S0FDMUIsQ0FBQztJQUVGLE1BQU0sT0FBTyxHQUFHO1FBQ2YsR0FBRyxXQUFXO1FBQ2QsbUVBQW1FO1FBQ25FLE1BQU0sRUFBRSxDQUFDLFFBQWdCLEVBQUUsRUFBRTtZQUM1QixPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUM7Z0JBQ3hDLFFBQVEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUN6QyxDQUFDO0tBQ0QsQ0FBQztJQUVGLE1BQU0sYUFBYSxHQUF5QjtRQUMzQyxHQUFHLFdBQVc7UUFDZCxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQztRQUNsRCxZQUFZLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLCtCQUErQixDQUFDO1FBQzlGLHNCQUFzQixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSwrQkFBK0IsQ0FBQztLQUN4RyxDQUFDO0lBRUYsTUFBTSxrQkFBa0IsR0FBeUI7UUFDaEQsR0FBRyxXQUFXO1FBQ2QsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLENBQUM7UUFDdkQsWUFBWSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxvQ0FBb0MsQ0FBQztRQUNuRyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsb0NBQW9DLENBQUM7S0FDN0csQ0FBQztJQUVGLE1BQU0sZ0JBQWdCLEdBQXlCO1FBQzlDLEdBQUcsV0FBVztRQUNkLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLG1CQUFtQixDQUFDO1FBQ3JELFlBQVksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsa0NBQWtDLENBQUM7UUFDakcsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLGtDQUFrQyxDQUFDO0tBQzNHLENBQUM7SUFFRix5REFBeUQ7SUFDekQsa0RBQWtEO0lBQ2xELElBQUksSUFBSSxLQUFLLFdBQVcsRUFBRTtRQUN6QixNQUFNLElBQUEsMkJBQUssRUFBQyxRQUFRLEVBQUU7WUFDckIsU0FBUztZQUNULCtCQUErQjtZQUMvQixTQUFTO1lBQ1QsZ0VBQWdFO1lBQ2hFLEdBQUcsYUFBYSxFQUFFO1NBQ2xCLENBQUMsQ0FBQztRQUNILE1BQU0sSUFBQSwyQkFBSyxFQUFDLFFBQVEsRUFBRTtZQUNyQixVQUFVO1lBQ1YsOEJBQThCO1lBQzlCLFNBQVM7WUFDVCxtRUFBbUU7WUFDbkUsR0FBRyxhQUFhLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxJQUFBLDJCQUFLLEVBQUMsUUFBUSxFQUFFO1lBQ3JCLFVBQVU7WUFDViwwQkFBMEI7WUFDMUIsU0FBUztZQUNULCtEQUErRDtZQUMvRCxHQUFHLGFBQWEsRUFBRTtTQUNsQixDQUFDLENBQUM7S0FDSDtJQUVELE1BQU0sUUFBUSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN4QyxNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUM3QyxNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUMzQyxNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsT0FBYyxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDNUIsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2xCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztDQUNIIn0=