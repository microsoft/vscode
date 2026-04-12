"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseKindModifier = parseKindModifier;
function parseKindModifier(kindModifiers) {
    return new Set(kindModifiers.split(/,|\s+/g));
}
//# sourceMappingURL=modifiers.js.map