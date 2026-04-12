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
exports.TsConfigProvider = void 0;
const vscode = __importStar(require("vscode"));
class TsConfigProvider {
    async getConfigsForWorkspace(token) {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        const configs = new Map();
        for (const config of await this.findConfigFiles(token)) {
            const root = vscode.workspace.getWorkspaceFolder(config);
            if (root) {
                configs.set(config.fsPath, {
                    uri: config,
                    fsPath: config.fsPath,
                    posixPath: config.path,
                    workspaceFolder: root
                });
            }
        }
        return configs.values();
    }
    async findConfigFiles(token) {
        return await vscode.workspace.findFiles('**/tsconfig*.json', '**/{node_modules,.*}/**', undefined, token);
    }
}
exports.TsConfigProvider = TsConfigProvider;
//# sourceMappingURL=tsconfigProvider.js.map