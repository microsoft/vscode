"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
const codesign_js_1 = require("../common/codesign.js");
async function main() {
    (0, zx_1.usePwsh)();
    const arch = process.env['VSCODE_ARCH'];
    const esrpCliDLLPath = process.env['EsrpCliDllPath'];
    const codeSigningFolderPath = process.env['CodeSigningFolderPath'];
    const codesignTasks = [
        {
            title: 'Codesign executables and shared libraries',
            processPromise: (0, codesign_js_1.sign)(esrpCliDLLPath, 'sign-windows', codeSigningFolderPath, '*.dll,*.exe,*.node')
        },
        {
            title: 'Codesign Powershell scripts',
            processPromise: (0, codesign_js_1.sign)(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.ps1')
        }
    ];
    if (process.env['VSCODE_QUALITY'] === 'insider') {
        codesignTasks.push({
            title: 'Codesign context menu appx package',
            processPromise: (0, codesign_js_1.sign)(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.appx')
        });
    }
    // Wait for processes to finish and stream their output
    for (const { title, processPromise } of codesignTasks) {
        (0, codesign_js_1.printTitle)(title);
        await processPromise.pipe(process.stdout);
    }
    await (0, zx_1.$) `New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
    // Package client
    if (process.env['BUILT_CLIENT']) {
        // Product version
        const packageJson = await (0, zx_1.$) `Get-Content -Raw -Path ../VSCode-win32-${arch}/resources/app/package.json | ConvertFrom-Json`;
        const version = packageJson.version;
        (0, codesign_js_1.printTitle)('Package client');
        const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${clientArchivePath} ../VSCode-win32-${arch}/* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${clientArchivePath}`.pipe(process.stdout);
    }
    // Package server
    if (process.env['BUILT_SERVER']) {
        (0, codesign_js_1.printTitle)('Package server');
        const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${serverArchivePath} ../vscode-server-win32-${arch}`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${serverArchivePath}`.pipe(process.stdout);
    }
    // Package server (web)
    if (process.env['BUILT_WEB']) {
        (0, codesign_js_1.printTitle)('Package server (web)');
        const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
        await (0, zx_1.$) `7z.exe a -tzip ${webArchivePath} ../vscode-server-win32-${arch}-web`.pipe(process.stdout);
        await (0, zx_1.$) `7z.exe l ${webArchivePath}`.pipe(process.stdout);
    }
    // Sign setup
    if (process.env['BUILT_CLIENT']) {
        (0, codesign_js_1.printTitle)('Sign setup packages (system, user)');
        await (0, zx_1.$) `npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`.pipe(process.stdout);
    }
}
main();
//# sourceMappingURL=codesign.js.map