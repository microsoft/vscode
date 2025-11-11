"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = __importDefault(require("url"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const rootCG = path_1.default.join(root, 'extensionsCG');
const productjson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions || [];
const token = process.env['GITHUB_TOKEN'];
const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json'];
async function downloadExtensionDetails(extension) {
    const extensionLabel = `${extension.name}@${extension.version}`;
    const repository = url_1.default.parse(extension.repo).path.substr(1);
    const repositoryContentBaseUrl = `https://${token ? `${token}@` : ''}${contentBasePath}/${repository}/v${extension.version}`;
    async function getContent(fileName) {
        try {
            const response = await fetch(`${repositoryContentBaseUrl}/${fileName}`);
            if (response.ok) {
                return { fileName, body: Buffer.from(await response.arrayBuffer()) };
            }
            else if (response.status === 404) {
                return { fileName, body: undefined };
            }
            else {
                return { fileName, body: null };
            }
        }
        catch (e) {
            return { fileName, body: null };
        }
    }
    const promises = contentFileNames.map(getContent);
    console.log(extensionLabel);
    const results = await Promise.all(promises);
    for (const result of results) {
        if (result.body) {
            const extensionFolder = path_1.default.join(rootCG, extension.name);
            fs_1.default.mkdirSync(extensionFolder, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(extensionFolder, result.fileName), result.body);
            console.log(`  - ${result.fileName} ${ansi_colors_1.default.green('✔︎')}`);
        }
        else if (result.body === undefined) {
            console.log(`  - ${result.fileName} ${ansi_colors_1.default.yellow('⚠️')}`);
        }
        else {
            console.log(`  - ${result.fileName} ${ansi_colors_1.default.red('🛑')}`);
        }
    }
    // Validation
    if (!results.find(r => r.fileName === 'package.json')?.body) {
        // throw new Error(`The "package.json" file could not be found for the built-in extension - ${extensionLabel}`);
    }
    if (!results.find(r => r.fileName === 'package-lock.json')?.body) {
        // throw new Error(`The "package-lock.json" could not be found for the built-in extension - ${extensionLabel}`);
    }
}
async function main() {
    for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
        await downloadExtensionDetails(extension);
    }
}
main().then(() => {
    console.log(`Built-in extensions component data downloaded ${ansi_colors_1.default.green('✔︎')}`);
    process.exit(0);
}, err => {
    console.log(`Built-in extensions component data could not be downloaded ${ansi_colors_1.default.red('🛑')}`);
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=builtInExtensionsCG.js.map