"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadLibcxxObjects = exports.downloadLibcxxHeaders = void 0;
// Can be removed once https://github.com/electron/electron-rebuild/pull/703 is available.
const fs = require("fs");
const path = require("path");
const debug = require("debug");
const extract = require("extract-zip");
const get_1 = require("@electron/get");
const root = path.dirname(path.dirname(__dirname));
const d = debug('libcxx-fetcher');
async function downloadLibcxxHeaders(outDir, electronVersion, lib_name) {
    if (await fs.existsSync(path.resolve(outDir, 'include'))) {
        return;
    }
    if (!await fs.existsSync(outDir)) {
        await fs.mkdirSync(outDir, { recursive: true });
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
    if (await fs.existsSync(path.resolve(outDir, 'libc++.a'))) {
        return;
    }
    if (!await fs.existsSync(outDir)) {
        await fs.mkdirSync(outDir, { recursive: true });
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
    const packageJSON = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliY3h4LWZldGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsaWJjeHgtZmV0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRywwRkFBMEY7QUFFMUYseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwrQkFBK0I7QUFDL0IsdUNBQXVDO0FBQ3ZDLHVDQUFpRDtBQUVqRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUVuRCxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUUzQixLQUFLLFVBQVUscUJBQXFCLENBQUMsTUFBYyxFQUFFLGVBQXVCLEVBQUUsUUFBZ0I7SUFDcEcsSUFBSSxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzFELE9BQU87SUFDUixDQUFDO0lBQ0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsQ0FBQyxDQUFDLGVBQWUsUUFBUSxVQUFVLENBQUMsQ0FBQztJQUNyQyxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsc0JBQWdCLEVBQUM7UUFDdEMsT0FBTyxFQUFFLGVBQWU7UUFDeEIsU0FBUyxFQUFFLElBQUk7UUFDZixZQUFZLEVBQUUsR0FBRyxRQUFRLGNBQWM7S0FDdkMsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxDQUFDLGFBQWEsUUFBUSxpQkFBaUIsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNuRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVB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