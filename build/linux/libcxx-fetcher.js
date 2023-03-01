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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliY3h4LWZldGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsaWJjeHgtZmV0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRywwRkFBMEY7QUFFMUYsK0JBQStCO0FBQy9CLHVDQUF1QztBQUN2QywrQkFBK0I7QUFDL0IsNkJBQTZCO0FBQzdCLGtEQUFrRDtBQUNsRCx1Q0FBaUQ7QUFFakQsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFFM0IsS0FBSyxVQUFVLHFCQUFxQixDQUFDLE1BQWMsRUFBRSxlQUF1QixFQUFFLFFBQWdCO0lBQ3BHLElBQUksTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUU7UUFDekQsT0FBTztLQUNQO0lBQ0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDeEI7SUFFRCxDQUFDLENBQUMsZUFBZSxRQUFRLFVBQVUsQ0FBQyxDQUFDO0lBQ3JDLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBQSxzQkFBZ0IsRUFBQztRQUN0QyxPQUFPLEVBQUUsZUFBZTtRQUN4QixTQUFTLEVBQUUsSUFBSTtRQUNmLFlBQVksRUFBRSxHQUFHLFFBQVEsY0FBYztLQUN2QyxDQUFDLENBQUM7SUFFSCxDQUFDLENBQUMsYUFBYSxRQUFRLGlCQUFpQixPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELE1BQU0sT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFqQkQsc0RBaUJDO0FBRU0sS0FBSyxVQUFVLHFCQUFxQixDQUFDLE1BQWMsRUFBRSxlQUF1QixFQUFFLGFBQXFCLEtBQUs7SUFDOUcsSUFBSSxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsRUFBRTtRQUMxRCxPQUFPO0tBQ1A7SUFDRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ2pDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUN4QjtJQUVELENBQUMsQ0FBQyxvQ0FBb0MsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUNwRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsc0JBQWdCLEVBQUM7UUFDdEMsT0FBTyxFQUFFLGVBQWU7UUFDeEIsUUFBUSxFQUFFLE9BQU87UUFDakIsWUFBWSxFQUFFLGdCQUFnQjtRQUM5QixJQUFJLEVBQUUsVUFBVTtLQUNoQixDQUFDLENBQUM7SUFFSCxDQUFDLENBQUMsaUNBQWlDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDOUMsTUFBTSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDekMsQ0FBQztBQWxCRCxzREFrQkM7QUFFRCxLQUFLLFVBQVUsSUFBSTtJQUNsQixNQUFNLG9CQUFvQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUN0RSxNQUFNLHdCQUF3QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUMxRSxNQUFNLDJCQUEyQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUNoRixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDO0lBRTdELElBQUksQ0FBQyxvQkFBb0IsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsMkJBQTJCLEVBQUU7UUFDdkYsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0tBQzlDO0lBRUQsTUFBTSxxQkFBcUIsQ0FBQyxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDekUsTUFBTSxxQkFBcUIsQ0FBQyx3QkFBd0IsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDakYsTUFBTSxxQkFBcUIsQ0FBQywyQkFBMkIsRUFBRSxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDeEYsQ0FBQztBQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDNUIsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2xCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztDQUNIIn0=