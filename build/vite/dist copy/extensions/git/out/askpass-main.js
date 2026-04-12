"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
const fs = __importStar(require("fs"));
const ipcClient_1 = require("./ipc/ipcClient");
function fatal(err) {
    console.error('Missing or invalid credentials.');
    console.error(err);
    process.exit(1);
}
function main(argv) {
    if (!process.env['VSCODE_GIT_ASKPASS_PIPE']) {
        return fatal('Missing pipe');
    }
    if (!process.env['VSCODE_GIT_ASKPASS_TYPE']) {
        return fatal('Missing type');
    }
    if (process.env['VSCODE_GIT_ASKPASS_TYPE'] !== 'https' && process.env['VSCODE_GIT_ASKPASS_TYPE'] !== 'ssh') {
        return fatal(`Invalid type: ${process.env['VSCODE_GIT_ASKPASS_TYPE']}`);
    }
    if (process.env['VSCODE_GIT_COMMAND'] === 'fetch' && !!process.env['VSCODE_GIT_FETCH_SILENT']) {
        return fatal('Skip silent fetch commands');
    }
    const output = process.env['VSCODE_GIT_ASKPASS_PIPE'];
    const askpassType = process.env['VSCODE_GIT_ASKPASS_TYPE'];
    const ipcClient = new ipcClient_1.IPCClient('askpass');
    ipcClient.call({ askpassType, argv })
        .then(res => {
        fs.writeFileSync(output, res + '\n');
        setTimeout(() => process.exit(0), 0);
    }).catch(err => fatal(err));
}
main(process.argv);
//# sourceMappingURL=askpass-main.js.map