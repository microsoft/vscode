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
const child_process_1 = __importDefault(require("child_process"));
const path_1 = __importDefault(require("path"));
let tag = '';
try {
    tag = child_process_1.default
        .execSync('git describe --tags `git rev-list --tags --max-count=1`')
        .toString()
        .trim();
    const dtsUri = `https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vscode-dts/vscode.d.ts`;
    const outPath = path_1.default.resolve(process.cwd(), 'DefinitelyTyped/types/vscode/index.d.ts');
    child_process_1.default.execSync(`curl ${dtsUri} --output ${outPath}`);
    updateDTSFile(outPath, tag);
    console.log(`Done updating vscode.d.ts at ${outPath}`);
}
catch (err) {
    console.error(err);
    console.error('Failed to update types');
    process.exit(1);
}
function updateDTSFile(outPath, tag) {
    const oldContent = fs_1.default.readFileSync(outPath, 'utf-8');
    const newContent = getNewFileContent(oldContent, tag);
    fs_1.default.writeFileSync(outPath, newContent);
}
function repeat(str, times) {
    const result = new Array(times);
    for (let i = 0; i < times; i++) {
        result[i] = str;
    }
    return result.join('');
}
function convertTabsToSpaces(str) {
    return str.replace(/\t/gm, value => repeat('    ', value.length));
}
function getNewFileContent(content, tag) {
    const oldheader = [
        `/*---------------------------------------------------------------------------------------------`,
        ` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
        ` *  Licensed under the MIT License. See License.txt in the project root for license information.`,
        ` *--------------------------------------------------------------------------------------------*/`
    ].join('\n');
    return convertTabsToSpaces(getNewFileHeader(tag) + content.slice(oldheader.length));
}
function getNewFileHeader(tag) {
    const [major, minor] = tag.split('.');
    const shorttag = `${major}.${minor}`;
    const header = [
        `// Type definitions for Visual Studio Code ${shorttag}`,
        `// Project: https://github.com/microsoft/vscode`,
        `// Definitions by: Visual Studio Code Team, Microsoft <https://github.com/microsoft>`,
        `// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped`,
        ``,
        `/*---------------------------------------------------------------------------------------------`,
        ` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
        ` *  Licensed under the MIT License.`,
        ` *  See https://github.com/microsoft/vscode/blob/main/LICENSE.txt for license information.`,
        ` *--------------------------------------------------------------------------------------------*/`,
        ``,
        `/**`,
        ` * Type Definition for Visual Studio Code ${shorttag} Extension API`,
        ` * See https://code.visualstudio.com/api for more information`,
        ` */`
    ].join('\n');
    return header;
}
//# sourceMappingURL=update-types.js.map