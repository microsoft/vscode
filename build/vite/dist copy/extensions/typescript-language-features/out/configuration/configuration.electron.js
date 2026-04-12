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
exports.ElectronServiceConfigurationProvider = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const configuration_1 = require("./configuration");
const relativePathResolver_1 = require("../utils/relativePathResolver");
class ElectronServiceConfigurationProvider extends configuration_1.BaseServiceConfigurationProvider {
    fixPathPrefixes(inspectValue) {
        const pathPrefixes = ['~' + path.sep];
        for (const pathPrefix of pathPrefixes) {
            if (inspectValue.startsWith(pathPrefix)) {
                return path.join(os.homedir(), inspectValue.slice(pathPrefix.length));
            }
        }
        return inspectValue;
    }
    readGlobalTsdk(configuration) {
        const unifiedInspect = configuration.inspect('js/ts.tsdk.path');
        if (unifiedInspect && typeof unifiedInspect.globalValue === 'string') {
            return this.fixPathPrefixes(unifiedInspect.globalValue);
        }
        const inspect = configuration.inspect('typescript.tsdk');
        if (inspect && typeof inspect.globalValue === 'string') {
            return this.fixPathPrefixes(inspect.globalValue);
        }
        return null;
    }
    readLocalTsdk(configuration) {
        const unifiedInspect = configuration.inspect('js/ts.tsdk.path');
        if (unifiedInspect && typeof unifiedInspect.workspaceValue === 'string') {
            return this.fixPathPrefixes(unifiedInspect.workspaceValue);
        }
        const inspect = configuration.inspect('typescript.tsdk');
        if (inspect && typeof inspect.workspaceValue === 'string') {
            return this.fixPathPrefixes(inspect.workspaceValue);
        }
        return null;
    }
    readLocalNodePath(configuration) {
        return this.validatePath(this.readLocalNodePathWorker(configuration));
    }
    readLocalNodePathWorker(configuration) {
        const unifiedInspect = configuration.inspect('js/ts.tsserver.node.path');
        const inspect = (unifiedInspect?.workspaceValue && typeof unifiedInspect.workspaceValue === 'string')
            ? unifiedInspect
            : configuration.inspect('typescript.tsserver.nodePath');
        if (inspect?.workspaceValue && typeof inspect.workspaceValue === 'string') {
            if (inspect.workspaceValue === 'node') {
                return this.findNodePath();
            }
            const fixedPath = this.fixPathPrefixes(inspect.workspaceValue);
            if (!path.isAbsolute(fixedPath)) {
                const workspacePath = relativePathResolver_1.RelativeWorkspacePathResolver.asAbsoluteWorkspacePath(fixedPath);
                return workspacePath || null;
            }
            return fixedPath;
        }
        return null;
    }
    readGlobalNodePath(configuration) {
        return this.validatePath(this.readGlobalNodePathWorker(configuration));
    }
    readGlobalNodePathWorker(configuration) {
        const unifiedInspect = configuration.inspect('js/ts.tsserver.node.path');
        const inspect = (unifiedInspect?.globalValue && typeof unifiedInspect.globalValue === 'string')
            ? unifiedInspect
            : configuration.inspect('typescript.tsserver.nodePath');
        if (inspect?.globalValue && typeof inspect.globalValue === 'string') {
            if (inspect.globalValue === 'node') {
                return this.findNodePath();
            }
            const fixedPath = this.fixPathPrefixes(inspect.globalValue);
            if (path.isAbsolute(fixedPath)) {
                return fixedPath;
            }
        }
        return null;
    }
    findNodePath() {
        try {
            const out = child_process.execFileSync('node', ['-e', 'console.log(process.execPath)'], {
                windowsHide: true,
                timeout: 2000,
                cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
                encoding: 'utf-8',
            });
            return out.trim();
        }
        catch (error) {
            vscode.window.showWarningMessage(vscode.l10n.t("Could not detect a Node installation to run TS Server."));
            return null;
        }
    }
    validatePath(nodePath) {
        if (nodePath && (!fs.existsSync(nodePath) || fs.lstatSync(nodePath).isDirectory())) {
            vscode.window.showWarningMessage(vscode.l10n.t("The path {0} doesn\'t point to a valid Node installation to run TS Server. Falling back to bundled Node.", nodePath));
            return null;
        }
        return nodePath;
    }
}
exports.ElectronServiceConfigurationProvider = ElectronServiceConfigurationProvider;
//# sourceMappingURL=configuration.electron.js.map