"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const code_1 = require("./code");
const code_tunnel_1 = __importDefault(require("./code-tunnel"));
const codeTunnelInsidersCompletionSpec = {
    ...code_tunnel_1.default,
    name: 'code-tunnel-insiders',
    description: 'Visual Studio Code Insiders',
    subcommands: [...code_1.codeTunnelSubcommands, code_1.extTunnelSubcommand],
    options: [
        ...code_1.commonOptions,
        ...(0, code_1.extensionManagementOptions)('code-tunnel-insiders'),
        ...(0, code_1.troubleshootingOptions)('code-tunnel-insiders'),
        ...code_1.globalTunnelOptions,
        ...code_1.codeTunnelOptions,
    ]
};
exports.default = codeTunnelInsidersCompletionSpec;
//# sourceMappingURL=code-tunnel-insiders.js.map