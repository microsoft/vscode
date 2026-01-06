"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const productjson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../../../product.json'), 'utf8'));
const shasum = crypto_1.default.createHash('sha256');
for (const ext of productjson.builtInExtensions) {
    shasum.update(`${ext.name}@${ext.version}`);
}
process.stdout.write(shasum.digest('hex'));
//# sourceMappingURL=computeBuiltInDepsCacheKey.js.map