"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.date = void 0;
const path = require("path");
const fs = require("fs");
let resolvedDate = undefined;
if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
    // When building in CI make sure to use
    // the same date for all artifacts
    if (!fs.existsSync(path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, 'date'))) {
        resolvedDate = new Date().toISOString();
        fs.writeFileSync(path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, 'date'), resolvedDate);
    }
    else {
        resolvedDate = fs.readFileSync(path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, 'date')).toString();
    }
}
if (!resolvedDate) {
    resolvedDate = new Date().toISOString();
}
exports.date = resolvedDate;
//# sourceMappingURL=date.js.map