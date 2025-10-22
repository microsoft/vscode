/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExplorerDll = downloadExplorerDll;
const fs_1 = __importDefault(require("fs"));
const debug_1 = __importDefault(require("debug"));
const path_1 = __importDefault(require("path"));
const get_1 = require("@electron/get");
const product_json_1 = __importDefault(require("../../product.json"));
const product = product_json_1.default;
const d = (0, debug_1.default)('explorer-dll-fetcher');
async function downloadExplorerDll(outDir, quality = 'stable', targetArch = 'x64') {
    const fileNamePrefix = quality === 'insider' ? 'code_insider' : 'code';
    const fileName = `${fileNamePrefix}_explorer_command_${targetArch}.dll`;
    if (!await fs_1.default.existsSync(outDir)) {
        await fs_1.default.mkdirSync(outDir, { recursive: true });
    }
    // Read and parse checksums file
    const checksumsFilePath = path_1.default.join(path_1.default.dirname(__dirname), 'checksums', 'explorer-dll.txt');
    const checksumsContent = fs_1.default.readFileSync(checksumsFilePath, 'utf8');
    const checksums = {};
    checksumsContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            const [checksum, filename] = trimmedLine.split(/\s+/);
            if (checksum && filename) {
                checksums[filename] = checksum;
            }
        }
    });
    d(`downloading ${fileName}`);
    const artifact = await (0, get_1.downloadArtifact)({
        isGeneric: true,
        version: 'v4.0.0-355426',
        artifactName: fileName,
        checksums,
        mirrorOptions: {
            mirror: 'https://github.com/microsoft/vscode-explorer-command/releases/download/',
            customDir: 'v4.0.0-355426',
            customFilename: fileName
        }
    });
    d(`moving ${artifact} to ${outDir}`);
    await fs_1.default.copyFileSync(artifact, path_1.default.join(outDir, fileName));
}
async function main(outputDir) {
    const arch = process.env['VSCODE_ARCH'];
    if (!outputDir) {
        throw new Error('Required build env not set');
    }
    await downloadExplorerDll(outputDir, product.quality, arch);
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=explorer-dll-fetcher.js.map