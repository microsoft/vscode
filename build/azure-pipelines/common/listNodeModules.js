/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, '../../../');
function findNodeModulesFiles(location, inNodeModules, result) {
    const entries = fs.readdirSync(path.join(ROOT, location));
    for (const entry of entries) {
        const entryPath = `${location}/${entry}`;
        if (/(^\/out)|(^\/src$)|(^\/.git$)|(^\/.build$)/.test(entryPath)) {
            continue;
        }
        const stat = fs.statSync(path.join(ROOT, entryPath));
        if (stat.isDirectory()) {
            findNodeModulesFiles(entryPath, inNodeModules || (entry === 'node_modules'), result);
        }
        else {
            if (inNodeModules) {
                result.push(entryPath.substr(1));
            }
        }
    }
}
const result = [];
findNodeModulesFiles('', false, result);
console.log(result.join('\n'));
