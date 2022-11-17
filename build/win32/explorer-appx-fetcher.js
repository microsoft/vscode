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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXItYXBweC1mZXRjaGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZXhwbG9yZXItYXBweC1mZXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLFlBQVksQ0FBQzs7O0FBRWIsK0JBQStCO0FBQy9CLHVDQUF1QztBQUN2QywrQkFBK0I7QUFDL0IsNkJBQTZCO0FBQzdCLDhDQUE4QztBQUM5Qyx1Q0FBaUQ7QUFFakQsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFFbEMsS0FBSyxVQUFVLG9CQUFvQixDQUFDLE1BQWMsRUFBRSxVQUFrQixRQUFRLEVBQUUsYUFBcUIsS0FBSztJQUNoSCxNQUFNLGNBQWMsR0FBRyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN4RSxNQUFNLFFBQVEsR0FBRyxHQUFHLGNBQWMsYUFBYSxVQUFVLE1BQU0sQ0FBQztJQUVoRSxJQUFJLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQyxFQUFFO1FBQy9ELE9BQU87S0FDUDtJQUVELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7UUFDakMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3hCO0lBRUQsQ0FBQyxDQUFDLGVBQWUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM3QixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsc0JBQWdCLEVBQUM7UUFDdkMsU0FBUyxFQUFFLElBQUk7UUFDZixPQUFPLEVBQUUsT0FBTztRQUNoQixZQUFZLEVBQUUsUUFBUTtRQUN0Qix3QkFBd0IsRUFBRSxJQUFJO1FBQzlCLGFBQWEsRUFBRTtZQUNkLE1BQU0sRUFBRSx5RUFBeUU7WUFDakYsU0FBUyxFQUFFLE9BQU87WUFDbEIsY0FBYyxFQUFFLFFBQVE7U0FDeEI7S0FDRCxDQUFDLENBQUM7SUFFSCxDQUFDLENBQUMsa0JBQWtCLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDaEMsTUFBTSxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQTNCRCxvREEyQkM7QUFFRCxLQUFLLFVBQVUsSUFBSTtJQUNsQixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDMUQsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUV0QyxJQUFJLENBQUMsU0FBUyxFQUFFO1FBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0tBQzlDO0lBRUQsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFO1FBQ3BCLElBQUksR0FBRyxLQUFLLENBQUM7S0FDYjtJQUVELE1BQU0sb0JBQW9CLENBQUMsU0FBUyxFQUFHLE9BQWUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkUsQ0FBQztBQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDNUIsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2xCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztDQUNIIn0=