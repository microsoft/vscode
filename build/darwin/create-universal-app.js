"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const minimatch_1 = __importDefault(require("minimatch"));
const vscode_universal_bundler_1 = require("vscode-universal-bundler");
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
async function main(buildDir) {
    const arch = process.env['VSCODE_ARCH'];
    if (!buildDir) {
        throw new Error('Build dir not provided');
    }
    const product = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, 'product.json'), 'utf8'));
    const appName = product.nameLong + '.app';
    const x64AppPath = path_1.default.join(buildDir, 'VSCode-darwin-x64', appName);
    const arm64AppPath = path_1.default.join(buildDir, 'VSCode-darwin-arm64', appName);
    const asarRelativePath = path_1.default.join('Contents', 'Resources', 'app', 'node_modules.asar');
    const outAppPath = path_1.default.join(buildDir, `VSCode-darwin-${arch}`, appName);
    const productJsonPath = path_1.default.resolve(outAppPath, 'Contents', 'Resources', 'app', 'product.json');
    const filesToSkip = [
        '**/CodeResources',
        '**/Credits.rtf',
        // TODO: Should we consider expanding this to other files in this area?
        '**/node_modules/@parcel/node-addon-api/nothing.target.mk'
    ];
    await (0, vscode_universal_bundler_1.makeUniversalApp)({
        x64AppPath,
        arm64AppPath,
        asarPath: asarRelativePath,
        outAppPath,
        force: true,
        mergeASARs: true,
        x64ArchFiles: '*/kerberos.node',
        filesToSkipComparison: (file) => {
            for (const expected of filesToSkip) {
                if ((0, minimatch_1.default)(file, expected)) {
                    return true;
                }
            }
            return false;
        }
    });
    const productJson = JSON.parse(fs_1.default.readFileSync(productJsonPath, 'utf8'));
    Object.assign(productJson, {
        darwinUniversalAssetId: 'darwin-universal'
    });
    fs_1.default.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'));
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=create-universal-app.js.map