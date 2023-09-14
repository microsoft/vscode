"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const vscode_universal_bundler_1 = require("vscode-universal-bundler");
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
const root = path.dirname(path.dirname(__dirname));
async function main(buildDir) {
    const arch = process.env['VSCODE_ARCH'];
    if (!buildDir) {
        throw new Error('Build dir not provided');
    }
    const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
    const appName = product.nameLong + '.app';
    const x64AppPath = path.join(buildDir, 'VSCode-darwin-x64', appName);
    const arm64AppPath = path.join(buildDir, 'VSCode-darwin-arm64', appName);
    const x64AsarPath = path.join(x64AppPath, 'Contents', 'Resources', 'app', 'node_modules.asar');
    const arm64AsarPath = path.join(arm64AppPath, 'Contents', 'Resources', 'app', 'node_modules.asar');
    const outAppPath = path.join(buildDir, `VSCode-darwin-${arch}`, appName);
    const productJsonPath = path.resolve(outAppPath, 'Contents', 'Resources', 'app', 'product.json');
    await (0, vscode_universal_bundler_1.makeUniversalApp)({
        x64AppPath,
        arm64AppPath,
        x64AsarPath,
        arm64AsarPath,
        filesToSkip: [
            'product.json',
            'Credits.rtf',
            'CodeResources',
            'fsevents.node',
            'Info.plist',
            'MainMenu.nib',
            '.npmrc'
        ],
        outAppPath,
        force: true
    });
    const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
    Object.assign(productJson, {
        darwinUniversalAssetId: 'darwin-universal'
    });
    fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'));
    // Verify if native module architecture is correct
    const findOutput = await (0, cross_spawn_promise_1.spawn)('find', [outAppPath, '-name', 'kerberos.node']);
    const lipoOutput = await (0, cross_spawn_promise_1.spawn)('lipo', ['-archs', findOutput.replace(/\n$/, '')]);
    if (lipoOutput.replace(/\n$/, '') !== 'x86_64 arm64') {
        throw new Error(`Invalid arch, got : ${lipoOutput}`);
    }
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLXVuaXZlcnNhbC1hcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGUtdW5pdmVyc2FsLWFwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFDekIsdUVBQTREO0FBQzVELHFFQUFvRDtBQUVwRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUVuRCxLQUFLLFVBQVUsSUFBSSxDQUFDLFFBQWlCO0lBQ3BDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFFeEMsSUFBSSxDQUFDLFFBQVEsRUFBRTtRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztLQUMxQztJQUVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3JGLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDO0lBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3JFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3pFLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDL0YsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUNuRyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxpQkFBaUIsSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDekUsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFFakcsTUFBTSxJQUFBLDJDQUFnQixFQUFDO1FBQ3RCLFVBQVU7UUFDVixZQUFZO1FBQ1osV0FBVztRQUNYLGFBQWE7UUFDYixXQUFXLEVBQUU7WUFDWixjQUFjO1lBQ2QsYUFBYTtZQUNiLGVBQWU7WUFDZixlQUFlO1lBQ2YsWUFBWTtZQUNaLGNBQWM7WUFDZCxRQUFRO1NBQ1I7UUFDRCxVQUFVO1FBQ1YsS0FBSyxFQUFFLElBQUk7S0FDWCxDQUFDLENBQUM7SUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDekUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7UUFDMUIsc0JBQXNCLEVBQUUsa0JBQWtCO0tBQzFDLENBQUMsQ0FBQztJQUNILEVBQUUsQ0FBQyxhQUFhLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBRTNFLGtEQUFrRDtJQUNsRCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUEsMkJBQUssRUFBQyxNQUFNLEVBQUUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUM7SUFDL0UsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFBLDJCQUFLLEVBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsRixJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLGNBQWMsRUFBRTtRQUNyRCxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixVQUFVLEVBQUUsQ0FBQyxDQUFDO0tBQ3JEO0FBQ0YsQ0FBQztBQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDNUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0NBQ0gifQ==