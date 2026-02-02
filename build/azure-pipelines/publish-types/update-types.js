"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const cp = require("child_process");
const path = require("path");
let tag = '';
try {
    tag = cp
        .execSync('git describe --tags `git rev-list --tags --max-count=1`')
        .toString()
        .trim();
    const dtsUri = `https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vscode-dts/vscode.d.ts`;
    const outPath = path.resolve(process.cwd(), 'DefinitelyTyped/types/vscode/index.d.ts');
    cp.execSync(`curl ${dtsUri} --output ${outPath}`);
    updateDTSFile(outPath, tag);
    console.log(`Done updating vscode.d.ts at ${outPath}`);
}
catch (err) {
    console.error(err);
    console.error('Failed to update types');
    process.exit(1);
}
function updateDTSFile(outPath, tag) {
    const oldContent = fs.readFileSync(outPath, 'utf-8');
    const newContent = getNewFileContent(oldContent, tag);
    fs.writeFileSync(outPath, newContent);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXR5cGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXBkYXRlLXR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcseUJBQXlCO0FBQ3pCLG9DQUFvQztBQUNwQyw2QkFBNkI7QUFFN0IsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2IsSUFBSSxDQUFDO0lBQ0osR0FBRyxHQUFHLEVBQUU7U0FDTixRQUFRLENBQUMseURBQXlELENBQUM7U0FDbkUsUUFBUSxFQUFFO1NBQ1YsSUFBSSxFQUFFLENBQUM7SUFFVCxNQUFNLE1BQU0sR0FBRyxzREFBc0QsR0FBRyw2QkFBNkIsQ0FBQztJQUN0RyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDO0lBQ3ZGLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxNQUFNLGFBQWEsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUVsRCxhQUFhLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRTVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDeEQsQ0FBQztBQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN4QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pCLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxPQUFlLEVBQUUsR0FBVztJQUNsRCxNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNyRCxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFdEQsRUFBRSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQUVELFNBQVMsTUFBTSxDQUFDLEdBQVcsRUFBRSxLQUFhO0lBQ3pDLE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDeEIsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBVztJQUN2QyxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNuRSxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxPQUFlLEVBQUUsR0FBVztJQUN0RCxNQUFNLFNBQVMsR0FBRztRQUNqQixpR0FBaUc7UUFDakcsK0RBQStEO1FBQy9ELGtHQUFrRztRQUNsRyxrR0FBa0c7S0FDbEcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixPQUFPLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDckYsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNwQyxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7SUFFckMsTUFBTSxNQUFNLEdBQUc7UUFDZCw4Q0FBOEMsUUFBUSxFQUFFO1FBQ3hELGlEQUFpRDtRQUNqRCxzRkFBc0Y7UUFDdEYsb0VBQW9FO1FBQ3BFLEVBQUU7UUFDRixpR0FBaUc7UUFDakcsK0RBQStEO1FBQy9ELHFDQUFxQztRQUNyQyw0RkFBNEY7UUFDNUYsa0dBQWtHO1FBQ2xHLEVBQUU7UUFDRixLQUFLO1FBQ0wsNkNBQTZDLFFBQVEsZ0JBQWdCO1FBQ3JFLCtEQUErRDtRQUMvRCxLQUFLO0tBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==