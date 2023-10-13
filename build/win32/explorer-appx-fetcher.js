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
    const arch = process.env['VSCODE_ARCH'];
    if (!outputDir) {
        throw new Error('Required build env not set');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXItYXBweC1mZXRjaGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZXhwbG9yZXItYXBweC1mZXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLFlBQVksQ0FBQzs7O0FBRWIseUJBQXlCO0FBQ3pCLCtCQUErQjtBQUMvQix1Q0FBdUM7QUFDdkMsNkJBQTZCO0FBQzdCLHVDQUFpRDtBQUVqRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUVuRCxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUVsQyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsTUFBYyxFQUFFLFVBQWtCLFFBQVEsRUFBRSxhQUFxQixLQUFLO0lBQ2hILE1BQU0sY0FBYyxHQUFHLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3hFLE1BQU0sUUFBUSxHQUFHLEdBQUcsY0FBYyxhQUFhLFVBQVUsTUFBTSxDQUFDO0lBRWhFLElBQUksTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNoRSxPQUFPO0lBQ1IsQ0FBQztJQUVELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUNsQyxNQUFNLEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELENBQUMsQ0FBQyxlQUFlLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDN0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHNCQUFnQixFQUFDO1FBQ3ZDLFNBQVMsRUFBRSxJQUFJO1FBQ2YsT0FBTyxFQUFFLE9BQU87UUFDaEIsWUFBWSxFQUFFLFFBQVE7UUFDdEIsd0JBQXdCLEVBQUUsSUFBSTtRQUM5QixhQUFhLEVBQUU7WUFDZCxNQUFNLEVBQUUseUVBQXlFO1lBQ2pGLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLGNBQWMsRUFBRSxRQUFRO1NBQ3hCO0tBQ0QsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxDQUFDLGtCQUFrQixRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ2hDLE1BQU0sT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBM0JELG9EQTJCQztBQUVELEtBQUssVUFBVSxJQUFJLENBQUMsU0FBa0I7SUFDckMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUV4QyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNyRixNQUFNLG9CQUFvQixDQUFDLFNBQVMsRUFBRyxPQUFlLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7SUFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9