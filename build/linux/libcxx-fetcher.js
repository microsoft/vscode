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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliY3h4LWZldGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsaWJjeHgtZmV0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRywwRkFBMEY7QUFFMUYseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwrQkFBK0I7QUFDL0IsdUNBQXVDO0FBQ3ZDLHVDQUFpRDtBQUVqRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUVuRCxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUUzQixLQUFLLFVBQVUscUJBQXFCLENBQUMsTUFBYyxFQUFFLGVBQXVCLEVBQUUsUUFBZ0I7SUFDcEcsSUFBSSxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsRUFBRTtRQUN6RCxPQUFPO0tBQ1A7SUFDRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ2pDLE1BQU0sRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztLQUNoRDtJQUVELENBQUMsQ0FBQyxlQUFlLFFBQVEsVUFBVSxDQUFDLENBQUM7SUFDckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLHNCQUFnQixFQUFDO1FBQ3RDLE9BQU8sRUFBRSxlQUFlO1FBQ3hCLFNBQVMsRUFBRSxJQUFJO1FBQ2YsWUFBWSxFQUFFLEdBQUcsUUFBUSxjQUFjO0tBQ3ZDLENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxhQUFhLFFBQVEsaUJBQWlCLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDbkQsTUFBTSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLE1B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