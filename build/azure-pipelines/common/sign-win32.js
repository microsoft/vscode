"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const sign_1 = require("./sign");
const path = require("path");
(0, sign_1.main)([
    process.env['EsrpCliDllPath'],
    'sign-windows',
    path.dirname(process.argv[2]),
    path.basename(process.argv[2])
]);
//# sourceMappingURL=sign-win32.js.map