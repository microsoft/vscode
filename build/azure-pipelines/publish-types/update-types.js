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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXR5cGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXBkYXRlLXR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcseUJBQXlCO0FBQ3pCLG9DQUFvQztBQUNwQyw2QkFBNkI7QUFFN0IsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2IsSUFBSTtJQUNILEdBQUcsR0FBRyxFQUFFO1NBQ04sUUFBUSxDQUFDLHlEQUF5RCxDQUFDO1NBQ25FLFFBQVEsRUFBRTtTQUNWLElBQUksRUFBRSxDQUFDO0lBRVQsTUFBTSxNQUFNLEdBQUcsc0RBQXNELEdBQUcsNkJBQTZCLENBQUM7SUFDdEcsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUseUNBQXlDLENBQUMsQ0FBQztJQUN2RixFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsTUFBTSxhQUFhLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFFbEQsYUFBYSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztJQUU1QixPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0NBQ3ZEO0FBQUMsT0FBTyxHQUFHLEVBQUU7SUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN4QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ2hCO0FBRUQsU0FBUyxhQUFhLENBQUMsT0FBZSxFQUFFLEdBQVc7SUFDbEQsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDckQsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXRELEVBQUUsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3ZDLENBQUM7QUFFRCxTQUFTLE1BQU0sQ0FBQyxHQUFXLEVBQUUsS0FBYTtJQUN6QyxNQUFNLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQy9CLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7S0FDaEI7SUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDeEIsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBVztJQUN2QyxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNuRSxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxPQUFlLEVBQUUsR0FBVztJQUN0RCxNQUFNLFNBQVMsR0FBRztRQUNqQixpR0FBaUc7UUFDakcsK0RBQStEO1FBQy9ELGtHQUFrRztRQUNsRyxrR0FBa0c7S0FDbEcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixPQUFPLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDckYsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNwQyxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7SUFFckMsTUFBTSxNQUFNLEdBQUc7UUFDZCw4Q0FBOEMsUUFBUSxFQUFFO1FBQ3hELGlEQUFpRDtRQUNqRCxzRkFBc0Y7UUFDdEYsb0VBQW9FO1FBQ3BFLEVBQUU7UUFDRixpR0FBaUc7UUFDakcsK0RBQStEO1FBQy9ELHFDQUFxQztRQUNyQyw0RkFBNEY7UUFDNUYsa0dBQWtHO1FBQ2xHLEVBQUU7UUFDRixLQUFLO1FBQ0wsNkNBQTZDLFFBQVEsZ0JBQWdCO1FBQ3JFLCtEQUErRDtRQUMvRCxLQUFLO0tBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==