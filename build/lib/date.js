"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeISODate = writeISODate;
exports.readISODate = readISODate;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const root = path_1.default.join(__dirname, '..', '..');
/**
 * Writes a `outDir/date` file with the contents of the build
 * so that other tasks during the build process can use it and
 * all use the same date.
 */
function writeISODate(outDir) {
    const result = () => new Promise((resolve, _) => {
        const outDirectory = path_1.default.join(root, outDir);
        fs_1.default.mkdirSync(outDirectory, { recursive: true });
        const date = new Date().toISOString();
        fs_1.default.writeFileSync(path_1.default.join(outDirectory, 'date'), date, 'utf8');
        resolve();
    });
    result.taskName = 'build-date-file';
    return result;
}
function readISODate(outDir) {
    const outDirectory = path_1.default.join(root, outDir);
    return fs_1.default.readFileSync(path_1.default.join(outDirectory, 'date'), 'utf8');
}
//# sourceMappingURL=date.js.map