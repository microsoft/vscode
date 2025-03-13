"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sign_1 = require("./sign");
const path_1 = __importDefault(require("path"));
(0, sign_1.main)([
    process.env['EsrpCliDllPath'],
    'sign-windows',
    path_1.default.dirname(process.argv[2]),
    path_1.default.basename(process.argv[2])
]);
//# sourceMappingURL=sign-win32.js.map