"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
const codesign_1 = require("../common/codesign");
const publish_1 = require("../common/publish");
async function main() {
    (0, zx_1.usePwsh)();
    const arch = (0, publish_1.e)('VSCODE_ARCH');
    const esrpCliDLLPath = (0, publish_1.e)('EsrpCliDllPath');
    const codeSigningFolderPath = (0, publish_1.e)('CodeSigningFolderPath');
    // Start the code sign processes in parallel
    // 1. Codesign executables and shared libraries
    // 2. Codesign Powershell scripts
    // 3. Codesign context menu appx package (insiders only)
    const codesignTask1 = (0, codesign_1.spawnCodesignProcess)(esrpCliDLLPath, 'sign-windows', codeSigningFolderPath, '*.dll,*.exe,*.node');
    const codesignTask2 = (0, codesign_1.spawnCodesignProcess)(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.ps1');
    const codesignTask3 = process.env['VSCODE_QUALITY'] === 'insider'
        ? (0, codesign_1.spawnCodesignProcess)(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.appx')
        : undefined;
    // Codesign executables and shared libraries
    (0, codesign_1.printBanner)('Codesign executables and shared libraries');
    await (0, codesign_1.streamProcessOutputAndCheckResult)('Codesign executables and shared libraries', codesignTask1);
    // Codesign Powershell scripts
    (0, codesign_1.printBanner)('Codesign Powershell scripts');
    await (0, codesign_1.streamProcessOutputAndCheckResult)('Codesign Powershell scripts', codesignTask2);
    if (codesignTask3) {
        // Codesign context menu appx package
        (0, codesign_1.printBanner)('Codesign context menu appx package');
        await (0, codesign_1.streamProcessOutputAndCheckResult)('Codesign context menu appx package', codesignTask3);
    }
    // Create build artifact directory
    await (0, zx_1.$) `New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
    // Package client
    if (process.env['BUILT_CLIENT']) {
        // Product version
        const version = await (0, zx_1.$) `node -p "require('../VSCode-win32-${arch}/resources/app/package.json').version"`;
        (0, codesign_1.printBanner)('Package client');
        const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${clientArchivePath} ../VSCode-win32-${arch}/* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${clientArchivePath}`.pipe(process.stdout);
    }
    // Package server
    if (process.env['BUILT_SERVER']) {
        (0, codesign_1.printBanner)('Package server');
        const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${serverArchivePath} ../vscode-server-win32-${arch}`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${serverArchivePath}`.pipe(process.stdout);
    }
    // Package server (web)
    if (process.env['BUILT_WEB']) {
        (0, codesign_1.printBanner)('Package server (web)');
        const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${webArchivePath} ../vscode-server-win32-${arch}-web`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${webArchivePath}`.pipe(process.stdout);
    }
    // Sign setup
    if (process.env['BUILT_CLIENT']) {
        (0, codesign_1.printBanner)('Sign setup packages (system, user)');
        const task = (0, zx_1.$) `npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`;
        await (0, codesign_1.streamProcessOutputAndCheckResult)('Sign setup packages (system, user)', task);
    }
}
main().then(() => {
    process.exit(0);
}, err => {
    console.error(`ERROR: ${err}`);
    process.exit(1);
});
//# sourceMappingURL=codesign.js.map