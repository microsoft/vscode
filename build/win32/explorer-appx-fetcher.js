/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExplorerAppx = void 0;
const debug = require("debug");
const extract = require("extract-zip");
const fs = require("fs-extra");
const path = require("path");
const product = require("../../product.json");
const get_1 = require("@electron/get");
const d = debug('explorer-appx-fetcher');
async function downloadExplorerAppx(outDir, quality = 'stable', targetArch = 'x64') {
    const fileNamePrefix = quality === 'insider' ? 'code_insiders' : 'code';
    const fileName = `${fileNamePrefix}_explorer_${targetArch}.zip`;
    if (await fs.pathExists(path.resolve(outDir, 'resources.pri'))) {
        return;
    }
    if (!await fs.pathExists(outDir)) {
        await fs.mkdirp(outDir);
    }
    d(`downloading ${fileName}`);
    const artifact = await (0, get_1.downloadArtifact)({
        isGeneric: true,
        version: '3.0.4',
        artifactName: fileName,
        unsafelyDisableChecksums: true,
        mirrorOptions: {
            mirror: 'https://github.com/microsoft/vscode-explorer-command/releases/download/',
            customDir: '3.0.4',
            customFilename: fileName
        }
    });
    d(`unpacking from ${fileName}`);
    await extract(artifact, { dir: outDir });
}
exports.downloadExplorerAppx = downloadExplorerAppx;
async function main() {
    const outputDir = process.env['VSCODE_EXPLORER_APPX_DIR'];
    let arch = process.env['VSCODE_ARCH'];
    if (!outputDir) {
        throw new Error('Required build env not set');
    }
    if (arch === 'ia32') {
        arch = 'x86';
    }
    await downloadExplorerAppx(outputDir, product.quality, arch);
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
