"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../product.json'), 'utf8'));
const shasum = crypto.createHash('sha256');
for (const ext of productjson.builtInExtensions) {
    shasum.update(`${ext.name}@${ext.version}`);
}
process.stdout.write(shasum.digest('hex'));
//# sourceMappingURL=computeBuiltInDepsCacheKey.js.map