"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeTunnelInsidersTestSuite = exports.codeInsidersTestSuite = void 0;
const code_insiders_1 = __importDefault(require("../../completions/code-insiders"));
const code_tunnel_insiders_1 = __importDefault(require("../../completions/code-tunnel-insiders"));
const code_test_1 = require("./code.test");
exports.codeInsidersTestSuite = {
    name: 'code-insiders',
    completionSpecs: code_insiders_1.default,
    availableCommands: 'code-insiders',
    testSpecs: (0, code_test_1.createCodeTestSpecs)('code-insiders')
};
exports.codeTunnelInsidersTestSuite = {
    name: 'code-tunnel-insiders',
    completionSpecs: code_tunnel_insiders_1.default,
    availableCommands: 'code-tunnel-insiders',
    testSpecs: (0, code_test_1.createCodeTunnelTestSpecs)('code-tunnel-insiders')
};
//# sourceMappingURL=code-insiders.test.js.map