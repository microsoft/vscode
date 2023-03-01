"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const got_1 = require("got");
const fs = require("fs");
const path = require("path");
const url = require("url");
const ansiColors = require("ansi-colors");
const root = path.dirname(path.dirname(__dirname));
const rootCG = path.join(root, 'extensionsCG');
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions || [];
const token = process.env['VSCODE_MIXIN_PASSWORD'] || process.env['GITHUB_TOKEN'] || undefined;
const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json', 'yarn.lock'];
async function downloadExtensionDetails(extension) {
    const extensionLabel = `${extension.name}@${extension.version}`;
    const repository = url.parse(extension.repo).path.substr(1);
    const repositoryContentBaseUrl = `https://${token ? `${token}@` : ''}${contentBasePath}/${repository}/v${extension.version}`;
    const promises = [];
    for (const fileName of contentFileNames) {
        promises.push(new Promise(resolve => {
            (0, got_1.default)(`${repositoryContentBaseUrl}/${fileName}`)
                .then(response => {
                resolve({ fileName, body: response.rawBody });
            })
                .catch(error => {
                if (error.response.statusCode === 404) {
                    resolve({ fileName, body: undefined });
                }
                else {
                    resolve({ fileName, body: null });
                }
            });
        }));
    }
    console.log(extensionLabel);
    const results = await Promise.all(promises);
    for (const result of results) {
        if (result.body) {
            const extensionFolder = path.join(rootCG, extension.name);
            fs.mkdirSync(extensionFolder, { recursive: true });
            fs.writeFileSync(path.join(extensionFolder, result.fileName), result.body);
            console.log(`  - ${result.fileName} ${ansiColors.green('✔︎')}`);
        }
        else if (result.body === undefined) {
            console.log(`  - ${result.fileName} ${ansiColors.yellow('⚠️')}`);
        }
        else {
            console.log(`  - ${result.fileName} ${ansiColors.red('🛑')}`);
        }
    }
    // Validation
    if (!results.find(r => r.fileName === 'package.json')?.body) {
        // throw new Error(`The "package.json" file could not be found for the built-in extension - ${extensionLabel}`);
    }
    if (!results.find(r => r.fileName === 'package-lock.json')?.body &&
        !results.find(r => r.fileName === 'yarn.lock')?.body) {
        // throw new Error(`The "package-lock.json"/"yarn.lock" could not be found for the built-in extension - ${extensionLabel}`);
    }
}
async function main() {
    for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
        await downloadExtensionDetails(extension);
    }
}
main().then(() => {
    console.log(`Built-in extensions component data downloaded ${ansiColors.green('✔︎')}`);
    process.exit(0);
}, err => {
    console.log(`Built-in extensions component data could not be downloaded ${ansiColors.red('🛑')}`);
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbHRJbkV4dGVuc2lvbnNDRy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWx0SW5FeHRlbnNpb25zQ0cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyw2QkFBc0I7QUFDdEIseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwyQkFBMkI7QUFDM0IsMENBQTJDO0FBRzNDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQy9DLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDcEcsTUFBTSxpQkFBaUIsR0FBMkIsV0FBVyxDQUFDLGlCQUFpQixJQUFJLEVBQUUsQ0FBQztBQUN0RixNQUFNLG9CQUFvQixHQUEyQixXQUFXLENBQUMsb0JBQW9CLElBQUksRUFBRSxDQUFDO0FBQzVGLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLFNBQVMsQ0FBQztBQUUvRixNQUFNLGVBQWUsR0FBRywyQkFBMkIsQ0FBQztBQUNwRCxNQUFNLGdCQUFnQixHQUFHLENBQUMsY0FBYyxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBRTVFLEtBQUssVUFBVSx3QkFBd0IsQ0FBQyxTQUErQjtJQUN0RSxNQUFNLGNBQWMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxJQUFJLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hF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