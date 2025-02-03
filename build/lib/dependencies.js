"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = getProductionDependencies;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = __importDefault(require("child_process"));
const root = fs_1.default.realpathSync(path_1.default.dirname(path_1.default.dirname(__dirname)));
function getNpmProductionDependencies(folder) {
    let raw;
    try {
        raw = child_process_1.default.execSync('npm ls --all --omit=dev --parseable', { cwd: folder, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, null] });
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
        return !!line.trim() && path_1.default.relative(root, line) !== path_1.default.relative(root, folder);
    });
}
function getProductionDependencies(folderPath) {
    const result = getNpmProductionDependencies(folderPath);
    // Account for distro npm dependencies
    const realFolderPath = fs_1.default.realpathSync(folderPath);
    const relativeFolderPath = path_1.default.relative(root, realFolderPath);
    const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;
    if (fs_1.default.existsSync(distroFolderPath)) {
        result.push(...getNpmProductionDependencies(distroFolderPath));
    }
    return [...new Set(result)];
}
if (require.main === module) {
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
//# sourceMappingURL=dependencies.js.map