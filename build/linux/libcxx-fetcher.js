"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadLibcxxObjects = exports.downloadLibcxxHeaders = void 0;
// Can be removed once https://github.com/electron/electron-rebuild/pull/703 is available.
const debug = require("debug");
const extract = require("extract-zip");
const fs = require("fs-extra");
const path = require("path");
const packageJSON = require("../../package.json");
const get_1 = require("@electron/get");
const d = debug('libcxx-fetcher');
async function downloadLibcxxHeaders(outDir, electronVersion, lib_name) {
    if (await fs.pathExists(path.resolve(outDir, 'include'))) {
        return;
    }
    if (!await fs.pathExists(outDir)) {
        await fs.mkdirp(outDir);
    }
    d(`downloading ${lib_name}_headers`);
    const headers = await (0, get_1.downloadArtifact)({
        version: electronVersion,
        isGeneric: true,
        artifactName: `${lib_name}_headers.zip`,
    });
    d(`unpacking ${lib_name}_headers from ${headers}`);
    await extract(headers, { dir: outDir });
}
exports.downloadLibcxxHeaders = downloadLibcxxHeaders;
async function downloadLibcxxObjects(outDir, electronVersion, targetArch = 'x64') {
    if (await fs.pathExists(path.resolve(outDir, 'libc++.a'))) {
        return;
    }
    if (!await fs.pathExists(outDir)) {
        await fs.mkdirp(outDir);
    }
    d(`downloading libcxx-objects-linux-${targetArch}`);
    const objects = await (0, get_1.downloadArtifact)({
        version: electronVersion,
        platform: 'linux',
        artifactName: 'libcxx-objects',
        arch: targetArch,
    });
    d(`unpacking libcxx-objects from ${objects}`);
    await extract(objects, { dir: outDir });
}
exports.downloadLibcxxObjects = downloadLibcxxObjects;
async function main() {
    const libcxxObjectsDirPath = process.env['VSCODE_LIBCXX_OBJECTS_DIR'];
    const libcxxHeadersDownloadDir = process.env['VSCODE_LIBCXX_HEADERS_DIR'];
    const libcxxabiHeadersDownloadDir = process.env['VSCODE_LIBCXXABI_HEADERS_DIR'];
    const arch = process.env['VSCODE_ARCH'];
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
