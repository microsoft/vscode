"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargetStringFromTsConfig = getTargetStringFromTsConfig;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path_1 = require("path");
const typescript_1 = __importDefault(require("typescript"));
/**
 * Get the target (e.g. 'ES2024') from a tsconfig.json file.
 */
function getTargetStringFromTsConfig(configFilePath) {
    const parsed = typescript_1.default.readConfigFile(configFilePath, typescript_1.default.sys.readFile);
    if (parsed.error) {
        throw new Error(`Cannot determine target from ${configFilePath}. TS error: ${parsed.error.messageText}`);
    }
    const cmdLine = typescript_1.default.parseJsonConfigFileContent(parsed.config, typescript_1.default.sys, (0, path_1.dirname)(configFilePath), {});
    const resolved = typeof cmdLine.options.target !== 'undefined' ? typescript_1.default.ScriptTarget[cmdLine.options.target] : undefined;
    if (!resolved) {
        throw new Error(`Could not resolve target in ${configFilePath}`);
    }
    return resolved;
}
//# sourceMappingURL=tsconfigUtils.js.map