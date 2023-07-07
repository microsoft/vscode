/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExplorerAppx = void 0;
const fs = require("fs");
const debug = require("debug");
const extract = require("extract-zip");
const path = require("path");
const get_1 = require("@electron/get");
const root = path.dirname(path.dirname(__dirname));
const d = debug('explorer-appx-fetcher');
async function downloadExplorerAppx(outDir, quality = 'stable', targetArch = 'x64') {
    const fileNamePrefix = quality === 'insider' ? 'code_insiders' : 'code';
    const fileName = `${fileNamePrefix}_explorer_${targetArch}.zip`;
    if (await fs.existsSync(path.resolve(outDir, 'resources.pri'))) {
        return;
    }
    if (!await fs.existsSync(outDir)) {
        await fs.mkdirSync(outDir, { recursive: true });
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
    await extract(artifact, { dir: fs.realpathSync(outDir) });
}
exports.downloadExplorerAppx = downloadExplorerAppx;
async function main(outputDir) {
    let arch = process.env['VSCODE_ARCH'];
    if (!outputDir) {
        throw new Error('Required build env not set');
    }
    if (arch === 'ia32') {
        arch = 'x86';
    }
    const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
    await downloadExplorerAppx(outputDir, product.quality, arch);
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXItYXBweC1mZXRjaGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZXhwbG9yZXItYXBweC1mZXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLFlBQVksQ0FBQzs7O0FBRWIseUJBQXlCO0FBQ3pCLCtCQUErQjtBQUMvQix1Q0FBdUM7QUFDdkMsNkJBQTZCO0FBQzdCLHVDQUFpRDtBQUVqRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUVuRCxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUVsQyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsTUFBYyxFQUFFLFVBQWtCLFFBQVEsRUFBRSxhQUFxQixLQUFLO0lBQ2hILE1BQU0sY0FBYyxHQUFHLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3hFLE1BQU0sUUFBUSxHQUFHLEdBQUcsY0FBYyxhQUFhLFVBQVUsTUFBTSxDQUFDO0lBRWhFLElBQUksTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDLEVBQUU7UUFDL0QsT0FBTztLQUNQO0lBRUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxNQUFNLEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7S0FDaEQ7SUFFRCxDQUFDLENBQUMsZUFBZSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzdCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxzQkFBZ0IsRUFBQztRQUN2QyxTQUFTLEVBQUUsSUFBSTtRQUNmLE9BQU8sRUFBRSxPQUFPO1FBQ2hCLFlBQVksRUFBRSxRQUFRO1FBQ3RCLHdCQUF3QixFQUFFLElBQUk7UUFDOUIsYUFBYSxFQUFFO1lBQ2QsTUFBTSxFQUFFLHlFQUF5RTtZQUNqRixTQUFTLEVBQUUsT0FBTztZQUNsQixjQUFjLEVBQUUsUUFBUTtTQUN4QjtLQUNELENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxrQkFBa0IsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNoQyxNQUFNLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDM0QsQ0FBQztBQTNCRCxvREEyQkM7QUFFRCxLQUFLLFVBQVUsSUFBSSxDQUFDLFNBQWtCO0lBQ3JDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFFdEMsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztLQUM5QztJQUVELElBQUksSUFBSSxLQUFLLE1BQU0sRUFBRTtRQUNwQixJQUFJLEdBQUcsS0FBSyxDQUFDO0tBQ2I7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNyRixNQUFNLG9CQUFvQixDQUFDLFNBQVMsRUFBRyxPQUFlLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFO0lBQzVCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2pDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztDQUNIIn0=