"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeTunnelSpecOptions = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const code_1 = __importStar(require("./code"));
exports.codeTunnelSpecOptions = [
    {
        name: '--cli-data-dir',
        description: 'Directory where CLI metadata should be stored',
        isRepeatable: true,
        args: {
            name: 'cli_data_dir',
            isOptional: true,
        },
    },
    {
        name: '--log-to-file',
        description: 'Log to a file in addition to stdout. Used when running as a service',
        hidden: true,
        isRepeatable: true,
        args: {
            name: 'log_to_file',
            isOptional: true,
            template: 'filepaths',
        },
    },
    {
        name: '--log',
        description: 'Log level to use',
        isRepeatable: true,
        args: {
            name: 'log',
            isOptional: true,
            suggestions: [
                'trace',
                'debug',
                'info',
                'warn',
                'error',
                'critical',
                'off',
            ],
        },
    },
    {
        name: '--telemetry-level',
        description: 'Sets the initial telemetry level',
        hidden: true,
        isRepeatable: true,
        args: {
            name: 'telemetry_level',
            isOptional: true,
            suggestions: [
                'off',
                'crash',
                'error',
                'all',
            ],
        },
    },
    {
        name: '--verbose',
        description: 'Print verbose output (implies --wait)',
    },
    {
        name: '--disable-telemetry',
        description: 'Disable telemetry for the current command, even if it was previously accepted as part of the license prompt or specified in \'--telemetry-level\'',
    },
    {
        name: ['-h', '--help'],
        description: 'Print help',
    },
];
const codeTunnelCompletionSpec = {
    ...code_1.default,
    name: 'code-tunnel',
    subcommands: [
        ...code_1.codeTunnelSubcommands,
        code_1.extTunnelSubcommand
    ],
    options: [
        ...code_1.commonOptions,
        ...(0, code_1.extensionManagementOptions)('code-tunnel'),
        ...(0, code_1.troubleshootingOptions)('code-tunnel'),
        ...code_1.globalTunnelOptions,
        ...code_1.codeTunnelOptions,
    ]
};
exports.default = codeTunnelCompletionSpec;
//# sourceMappingURL=code-tunnel.js.map