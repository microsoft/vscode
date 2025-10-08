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
const child_process_1 = require("child_process");
//import { sign, SignOptions } from '@electron/osx-sign';
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
//import { get } from 'http';
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const baseDir = path_1.default.dirname(__dirname);
const product = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'product.json'), 'utf8'));
const helperAppBaseName = product.nameShort;
const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';
const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';
/*function getElectronVersion(): string {
    const npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8');
    const target = /^target="(.*)"$/m.exec(npmrc)![1];
    return target;
}*/
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
    //const identity = process.env['CODESIGN_IDENTITY'];
    if (!buildDir) {
        throw new Error('$AGENT_BUILDDIRECTORY not set');
    }
    if (!tempDir) {
        throw new Error('$AGENT_TEMPDIRECTORY not set');
    }
    const appRoot = path_1.default.join(buildDir, `VSCode-darwin-${arch}`);
    const appName = product.nameLong + '.app';
    //const infoPlistPath = path.resolve(appRoot, appName, 'Contents', 'Info.plist');
    const noticePath = path_1.default.resolve(appRoot, appName, 'Contents', 'Resources', 'app', 'ThirdPartyNotices.txt');
    /*const appOpts: SignOptions = {
        app: path.join(appRoot, appName),
        platform: 'darwin',
        optionsForFile: (filePath) => ({
            entitlements: getEntitlementsForFile(filePath),
            hardenedRuntime: true,
        }),
        preAutoEntitlements: false,
        preEmbedProvisioningProfile: false,
        keychain: path.join(tempDir, 'buildagent.keychain'),
        version: getElectronVersion(),
        identity,
    };

    // Only overwrite plist entries for x64 and arm64 builds,
    // universal will get its copy from the x64 build.
    if (arch !== 'universal') {
        await spawn('plutil', [
            '-insert',
            'NSAppleEventsUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use AppleScript.',
            `${infoPlistPath}`
        ]);
        await spawn('plutil', [
            '-replace',
            'NSMicrophoneUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use the Microphone.',
            `${infoPlistPath}`
        ]);
        await spawn('plutil', [
            '-replace',
            'NSCameraUsageDescription',
            '-string',
            'An application in Visual Studio Code wants to use the Camera.',
            `${infoPlistPath}`
        ]);
    }

    await sign(appOpts);*/
    const command = 'codesign';
    const args = [
        '--sign', '531EE75612BAC8FB44C31CB20FEDA1335AB2E7C0',
        '--force',
        '--keychain',
        path_1.default.join(tempDir, 'buildagent.keychain'),
        '--timestamp',
        '--options', 'runtime',
        '--entitlements', getEntitlementsForFile(noticePath),
        noticePath
    ];
    let iteration = 0;
    let exitCode = 0;
    console.log('Starting codesign loop...');
    console.log('Command:', command, args.join(' '));
    do {
        iteration++;
        console.log(`--- Iteration ${iteration} ---`);
        // Spawn the process synchronously
        const result = (0, child_process_1.spawnSync)(command, args, {
            stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout and stderr for logging
            encoding: 'utf8'
        });
        exitCode = result.status || 0;
        if (result.error) {
            console.error('Error spawning process:', result.error.message);
            break;
        }
        console.log(`Process exited with code: ${exitCode}`);
        if (exitCode !== 0) {
            console.log(`Breaking loop due to non-zero exit code: ${exitCode}`);
            // Log stdout and stderr when process fails
            if (result.stdout && result.stdout.trim()) {
                console.log('\n--- STDOUT ---');
                console.log(result.stdout.trim());
            }
            if (result.stderr && result.stderr.trim()) {
                console.log('\n--- STDERR ---');
                console.log(result.stderr.trim());
            }
            break;
        }
        else {
            // For successful runs, still show stdout if there's any output
            if (result.stdout && result.stdout.trim()) {
                console.log('Output:', result.stdout.trim());
            }
        }
        console.log('Continuing to next iteration...\n');
    } while (exitCode === 0);
    console.log(`\nLoop completed after ${iteration} iterations.`);
    console.log(`Final exit code: ${exitCode}`);
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