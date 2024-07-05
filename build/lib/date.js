"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDate = buildDate;
const path = require("path");
const fs = require("fs");
function buildDate(outDir) {
    const result = () => new Promise((resolve, _) => {
        const root = path.join(__dirname, '..', '..');
        const outDirectory = path.join(root, outDir);
        fs.mkdirSync(outDirectory, { recursive: true });
        const date = new Date().toISOString();
        fs.writeFileSync(path.join(outDirectory, 'date'), date, 'utf8');
        resolve();
    });
    result.taskName = 'build-date-file';
    return result;
}
//# sourceMappingURL=date.js.map