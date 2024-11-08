"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = getProductionDependencies;
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const root = fs.realpathSync(path.dirname(path.dirname(__dirname)));
function getNpmProductionDependencies(folder) {
    let raw;
    try {
        raw = cp.execSync('npm ls --all --omit=dev --parseable', { cwd: folder, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, null] });
    }
    catch (err) {
        const regex = /^npm ERR! .*$/gm;
        let match;
        while (match = regex.exec(err.message)) {
            if (/ELSPROBLEMS/.test(match[0])) {
                continue;
            }
            else if (/invalid: xterm/.test(match[0])) {
                continue;
            }
            else if (/A complete log of this run/.test(match[0])) {
                continue;
            }
            else {
                throw err;
            }
        }
        raw = err.stdout;
    }
    return raw.split(/\r?\n/).filter(line => {
        return !!line.trim() && path.relative(root, line) !== path.relative(root, folder);
    });
}
function getProductionDependencies(folderPath) {
    const result = getNpmProductionDependencies(folderPath);
    // Account for distro npm dependencies
    const realFolderPath = fs.realpathSync(folderPath);
    const relativeFolderPath = path.relative(root, realFolderPath);
    const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;
    if (fs.existsSync(distroFolderPath)) {
        result.push(...getNpmProductionDependencies(distroFolderPath));
    }
    return [...new Set(result)];
}
if (require.main === module) {
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
//# sourceMappingURL=dependencies.js.map