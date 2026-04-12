"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// Utilities copied from ts.JsTyping internals
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePackageNameWorker = validatePackageNameWorker;
var CharacterCodes;
(function (CharacterCodes) {
    CharacterCodes[CharacterCodes["_"] = 95] = "_";
    CharacterCodes[CharacterCodes["dot"] = 46] = "dot";
})(CharacterCodes || (CharacterCodes = {}));
const maxPackageNameLength = 214;
function validatePackageNameWorker(packageName, supportScopedPackage) {
    if (!packageName) {
        return 1 /* NameValidationResult.EmptyName */;
    }
    if (packageName.length > maxPackageNameLength) {
        return 2 /* NameValidationResult.NameTooLong */;
    }
    if (packageName.charCodeAt(0) === CharacterCodes.dot) {
        return 3 /* NameValidationResult.NameStartsWithDot */;
    }
    if (packageName.charCodeAt(0) === CharacterCodes._) {
        return 4 /* NameValidationResult.NameStartsWithUnderscore */;
    }
    // check if name is scope package like: starts with @ and has one '/' in the middle
    // scoped packages are not currently supported
    if (supportScopedPackage) {
        const matches = /^@([^/]+)\/([^/]+)$/.exec(packageName);
        if (matches) {
            const scopeResult = validatePackageNameWorker(matches[1], /*supportScopedPackage*/ false);
            if (scopeResult !== 0 /* NameValidationResult.Ok */) {
                return { name: matches[1], isScopeName: true, result: scopeResult };
            }
            const packageResult = validatePackageNameWorker(matches[2], /*supportScopedPackage*/ false);
            if (packageResult !== 0 /* NameValidationResult.Ok */) {
                return { name: matches[2], isScopeName: false, result: packageResult };
            }
            return 0 /* NameValidationResult.Ok */;
        }
    }
    if (encodeURIComponent(packageName) !== packageName) {
        return 5 /* NameValidationResult.NameContainsNonURISafeCharacters */;
    }
    return 0 /* NameValidationResult.Ok */;
}
//# sourceMappingURL=jsTyping.js.map