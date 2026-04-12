"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecLocationSource = void 0;
exports.makeArray = makeArray;
function makeArray(object) {
    return Array.isArray(object) ? object : [object];
}
var SpecLocationSource;
(function (SpecLocationSource) {
    SpecLocationSource["GLOBAL"] = "global";
    SpecLocationSource["LOCAL"] = "local";
})(SpecLocationSource || (exports.SpecLocationSource = SpecLocationSource = {}));
//# sourceMappingURL=utils.js.map