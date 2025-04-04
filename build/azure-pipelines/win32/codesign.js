"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
async function main() {
    (0, zx_1.usePwsh)();
    console.log(`
###################################################################
#                                                                 #
#                         CODE SIGNING                            #
#                                                                 #
###################################################################
`);
    const arch = process.env['VSCODE_ARCH'];
    const esrpCliDLLPath = process.env['EsrpCliDllPath'];
    const codesigningFolderPath = process.env['CodeSigningFolderPath'];
    console.log(`
###################################################################
#                                                                 #
#          Codesign executables and shared libraries              #
#                                                                 #
###################################################################
`);
    await (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows ${codesigningFolderPath} '*.dll,*.exe,*.node'`.pipe(process.stdout);
    console.log(`
###################################################################
#                                                                 #
#                 Codesign Powershell scripts                     #
#                                                                 #
###################################################################
`);
    await (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-appx ${codesigningFolderPath} '*.ps1'`.pipe(process.stdout);
    if (process.env['VSCODE_QUALITY'] !== 'insider') {
        console.log(`
###################################################################
#                                                                 #
#              Codesign context menu appx package                 #
#                                                                 #
###################################################################
`);
        await (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-appx ${codesigningFolderPath} '*.appx'`.pipe(process.stdout);
    }
    const packageJson = await (0, zx_1.$) `Get-Content -Raw -Path ..\VSCode-win32-$(VSCODE_ARCH)\resources\app\package.json`.json();
    const version = packageJson.version;
    // Client
    console.log(`
###################################################################
#                                                                 #
#                       Package client                            #
#                                                                 #
###################################################################
`);
    const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;
    await (0, zx_1.$) `New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
    await (0, zx_1.$) `7z.exe a -tzip ${clientArchivePath} ..\VSCode-win32-${arch}\* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
    await (0, zx_1.$) `7z.exe l ${clientArchivePath}`.pipe(process.stdout);
    // Server
    console.log(`
###################################################################
#                                                                 #
#                       Package server                            #
#                                                                 #
###################################################################
`);
    const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
    await (0, zx_1.$) `New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
    await (0, zx_1.$) `7z.exe a -tzip ${serverArchivePath} ..\vscode-server-win32-${arch}`.pipe(process.stdout);
    await (0, zx_1.$) `7z.exe l ${serverArchivePath}`.pipe(process.stdout);
    // Web
    console.log(`
###################################################################
#                                                                 #
#                     Package server (web)                        #
#                                                                 #
###################################################################
`);
    const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
    await (0, zx_1.$) `New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
    await (0, zx_1.$) `7z.exe a -tzip ${webArchivePath} ..\vscode-server-win32-${arch}-web`.pipe(process.stdout);
    await (0, zx_1.$) `7z.exe l ${webArchivePath}`.pipe(process.stdout);
    // Sign setup
    console.log(`
###################################################################
#                                                                 #
#             Codesign setup packages (system, user)              #
#                                                                 #
###################################################################
`);
    await (0, zx_1.$) `npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`.pipe(process.stdout);
}
main();
//# sourceMappingURL=codesign.js.map