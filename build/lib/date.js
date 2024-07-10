"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeISODate = writeISODate;
exports.readISODate = readISODate;
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, '..', '..');
/**
 * Writes a `outDir/date` file with the contents of the build
 * so that other tasks during the build process can use it and
 * all use the same date.
 */
function writeISODate(outDir) {
    const result = () => new Promise((resolve, _) => {
        const outDirectory = path.join(root, outDir);
        fs.mkdirSync(outDirectory, { recursive: true });
        const date = new Date().toISOString();
        fs.writeFileSync(path.join(outDirectory, 'date'), date, 'utf8');
        resolve();
    });
    result.taskName = 'build-date-file';
    return result;
}
function readISODate(outDir) {
    const outDirectory = path.join(root, outDir);
    return fs.readFileSync(path.join(outDirectory, 'date'), 'utf8');
}
//# sourceMappingURL=date.js.map