"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadLibcxxHeaders = downloadLibcxxHeaders;
exports.downloadLibcxxObjects = downloadLibcxxObjects;
// Can be removed once https://github.com/electron/electron-rebuild/pull/703 is available.
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const debug_1 = __importDefault(require("debug"));
const extract_zip_1 = __importDefault(require("extract-zip"));
const get_1 = require("@electron/get");
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const d = (0, debug_1.default)('libcxx-fetcher');
async function downloadLibcxxHeaders(outDir, electronVersion, lib_name) {
    if (await fs_1.default.existsSync(path_1.default.resolve(outDir, 'include'))) {
        return;
    }
    if (!await fs_1.default.existsSync(outDir)) {
        await fs_1.default.mkdirSync(outDir, { recursive: true });
    }
    d(`downloading ${lib_name}_headers`);
    const headers = await (0, get_1.downloadArtifact)({
        version: electronVersion,
        isGeneric: true,
        artifactName: `${lib_name}_headers.zip`,
    });
    d(`unpacking ${lib_name}_headers from ${headers}`);
    await (0, extract_zip_1.default)(headers, { dir: outDir });
}
async function downloadLibcxxObjects(outDir, electronVersion, targetArch = 'x64') {
    if (await fs_1.default.existsSync(path_1.default.resolve(outDir, 'libc++.a'))) {
        return;
    }
    if (!await fs_1.default.existsSync(outDir)) {
        await fs_1.default.mkdirSync(outDir, { recursive: true });
    }
    d(`downloading libcxx-objects-linux-${targetArch}`);
    const objects = await (0, get_1.downloadArtifact)({
        version: electronVersion,
        platform: 'linux',
        artifactName: 'libcxx-objects',
        arch: targetArch,
    });
    d(`unpacking libcxx-objects from ${objects}`);
    await (0, extract_zip_1.default)(objects, { dir: outDir });
}
async function main() {
    const libcxxObjectsDirPath = process.env['VSCODE_LIBCXX_OBJECTS_DIR'];
    const libcxxHeadersDownloadDir = process.env['VSCODE_LIBCXX_HEADERS_DIR'];
    const libcxxabiHeadersDownloadDir = process.env['VSCODE_LIBCXXABI_HEADERS_DIR'];
    const arch = process.env['VSCODE_ARCH'];
    const packageJSON = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'package.json'), 'utf8'));
    const electronVersion = packageJSON.devDependencies.electron;
    if (!libcxxObjectsDirPath || !libcxxHeadersDownloadDir || !libcxxabiHeadersDownloadDir) {
        throw new Error('Required build env not set');
    }
    await downloadLibcxxObjects(libcxxObjectsDirPath, electronVersion, arch);
    await downloadLibcxxHeaders(libcxxHeadersDownloadDir, electronVersion, 'libcxx');
    await downloadLibcxxHeaders(libcxxabiHeadersDownloadDir, electronVersion, 'libcxxabi');
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=libcxx-fetcher.js.map