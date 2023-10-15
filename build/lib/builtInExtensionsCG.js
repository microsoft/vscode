"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const fs = require("fs");
const path = require("path");
const url = require("url");
const ansiColors = require("ansi-colors");
const root = path.dirname(path.dirname(__dirname));
const rootCG = path.join(root, 'extensionsCG');
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions || [];
const token = process.env['GITHUB_TOKEN'];
const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json', 'yarn.lock'];
async function downloadExtensionDetails(extension) {
    const extensionLabel = `${extension.name}@${extension.version}`;
    const repository = url.parse(extension.repo).path.substr(1);
    const repositoryContentBaseUrl = `https://${token ? `${token}@` : ''}${contentBasePath}/${repository}/v${extension.version}`;
    async function getContent(fileName) {
        try {
            const response = await (0, node_fetch_1.default)(`${repositoryContentBaseUrl}/${fileName}`);
            if (response.ok) {
                return { fileName, body: await response.buffer() };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbHRJbkV4dGVuc2lvbnNDRy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWx0SW5FeHRlbnNpb25zQ0cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRywyQ0FBK0I7QUFDL0IseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwyQkFBMkI7QUFDM0IsMENBQTJDO0FBRzNDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQy9DLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDcEcsTUFBTSxpQkFBaUIsR0FBMkIsV0FBVyxDQUFDLGlCQUFpQixJQUFJLEVBQUUsQ0FBQztBQUN0RixNQUFNLG9CQUFvQixHQUEyQixXQUFXLENBQUMsb0JBQW9CLElBQUksRUFBRSxDQUFDO0FBQzVGLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFMUMsTUFBTSxlQUFlLEdBQUcsMkJBQTJCLENBQUM7QUFDcEQsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUU1RSxLQUFLLFVBQVUsd0JBQXdCLENBQUMsU0FBK0I7SUFDdEUsTUFBTSxjQUFjLEdBQUcsR0FBRyxTQUFTLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNoRSxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJ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