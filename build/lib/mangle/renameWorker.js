"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const workerpool_1 = __importDefault(require("workerpool"));
const staticLanguageServiceHost_1 = require("./staticLanguageServiceHost");
let service;
function findRenameLocations(projectPath, fileName, position) {
    if (!service) {
        service = typescript_1.default.createLanguageService(new staticLanguageServiceHost_1.StaticLanguageServiceHost(projectPath));
    }
    return service.findRenameLocations(fileName, position, false, false, {
        providePrefixAndSuffixTextForRename: true,
    }) ?? [];
}
workerpool_1.default.worker({
    findRenameLocations
});
//# sourceMappingURL=renameWorker.js.map